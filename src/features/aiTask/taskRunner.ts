import { applyAutoLabelResult } from '../../services/autoLabel/applyAutoLabelResult';
import {
  predictBatchLabelingServer,
  inferenceContextToPredictParams,
} from '../../services/autoLabel/labelingServerClient';
import {
  createTask as createServerTaskApi,
  startTask as startServerTaskApi,
  finishTask as finishServerTaskApi,
} from '../../services/autoLabel/labelingServerTaskApi';
import { predictionToRemoteShapes } from '../../services/autoLabel/detectionConverter';
import { imageFileToUploadFile } from '../../services/autoLabel/imageEncode';
import { resolveLabelingServerUrl } from '../../services/autoLabel/resolveServerUrl';
import { resolveInferenceContextFromSnapshot, validateInferenceContext } from '../ai';
import { useAiStore } from '@/store/useAiStore';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useAiTaskStore } from '@/store/useAiTaskStore';
import { chunkArray, runTaskQueue } from './taskQueue';
import {
  isActiveAiTaskStatus,
  isTerminalAiTaskStatus,
} from './serverTaskMapper';
import {
  evaluateTaskRecovery,
  getCompletedOffset,
  isRefreshOrphanedRunningTask,
  validateTaskModelAvailable,
} from './taskRecovery';
import type { AiTaskRecord, AiTaskRunResult, AiTaskStatus, AiTaskWorkerItem } from './types';
import { MAX_AI_TASK_RETRIES } from './types-core';

export interface ContinueTaskResult {
  started: boolean;
  message?: string;
}

class TaskControl {
  private paused = false;
  private cancelled = false;
  private pauseWaiters: Array<() => void> = [];

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const waiters = this.pauseWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  cancel() {
    this.cancelled = true;
    this.resume();
  }

  isPaused() {
    return this.paused;
  }

  isCancelled() {
    return this.cancelled;
  }

  waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => {
      this.pauseWaiters.push(resolve);
    });
  }
}

const activeControls = new Map<string, TaskControl>();
const runningTasks = new Map<string, Promise<AiTaskRunResult>>();
const inFlightBatches = new Map<string, Promise<unknown>>();
const continuingTasks = new Map<string, Promise<ContinueTaskResult>>();

function emptyRunResult(cancelled = false): AiTaskRunResult {
  return { processed: 0, success: 0, failed: 0, objects: 0, cancelled };
}

function shouldStopTaskRunner(status: AiTaskStatus | undefined): boolean {
  return !status || isTerminalAiTaskStatus(status);
}

export function pauseAiTask(taskId: string) {
  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task || shouldStopTaskRunner(task.status) || task.status !== 'running') return;
  const control = activeControls.get(taskId);
  control?.pause();
  void useAiTaskStore.getState().pauseTask(taskId).catch(() => undefined);
}

export function resumeAiTask(taskId: string): Promise<AiTaskRunResult | void> {
  const control = activeControls.get(taskId);
  if (control) {
    control.resume();
    void useAiTaskStore.getState().resumeTask(taskId).catch(() => undefined);
    return Promise.resolve();
  }

  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task || shouldStopTaskRunner(task.status)) {
    return Promise.resolve();
  }
  if (runningTasks.has(taskId)) {
    return runningTasks.get(taskId)!;
  }

  useAiTaskStore.getState().setTaskStatus(taskId, 'running');
  return runAiTask(taskId);
}

export function cancelAiTask(taskId: string) {
  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task || shouldStopTaskRunner(task.status)) return;
  const control = activeControls.get(taskId);
  control?.cancel();
  void useAiTaskStore.getState().cancelTask(taskId).catch(() => undefined);
}

export async function refreshAiTaskStatus(taskId: string): Promise<void> {
  await useAiTaskStore.getState().fetchTask(taskId);
  useAiTaskStore.getState().ensurePolling();
}

export function abandonAiTask(taskId: string): void {
  cancelAiTask(taskId);
}

export function continueAiTask(taskId: string): Promise<ContinueTaskResult> {
  const existing = continuingTasks.get(taskId);
  if (existing) {
    return existing;
  }

  const promise = continueAiTaskInternal(taskId).finally(() => {
    continuingTasks.delete(taskId);
  });
  continuingTasks.set(taskId, promise);
  return promise;
}

async function continueAiTaskInternal(taskId: string): Promise<ContinueTaskResult> {
  const store = useAiTaskStore.getState();
  const task = store.getTask(taskId);

  if (runningTasks.has(taskId)) {
    return { started: false, message: '任务正在执行' };
  }

  const orphaned = task ? isOrphanedRunningTask(task, taskId) : false;
  const recovery = evaluateTaskRecovery(task);
  if (!orphaned && !recovery.canContinue) {
    return { started: false, message: recovery.message };
  }

  if (task?.serverTaskId && inFlightBatches.has(task.serverTaskId)) {
    return { started: false, message: '批次正在服务端执行，请等待' };
  }

  if (!task) {
    return { started: false, message: '任务不存在' };
  }

  const modelAvailable = await validateTaskModelAvailable(task);
  if (!modelAvailable) {
    const message = '任务使用的模型已不存在，请重新选择模型。';
    store.updateTask(taskId, { error: message });
    return { started: false, message };
  }

  if (task.serverTaskId) {
    await store.fetchTask(taskId);
  }

  const refreshed = store.getTask(taskId);
  if (!refreshed) {
    return { started: false, message: '任务不存在' };
  }

  if (isTerminalAiTaskStatus(refreshed.status)) {
    const terminalMessage =
      refreshed.status === 'completed'
        ? '任务已完成'
        : refreshed.status === 'cancelled'
          ? '任务已取消'
          : '任务已失败';
    return { started: false, message: terminalMessage };
  }

  const stillOrphaned = isOrphanedRunningTask(refreshed, taskId);

  if (refreshed.status === 'running' && !stillOrphaned) {
    store.ensurePolling();
    return {
      started: false,
      message: '任务当前正在服务端执行，请等待状态同步',
    };
  }

  store.ensurePolling();

  try {
    if (!stillOrphaned) {
      if (refreshed.status === 'pending' && refreshed.serverTaskId) {
        const ai = useAiStore.getState();
        const serverUrl = await resolveLabelingServerUrl(
          ai.serverUrl,
          Math.min(ai.timeoutSec, 10)
        );
        await startServerTaskApi({
          serverUrl,
          timeoutSec: ai.timeoutSec,
          taskId: refreshed.serverTaskId,
        });
        await store.fetchTask(taskId);
      } else if (refreshed.status === 'paused' && refreshed.serverTaskId) {
        await store.resumeTask(taskId);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '无法恢复任务';
    store.updateTask(taskId, { error: message });
    return { started: false, message };
  }

  const latest = store.getTask(taskId);
  if (!latest || isTerminalAiTaskStatus(latest.status)) {
    return { started: false, message: '任务状态已变更，请刷新后查看' };
  }
  if (
    latest.status === 'running' &&
    !runningTasks.has(taskId) &&
    !isOrphanedRunningTask(latest, taskId)
  ) {
    return {
      started: false,
      message: '任务当前正在服务端执行，请等待状态同步',
    };
  }

  await runAiTask(taskId);
  return { started: true };
}

function buildWorkerItems(taskId: string): AiTaskWorkerItem[] {
  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task) return [];
  const imageMap = new Map(
    useAnnotationStore.getState().imageList.map((image) => [image.id, image])
  );
  return task.imageIds
    .map((imageId) => {
      const image = imageMap.get(imageId);
      if (!image) return null;
      return { imageId, imageName: image.name };
    })
    .filter((item): item is AiTaskWorkerItem => item !== null);
}

export function runAiTask(taskId: string): Promise<AiTaskRunResult> {
  const existing = runningTasks.get(taskId);
  if (existing) {
    return existing;
  }

  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task) {
    throw new Error('任务不存在');
  }
  if (shouldStopTaskRunner(task.status)) {
    return Promise.resolve(emptyRunResult(task.status === 'cancelled'));
  }

  const runPromise = (async () => {
    try {
      return await executeAiTask(taskId);
    } finally {
      runningTasks.delete(taskId);
    }
  })();
  runningTasks.set(taskId, runPromise);
  return runPromise;
}

async function executeAiTask(taskId: string): Promise<AiTaskRunResult> {
  const task = useAiTaskStore.getState().getTask(taskId);
  if (!task) {
    throw new Error('任务不存在');
  }
  if (shouldStopTaskRunner(task.status)) {
    return emptyRunResult(task.status === 'cancelled');
  }

  const control = new TaskControl();
  activeControls.set(taskId, control);

  const ai = useAiStore.getState();
  ai.setPredicting(true);
  useAiTaskStore.getState().setTaskStatus(taskId, 'running');
  useAiTaskStore.getState().ensurePolling();

  const inference = resolveInferenceContextFromSnapshot(task.modelSnapshot);
  validateInferenceContext(inference, { strictModel: false });

  const result: AiTaskRunResult = {
    processed: 0,
    success: 0,
    failed: 0,
    objects: 0,
    cancelled: false,
  };

  try {
    const serverUrl = await resolveLabelingServerUrl(
      ai.serverUrl,
      Math.min(ai.timeoutSec, 10)
    );
    if (serverUrl !== ai.serverUrl) {
      useAiStore.getState().setServerUrl(serverUrl);
    }

    let serverTaskId: string | null = task.serverTaskId;
    if (!serverTaskId) {
      const created = await createServerTaskApi({
        serverUrl,
        timeoutSec: ai.timeoutSec,
        modelName: inference.modelId,
        total: task.progress.total,
        confidence: inference.confidence,
        iou: inference.iou,
      });
      serverTaskId = created.task_id;
      useAiTaskStore.getState().updateTask(taskId, { serverTaskId });
      await startServerTaskApi({
        serverUrl,
        timeoutSec: ai.timeoutSec,
        taskId: serverTaskId,
      });
      void useAiTaskStore.getState().fetchTask(taskId);
    }

    const workerItems = buildWorkerItems(taskId);
    const completedOffset = getCompletedOffset(
      useAiTaskStore.getState().getTask(taskId) ?? task,
      workerItems.length
    );
    const pendingItems = workerItems.slice(completedOffset);
    const batchSize = Math.max(1, task.concurrency);
    const batches = chunkArray(pendingItems, batchSize);
    const parallelBatches = serverTaskId
      ? 1
      : Math.max(1, Math.min(2, Math.ceil(task.concurrency / batchSize) || 1));
    const batchMaxRetries = serverTaskId ? 0 : MAX_AI_TASK_RETRIES;

    await runTaskQueue({
      items: batches,
      concurrency: parallelBatches,
      maxRetries: batchMaxRetries,
      control,
      onItemStart: (batch) => {
        const first = batch[0];
        useAiTaskStore.getState().updateTaskProgress(taskId, {
          currentImageId: first?.imageId ?? null,
          currentImageName: first?.imageName ?? null,
        });
      },
      worker: async (batch) => {
        if (control.isCancelled()) return;
        await control.waitIfPaused();
        if (control.isCancelled()) return;

        const store = useAiTaskStore.getState();
        const current = store.getTask(taskId);
        if (!current || shouldStopTaskRunner(current.status)) {
          control.cancel();
          return;
        }

        if (!serverTaskId) return;

        if (inFlightBatches.has(serverTaskId)) {
          return;
        }

        const imageMap = new Map(
          useAnnotationStore.getState().imageList.map((image) => [image.id, image])
        );
        const files: { imageId: string; file: File }[] = [];
        for (const item of batch) {
          const image = imageMap.get(item.imageId);
          if (!image) throw new Error(`图片不存在: ${item.imageName}`);
          const file = await imageFileToUploadFile(image);
          files.push({ imageId: item.imageId, file });
        }

        const batchPromise = predictBatchLabelingServer({
          serverUrl,
          timeoutSec: ai.timeoutSec,
          params: inferenceContextToPredictParams(inference),
          imageFiles: files.map((entry) => entry.file),
          taskId: serverTaskId,
        });
        inFlightBatches.set(serverTaskId, batchPromise);

        let batchResult;
        try {
          batchResult = await batchPromise;
        } finally {
          inFlightBatches.delete(serverTaskId);
        }

        const synced = store.getTask(taskId);
        if (!synced || shouldStopTaskRunner(synced.status)) {
          control.cancel();
          return;
        }

        const resultByName = new Map(
          batchResult.results.map((item) => [item.imageName, item] as const)
        );

        for (const entry of files) {
          const itemResult =
            resultByName.get(entry.file.name) ??
            batchResult.results.find((item) => item.imageName === entry.file.name);
          if (!itemResult) {
            result.failed += 1;
            continue;
          }
          if (itemResult.error) {
            result.failed += 1;
            continue;
          }

          const shapes = predictionToRemoteShapes({
            model: batchResult.model,
            task: batchResult.task,
            export_formats: batchResult.export_formats,
            image_width: itemResult.image_width,
            image_height: itemResult.image_height,
            shapes: itemResult.shapes,
            detections: itemResult.detections,
          });

          const count = applyAutoLabelResult(
            entry.imageId,
            shapes,
            task.replaceExisting
          );
          result.processed += 1;
          if (count > 0) {
            result.success += 1;
            result.objects += count;
          }
        }

        const processedInBatch = batchResult.count;
        const afterBatch = store.getTask(taskId);
        const completed = (afterBatch?.progress.completed ?? 0) + processedInBatch;
        store.updateTaskProgress(taskId, {
          completed,
          success: result.success,
          failed: result.failed,
          objects: result.objects,
        });
      },
    });

    const finalTask = useAiTaskStore.getState().getTask(taskId);
    if (control.isCancelled() || finalTask?.status === 'cancelled') {
      result.cancelled = true;
      useAiTaskStore.getState().setTaskStatus(taskId, 'cancelled');
    } else if (finalTask?.status === 'paused') {
      // Keep paused; server batch already released the inference queue.
    } else if (shouldStopTaskRunner(finalTask?.status)) {
      if (finalTask?.status === 'failed') {
        throw new Error(finalTask.error ?? '任务执行失败');
      }
    } else {
      useAiTaskStore.getState().setTaskStatus(taskId, 'completed');
      if (serverTaskId) {
        try {
          await finishServerTaskApi({
            serverUrl,
            timeoutSec: ai.timeoutSec,
            taskId: serverTaskId,
          });
        } catch {
          // Polling will reconcile server state.
        }
      }
    }

    void useAiTaskStore.getState().fetchTasks();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : '任务执行失败';
    useAiTaskStore.getState().setTaskStatus(taskId, 'failed', message);
    throw err;
  } finally {
    activeControls.delete(taskId);
    useAiStore.getState().setPredicting(false);
    useAiTaskStore.getState().ensurePolling();
  }
}

export function hasRunningAiTask(): boolean {
  return useAiTaskStore
    .getState()
    .tasks.some((task) => isActiveAiTaskStatus(task.status));
}

export function isAiTaskRunningLocally(taskId: string): boolean {
  return runningTasks.has(taskId);
}

export function hasInFlightBatch(serverTaskId: string): boolean {
  return inFlightBatches.has(serverTaskId);
}

function isOrphanedRunningTask(task: AiTaskRecord, taskId: string): boolean {
  if (!isRefreshOrphanedRunningTask(task)) return false;
  if (runningTasks.has(taskId)) return false;
  const serverTaskId = task.serverTaskId;
  if (serverTaskId && inFlightBatches.has(serverTaskId)) return false;
  return true;
}
