import type { AiTaskModelSnapshot } from '../ai';
import type { AiTaskImageRange, AiTaskImageScope, AiTaskStatus } from './types-core';

export type { AiTaskStatus, AiTaskImageScope, AiTaskImageRange } from './types-core';
export type { AiTaskModelSnapshot } from '../ai';

export interface AiTaskConfig {
  modelId: string;
  imageScope: AiTaskImageScope;
  /** 1-based inclusive，仅 range 范围任务 */
  imageRangeStart?: number;
  imageRangeEnd?: number;
  imageIds: string[];
  confidence: number;
  iou: number;
  concurrency: number;
  replaceExisting: boolean;
}

export interface AiTaskProgress {
  total: number;
  completed: number;
  success: number;
  failed: number;
  objects: number;
  currentImageId: string | null;
  currentImageName: string | null;
}

export interface AiTaskRecord {
  id: string;
  serverTaskId: string | null;
  deviceId?: string;
  serverDetached?: boolean;
  modelId: string;
  modelName: string;
  modelSnapshot: AiTaskModelSnapshot;
  imageScope: AiTaskImageScope;
  /** 1-based inclusive，仅 range 范围任务 */
  imageRangeStart?: number;
  imageRangeEnd?: number;
  imageIds: string[];
  status: AiTaskStatus;
  confidence: number;
  iou: number;
  concurrency: number;
  replaceExisting: boolean;
  progress: AiTaskProgress;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  error: string | null;
  /** 上次 progress.completed 增长时间（本地追踪，用于 stalled 判断） */
  lastProgressAt?: number | null;
  /** 与 lastProgressAt 对应的 completed 值 */
  lastProgressCompleted?: number;
}

export interface AiTaskCreateInput {
  modelSnapshot: AiTaskModelSnapshot;
  imageScope: AiTaskImageScope;
  imageRange?: AiTaskImageRange;
  concurrency: number;
  replaceExisting: boolean;
}

export interface AiTaskWorkerItem {
  imageId: string;
  imageName: string;
}

export interface AiTaskRunResult {
  processed: number;
  success: number;
  failed: number;
  objects: number;
  cancelled: boolean;
}

export {
  DEFAULT_AI_TASK_CONCURRENCY,
  MAX_AI_TASK_RETRIES,
  AI_TASK_STORAGE_KEY,
} from './types-core';
