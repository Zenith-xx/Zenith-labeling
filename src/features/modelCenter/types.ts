export type AiModelFormat = 'pt' | 'onnx';
export type AiModelTask = 'detect' | 'obb' | 'seg' | 'pose';
export type AiModelStatus = 'ready' | 'loading' | 'error';
export type AiModelSource = 'upload' | 'builtin';

export interface AiModelDefaultConfig {
  confidence: number;
  iou: number;
  imgSize: number;
  device: 'cuda' | 'cpu' | 'auto';
}

export interface AiModel {
  id: string;
  name: string;
  fileName: string;
  format: AiModelFormat;
  task: AiModelTask;
  framework: string;
  classes: string[];
  inputSize: number;
  defaultConfig: AiModelDefaultConfig;
  status: AiModelStatus;
  loaded: boolean;
  loadError?: string | null;
  version?: string;
  description?: string;
  source: AiModelSource;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  isDefault: boolean;
  taskLabel?: string;
  exportFormats?: string[];
}

export interface AiModelTestResult {
  modelId: string;
  latencyMs: number;
  device: string;
  imageWidth: number;
  imageHeight: number;
  shapes: Array<{
    label: string;
    shape_type: string;
    points: [number, number][];
    score: number;
  }>;
  detections: Array<{
    label: string;
    confidence: number;
  }>;
}

export interface AiModelUpdateInput {
  display_name?: string;
  description?: string;
  version?: string;
  confidence?: number;
  iou?: number;
  imgSize?: number;
  device?: string;
  classes?: string[];
}

export const TASK_LABELS: Record<AiModelTask, string> = {
  detect: 'YOLO Detect',
  obb: 'YOLO OBB',
  seg: 'YOLO Seg',
  pose: 'YOLO Pose',
};

export const MODEL_CENTER_STORAGE_KEY = 'labeling-vue3:modelCenter';
