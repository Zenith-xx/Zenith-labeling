export type AiTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AiTaskImageScope = 'current' | 'all' | 'unannotated' | 'range';

/** 图片范围（1-based，含首尾），仅 imageScope === 'range' 时有效 */
export interface AiTaskImageRange {
  start: number;
  end: number;
}

export const DEFAULT_AI_TASK_CONCURRENCY = 4;
export const MAX_AI_TASK_RETRIES = 2;
export const AI_TASK_STORAGE_KEY = 'labeling-vue3:aiTasks';
/** running 任务无进度增长超过该时间则 UI 提示「长时间无进度」 */
export const TASK_STALL_THRESHOLD_MS = 90_000;
