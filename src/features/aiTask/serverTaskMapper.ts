import { DEFAULT_INFERENCE_SESSION_CONFIG } from '../ai';
import type { AiTaskRecord, AiTaskStatus } from './types';
import type { ServerTask, ServerTaskStatus } from './serverTaskTypes';
import { syncProgressTimestamp } from './taskDisplay';

const TERMINAL_STATUSES: ReadonlySet<AiTaskStatus> = new Set([
  'completed',
  'cancelled',
  'failed',
]);

export function isTerminalAiTaskStatus(status: AiTaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function isServerTaskStatus(value: string): value is ServerTaskStatus {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'failed'
  );
}

function toAiTaskStatus(status: string): AiTaskStatus {
  if (isServerTaskStatus(status)) {
    return status;
  }
  return 'failed';
}

function minimalSnapshot(server: ServerTask) {
  const confidence =
    server.confidence ?? DEFAULT_INFERENCE_SESSION_CONFIG.confidence;
  const iou = server.iou ?? DEFAULT_INFERENCE_SESSION_CONFIG.iou;
  return {
    model: {
      id: server.model_name,
      name: server.model_name,
      fileName: `${server.model_name}.pt`,
      task: 'detect' as const,
      classes: [] as string[],
    },
    config: {
      confidence,
      iou,
      imgSize: DEFAULT_INFERENCE_SESSION_CONFIG.imgSize,
      device: DEFAULT_INFERENCE_SESSION_CONFIG.device,
    },
    capturedAt: Math.round(server.created_at * 1000),
  };
}

/** 将服务端任务映射为可展示的 AiTaskRecord（无本地快照时使用） */
export function serverTaskToAiTaskRecord(server: ServerTask): AiTaskRecord {
  const status = toAiTaskStatus(server.status);
  const createdAt = Math.round(server.created_at * 1000);
  const updatedAt = Math.round(server.updated_at * 1000);
  return {
    id: server.task_id,
    serverTaskId: server.task_id,
    modelId: server.model_name,
    modelName: server.model_name,
    modelSnapshot: minimalSnapshot(server),
    imageScope: 'all',
    imageIds: [],
    status,
    confidence: server.confidence ?? DEFAULT_INFERENCE_SESSION_CONFIG.confidence,
    iou: server.iou ?? DEFAULT_INFERENCE_SESSION_CONFIG.iou,
    concurrency: 4,
    replaceExisting: true,
    progress: {
      total: server.total,
      completed: server.completed,
      success: server.success,
      failed: server.failed,
      objects: 0,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt,
    updatedAt,
    finishedAt: TERMINAL_STATUSES.has(status) ? updatedAt : null,
    error: server.error,
    deviceId: server.device_id,
  };
}

/** 用服务端状态覆盖本地记录（保留本地推理进度与快照） */
export function applyServerTaskToLocal(
  local: AiTaskRecord,
  server: ServerTask
): AiTaskRecord {
  const status = toAiTaskStatus(server.status);
  const updatedAt = Math.round(server.updated_at * 1000);
  const serverCompleted = server.completed;
  const progressPatch = {
    ...local.progress,
    total: Math.max(local.progress.total, server.total),
    completed: serverCompleted,
    success: server.success,
    failed: server.failed,
  };
  const progressMeta = syncProgressTimestamp(
    { ...local, progress: progressPatch },
    serverCompleted,
    updatedAt
  );

  return {
    ...local,
    serverTaskId: server.task_id,
    modelId: local.modelId || server.model_name,
    modelName: local.modelName || server.model_name,
    status,
    error: server.error ?? local.error,
    updatedAt,
    finishedAt:
      TERMINAL_STATUSES.has(status)
        ? (local.finishedAt ?? updatedAt)
        : local.finishedAt,
    deviceId: server.device_id,
    progress: progressPatch,
    ...progressMeta,
  };
}

export function isActiveAiTaskStatus(status: AiTaskStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'paused';
}
