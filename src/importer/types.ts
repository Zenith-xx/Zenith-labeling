import type { Annotation, Label } from '../types';

export interface DatasetFileIndex {
  /** 小写 basename → 图片 File */
  images: Map<string, File>;
  /** 小写匹配键 → JSON File */
  annotations: Map<string, File>;
  /** 图片在文件夹中的出现顺序（小写 basename） */
  imageOrder: string[];
}

export interface DatasetItem {
  id: string;
  imageFile: File;
  annotationFile?: File;
}

export type ImportStatus =
  | 'reading'
  | 'scanning'
  | 'matching'
  | 'parsing'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface ImportProgress {
  /** 文件夹内文件总数（读取完成后确定） */
  totalFiles: number;
  /** 已读取的文件数（读取阶段递增） */
  readFiles: number;
  totalImages: number;
  totalJson: number;
  scanned: number;
  parsed: number;
  loadedAnnotations: number;
  discoveredLabels: number;
  newlyCreatedLabels: number;
  /** 统一进度：已完成步骤 */
  completedUnits: number;
  /** 统一进度：总步骤（读取阶段可能为估算值） */
  totalUnits: number;
  /** 当前阶段说明（内部使用） */
  phaseLabel: string;
  status: ImportStatus;
  errorMessage?: string;
}

export interface ParsedAnnotationBatch {
  annotationsByImage: Record<string, Annotation[]>;
  annotationCount: number;
}

export interface ImportLabelStats {
  discoveredLabels: number;
  newlyCreatedLabels: number;
}

export const IMPORT_IMAGE_BATCH_SIZE = 200;
export const IMPORT_PARSE_BATCH_SIZE = 200;
/** 文件夹 getFile / JSON text 读取并发度（约 1 万级数据集） */
export const IMPORT_FILE_CONCURRENCY = 24;
export const IMPORT_TEXT_CONCURRENCY = 24;
/** 读取阶段每隔多少文件向主线程让出一次 */
export const IMPORT_READ_YIELD_EVERY = 500;
