import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import { generateId } from '../utils/id';
import { getDeviceId } from '../utils/deviceId';
import type { AiTaskCreateInput, AiTaskRecord, AiTaskStatus } from '../features/aiTask/types';
import { AI_TASK_STORAGE_KEY, DEFAULT_AI_TASK_CONCURRENCY } from '../features/aiTask/types-core';
import { filterRunnableImages, resolveTaskImageIds } from '../features/aiTask/imageScope';
import { normalizePersistedTasks } from '../features/aiTask/snapshotMigrate';
import {
  applyServerTaskToLocal,
  isActiveAiTaskStatus,
  isTerminalAiTaskStatus,
} from '../features/aiTask/serverTaskMapper';
import {
  detachTasksForDeviceChange,
  mergeServerTasksWithLocal,
} from '../features/aiTask/serverTaskSync';
import { TaskPollingManager } from '../features/aiTask/taskPolling';
import { canDeleteTask, syncProgressTimestamp } from '../features/aiTask/taskDisplay';
import { runGuardedTaskAction } from '../features/aiTask/taskActionGuard';
import {
  LabelingServerApiError,
  cancelTask as cancelServerTask,
  deleteTask as deleteServerTask,
  getTask as getServerTask,
  listTasks as listServerTasks,
  pauseTask as pauseServerTask,
  resumeTask as resumeServerTask,
} from '../services/autoLabel/labelingServerTaskApi';
import { resolveLabelingServerUrl } from '../services/autoLabel/resolveServerUrl';
import { useAiStore } from './ai';

interface PersistedAiTaskState {
  tasks: AiTaskRecord[];
  activeTaskId: string | null;
  syncedDeviceId?: string;
}

const taskPolling = new TaskPollingManager();

function emptyProgress() {
  return {
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
    objects: 0,
    currentImageId: null,
    currentImageName: null,
  };
}

function readPersisted(): PersistedAiTaskState {
  try {
    const raw = localStorage.getItem(AI_TASK_STORAGE_KEY);
    if (!raw) return { tasks: [], activeTaskId: null };
    const data = JSON.parse(raw) as PersistedAiTaskState;
    const normalized = normalizePersistedTasks(
      data.tasks ?? [],
      data.activeTaskId ?? null
    );
    return {
      tasks: normalized.tasks,
      activeTaskId: normalized.activeTaskId,
      syncedDeviceId: data.syncedDeviceId,
    };
  } catch {
    return { tasks: [], activeTaskId: null };
  }
}

function writePersisted(state: PersistedAiTaskState) {
  try {
    localStorage.setItem(AI_TASK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

async function resolveServerOptions() {
  const ai = useAiStore.getState();
  const serverUrl = await resolveLabelingServerUrl(
    ai.serverUrl,
    Math.min(ai.timeoutSec, 10)
  );
  if (serverUrl !== ai.serverUrl) {
    ai.setServerUrl(serverUrl);
  }
  return { serverUrl, timeoutSec: ai.timeoutSec };
}

function findLocalTaskId(
  tasks: AiTaskRecord[],
  taskId: string
): AiTaskRecord | undefined {
  return tasks.find((task) => task.id === taskId || task.serverTaskId === taskId);
}

interface AiTaskStore {
  tasks: AiTaskRecord[];
  activeTaskId: string | null;
  modalOpen: boolean;
  progressOpen: boolean;
  loading: boolean;
  error: string | null;
  syncError: string | null;
  syncedDeviceId: string | null;

  setModalOpen: (open: boolean) => void;
  setProgressOpen: (open: boolean) => void;
  createTask: (input: AiTaskCreateInput) => AiTaskRecord | null;
  setActiveTask: (taskId: string | null) => void;
  updateTask: (taskId: string, patch: Partial<AiTaskRecord>) => void;
  updateTaskProgress: (
    taskId: string,
    patch: Partial<AiTaskRecord['progress']>
  ) => void;
  setTaskStatus: (taskId: string, status: AiTaskStatus, error?: string) => void;
  getTask: (taskId: string) => AiTaskRecord | undefined;
  getActiveTask: () => AiTaskRecord | undefined;
  fetchTasks: () => Promise<void>;
  fetchTask: (taskId: string) => Promise<void>;
  refreshTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  clearFinishedTasks: () => Promise<void>;
  ensurePolling: () => void;
  stopPolling: () => void;
}

const persisted = readPersisted();

const useAiTaskStoreVanilla = create<AiTaskStore>((set, get) => ({
  tasks: persisted.tasks,
  activeTaskId: persisted.activeTaskId,
  modalOpen: false,
  progressOpen: false,
  loading: false,
  error: null,
  syncError: null,
  syncedDeviceId: persisted.syncedDeviceId ?? null,

  setModalOpen: (open) => set({ modalOpen: open }),

  setProgressOpen: (open) => set({ progressOpen: open }),

  createTask: (input) => {
    const images = filterRunnableImages(
      resolveTaskImageIds(input.imageScope, {
        range: input.imageRange,
      })
    );
    if (images.length === 0) return null;

    const snapshot = input.modelSnapshot;
    const now = Date.now();
    const deviceId = getDeviceId();
    const rangeFields =
      input.imageScope === 'range' && input.imageRange
        ? {
            imageRangeStart: input.imageRange.start,
            imageRangeEnd: input.imageRange.end,
          }
        : {};
    const task: AiTaskRecord = {
      id: generateId(),
      serverTaskId: null,
      deviceId,
      modelId: snapshot.model.id,
      modelName: snapshot.model.name,
      modelSnapshot: snapshot,
      imageScope: input.imageScope,
      ...rangeFields,
      imageIds: images.map((image) => image.id),
      status: 'pending',
      confidence: snapshot.config.confidence,
      iou: snapshot.config.iou,
      concurrency: input.concurrency || DEFAULT_AI_TASK_CONCURRENCY,
      replaceExisting: input.replaceExisting,
      progress: {
        ...emptyProgress(),
        total: images.length,
      },
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      error: null,
      lastProgressAt: now,
      lastProgressCompleted: 0,
    };

    set((state) => {
      const tasks = [task, ...state.tasks].slice(0, 50);
      writePersisted({
        tasks,
        activeTaskId: task.id,
        syncedDeviceId: deviceId,
      });
      return { tasks, activeTaskId: task.id, progressOpen: true, syncedDeviceId: deviceId };
    });
    return task;
  },

  setActiveTask: (taskId) => {
    set({ activeTaskId: taskId });
    writePersisted({
      tasks: get().tasks,
      activeTaskId: taskId,
      syncedDeviceId: get().syncedDeviceId,
    });
  },

  updateTask: (taskId, patch) => {
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, ...patch, updatedAt: Date.now() }
          : task
      );
      writePersisted({
        tasks,
        activeTaskId: state.activeTaskId,
        syncedDeviceId: state.syncedDeviceId,
      });
      return { tasks };
    });
  },

  updateTaskProgress: (taskId, patch) => {
    set((state) => {
      const tasks = state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const progress = { ...task.progress, ...patch };
        const progressMeta =
          patch.completed !== undefined
            ? syncProgressTimestamp(
                { ...task, progress },
                progress.completed
              )
            : {};
        return {
          ...task,
          progress,
          ...progressMeta,
          updatedAt: Date.now(),
        };
      });
      writePersisted({
        tasks,
        activeTaskId: state.activeTaskId,
        syncedDeviceId: state.syncedDeviceId,
      });
      return { tasks };
    });
  },

  setTaskStatus: (taskId, status, error) => {
    set((state) => {
      const tasks = state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          status,
          error: error ?? task.error,
          finishedAt:
            status === 'completed' ||
            status === 'cancelled' ||
            status === 'failed'
              ? Date.now()
              : task.finishedAt,
          updatedAt: Date.now(),
        };
      });
      writePersisted({
        tasks,
        activeTaskId: state.activeTaskId,
        syncedDeviceId: state.syncedDeviceId,
      });
      return { tasks };
    });
    get().ensurePolling();
  },

  getTask: (taskId) => findLocalTaskId(get().tasks, taskId),

  getActiveTask: () => {
    const { activeTaskId, tasks } = get();
    if (!activeTaskId) return undefined;
    return tasks.find((task) => task.id === activeTaskId);
  },

  fetchTasks: async () => {
    const deviceId = getDeviceId();
    set({ loading: true, error: null });

    let detached = detachTasksForDeviceChange(get().tasks, deviceId);
    if (get().syncedDeviceId && get().syncedDeviceId !== deviceId) {
      detached = detachTasksForDeviceChange(detached, deviceId);
    }

    try {
      const options = await resolveServerOptions();
      const serverTasks = await listServerTasks(options);
      const merged = mergeServerTasksWithLocal(detached, serverTasks, deviceId);
      set({
        tasks: merged,
        loading: false,
        syncError: null,
        syncedDeviceId: deviceId,
      });
      writePersisted({
        tasks: merged,
        activeTaskId: get().activeTaskId,
        syncedDeviceId: deviceId,
      });
      get().ensurePolling();
    } catch (err) {
      set({
        tasks: detached,
        loading: false,
        syncError:
          err instanceof Error ? err.message : '任务服务暂时不可用',
        syncedDeviceId: deviceId,
      });
      writePersisted({
        tasks: detached,
        activeTaskId: get().activeTaskId,
        syncedDeviceId: deviceId,
      });
    }
  },

  fetchTask: async (taskId) => {
    const local = get().getTask(taskId);
    const serverTaskId = local?.serverTaskId ?? taskId;
    try {
      const options = await resolveServerOptions();
      const server = await getServerTask({ ...options, taskId: serverTaskId });
      set((state) => {
        const existing = findLocalTaskId(state.tasks, taskId);
        const tasks = existing
          ? state.tasks.map((task) =>
              task.id === existing.id
                ? applyServerTaskToLocal(task, server)
                : task
            )
          : state.tasks;
        writePersisted({
          tasks,
          activeTaskId: state.activeTaskId,
          syncedDeviceId: getDeviceId(),
        });
        return { tasks, syncError: null };
      });
      get().ensurePolling();
    } catch (err) {
      if (err instanceof LabelingServerApiError && err.status === 404) {
        set({ error: err.message });
      } else {
        set({
          syncError:
            err instanceof Error ? err.message : '任务服务暂时不可用',
        });
      }
    }
  },

  refreshTask: async (taskId) => {
    await get().fetchTask(taskId);
  },

  pauseTask: async (taskId) => {
    const task = get().getTask(taskId);
    if (!task) return;
    if (isTerminalAiTaskStatus(task.status)) return;
    if (task.status !== 'running') return;
    return runGuardedTaskAction(`pause:${taskId}`, async () => {
      get().setTaskStatus(taskId, 'paused');
      if (!task.serverTaskId) return;
      try {
        const options = await resolveServerOptions();
        const server = await pauseServerTask({
          ...options,
          taskId: task.serverTaskId,
        });
        set((state) => {
          const tasks = state.tasks.map((item) =>
            item.id === task.id ? applyServerTaskToLocal(item, server) : item
          );
          writePersisted({
            tasks,
            activeTaskId: state.activeTaskId,
            syncedDeviceId: state.syncedDeviceId,
          });
          return { tasks, error: null };
        });
      } catch (err) {
        const message =
          err instanceof LabelingServerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '暂停任务失败';
        set({ error: message });
        throw err;
      }
    });
  },

  resumeTask: async (taskId) => {
    const task = get().getTask(taskId);
    if (!task) return;
    if (isTerminalAiTaskStatus(task.status)) return;
    if (task.status !== 'paused') return;
    return runGuardedTaskAction(`resume:${taskId}`, async () => {
      get().setTaskStatus(taskId, 'running');
      if (!task.serverTaskId) return;
      try {
        const options = await resolveServerOptions();
        const server = await resumeServerTask({
          ...options,
          taskId: task.serverTaskId,
        });
        set((state) => {
          const tasks = state.tasks.map((item) =>
            item.id === task.id ? applyServerTaskToLocal(item, server) : item
          );
          writePersisted({
            tasks,
            activeTaskId: state.activeTaskId,
            syncedDeviceId: state.syncedDeviceId,
          });
          return { tasks, error: null };
        });
        get().ensurePolling();
      } catch (err) {
        const message =
          err instanceof LabelingServerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '恢复任务失败';
        set({ error: message });
        throw err;
      }
    });
  },

  cancelTask: async (taskId) => {
    const task = get().getTask(taskId);
    if (!task) return;
    if (isTerminalAiTaskStatus(task.status)) return;
    return runGuardedTaskAction(`cancel:${taskId}`, async () => {
      if (!task.serverTaskId) {
        get().setTaskStatus(taskId, 'cancelled');
        return;
      }
      try {
        const options = await resolveServerOptions();
        const server = await cancelServerTask({
          ...options,
          taskId: task.serverTaskId,
        });
        set((state) => {
          const tasks = state.tasks.map((item) =>
            item.id === task.id ? applyServerTaskToLocal(item, server) : item
          );
          writePersisted({
            tasks,
            activeTaskId: state.activeTaskId,
            syncedDeviceId: state.syncedDeviceId,
          });
          return { tasks, error: null, syncError: null };
        });
        get().ensurePolling();
      } catch (err) {
        const message =
          err instanceof LabelingServerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '取消任务失败';
        set({ error: message });
        throw err;
      }
    });
  },

  deleteTask: async (taskId) => {
    const task = get().getTask(taskId);
    if (!task) return;
    if (!canDeleteTask(task)) {
      const message = '只能删除已结束的任务';
      set({ error: message });
      throw new LabelingServerApiError(message, 409);
    }
    return runGuardedTaskAction(`delete:${taskId}`, async () => {
      if (!task.serverTaskId) {
        set((state) => {
          const tasks = state.tasks.filter((item) => item.id !== task.id);
          writePersisted({
            tasks,
            activeTaskId: state.activeTaskId,
            syncedDeviceId: state.syncedDeviceId,
          });
          return { tasks };
        });
        return;
      }
      try {
        const options = await resolveServerOptions();
        await deleteServerTask({ ...options, taskId: task.serverTaskId });
        set((state) => {
          const tasks = state.tasks.filter((item) => item.id !== task.id);
          writePersisted({
            tasks,
            activeTaskId: state.activeTaskId,
            syncedDeviceId: state.syncedDeviceId,
          });
          return { tasks, error: null };
        });
      } catch (err) {
        const message =
          err instanceof LabelingServerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '删除任务失败';
        set({ error: message });
        throw err;
      }
    });
  },

  clearFinishedTasks: async () => {
    const finished = get().tasks.filter((task) => canDeleteTask(task));
    const deletedIds = new Set<string>();
    const failures: string[] = [];
    for (const task of finished) {
      try {
        await get().deleteTask(task.id);
        deletedIds.add(task.id);
      } catch (err) {
        const message =
          err instanceof LabelingServerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '删除失败';
        failures.push(`${task.modelName}: ${message}`);
      }
    }
    if (failures.length > 0) {
      set({ error: failures.join('；') });
    }
    if (deletedIds.size > 0) {
      set((state) => {
        const tasks = state.tasks.filter((task) => !deletedIds.has(task.id));
        writePersisted({
          tasks,
          activeTaskId: state.activeTaskId,
          syncedDeviceId: state.syncedDeviceId,
        });
        return { tasks };
      });
    }
    get().ensurePolling();
  },

  ensurePolling: () => {
    const shouldContinue = () =>
      get().tasks.some((task) => isActiveAiTaskStatus(task.status));

    if (!shouldContinue()) {
      taskPolling.stop();
      return;
    }

    if (taskPolling.isActive) {
      return;
    }

    taskPolling.start(() => get().fetchTasks(), shouldContinue);
  },

  stopPolling: () => {
    taskPolling.stop();
  },
}));

export const useAiTaskStore = bridgeVanillaStoreToPinia('aiTask', useAiTaskStoreVanilla);
