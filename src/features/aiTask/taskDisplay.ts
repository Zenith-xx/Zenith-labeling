import { TASK_STALL_THRESHOLD_MS } from './types-core';
import type { AiTaskRecord, AiTaskStatus } from './types';
import { isTerminalAiTaskStatus } from './serverTaskMapper';

export type TaskDisplayKind =
  | 'pending'
  | 'running'
  | 'stalled'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TASK_DISPLAY_LABEL: Record<TaskDisplayKind, string> = {
  pending: '排队中',
  running: '运行中',
  stalled: '长时间无进度',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/** 根据 progress.completed 变化更新本地进度时间戳 */
export function syncProgressTimestamp(
  task: AiTaskRecord,
  completed: number,
  timestamp = Date.now()
): Pick<AiTaskRecord, 'lastProgressAt' | 'lastProgressCompleted'> {
  const prevCompleted =
    task.lastProgressCompleted ?? task.progress.completed;
  if (task.lastProgressAt == null || completed > prevCompleted) {
    return { lastProgressAt: timestamp, lastProgressCompleted: completed };
  }
  return {
    lastProgressAt: task.lastProgressAt,
    lastProgressCompleted: completed,
  };
}

/**
 * 判断 running 任务是否长时间无进度（仅 UI 提示，不改变 status）。
 */
export function isTaskStalled(
  task: AiTaskRecord,
  now = Date.now(),
  thresholdMs = TASK_STALL_THRESHOLD_MS
): boolean {
  if (task.status !== 'running') return false;
  if (task.progress.total <= 0) return false;
  if (task.progress.completed >= task.progress.total) return false;
  const lastAt = task.lastProgressAt ?? task.updatedAt ?? task.createdAt;
  return now - lastAt >= thresholdMs;
}

export function getTaskDisplayKind(task: AiTaskRecord, now = Date.now()): TaskDisplayKind {
  if (task.status === 'running' && isTaskStalled(task, now)) {
    return 'stalled';
  }
  return task.status;
}

export function getTaskDisplayLabel(task: AiTaskRecord, now = Date.now()): string {
  return TASK_DISPLAY_LABEL[getTaskDisplayKind(task, now)];
}

export function canDeleteTask(task: AiTaskRecord): boolean {
  return isTerminalAiTaskStatus(task.status);
}
