import { hasInFlightBatch, isAiTaskRunningLocally } from './taskRunner';
import {
  evaluateTaskRecovery,
  isRefreshOrphanedRunningTask,
  type TaskRecoveryCheck,
} from './taskRecovery';
import type { AiTaskRecord } from './types';

export interface TaskHistoryActions {
  recovery: TaskRecoveryCheck;
  showContinue: boolean;
  showRefreshStatus: boolean;
  runningHint: string | null;
}

function isOrphanedRunningTask(task: AiTaskRecord): boolean {
  if (!isRefreshOrphanedRunningTask(task)) return false;
  if (isAiTaskRunningLocally(task.id)) return false;
  const serverTaskId = task.serverTaskId;
  if (serverTaskId && hasInFlightBatch(serverTaskId)) return false;
  return true;
}

/**
 * AI Task History 列表操作按钮可见性（与 evaluateTaskRecovery 一致，不另算状态）。
 */
export function getTaskHistoryActions(task: AiTaskRecord): TaskHistoryActions {
  const recovery = evaluateTaskRecovery(task);
  const orphaned = isOrphanedRunningTask(task);
  const showContinue =
    (recovery.canContinue || orphaned) && !isAiTaskRunningLocally(task.id);
  const showRefreshStatus =
    task.status === 'running' &&
    recovery.canRefresh &&
    !recovery.canContinue &&
    !orphaned;
  const runningHint = orphaned
    ? '页面刷新后本地执行已中断，可点击继续任务恢复处理'
    : showRefreshStatus
      ? (recovery.message ?? '任务仍在服务器运行中')
      : null;

  return { recovery, showContinue, showRefreshStatus, runningHint };
}
