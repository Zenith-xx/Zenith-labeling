/** 远程推理服务返回的单个形状 */
export interface RemoteShape {
  label: string;
  shape_type: string;
  points: [number, number][];
  group_id?: number | null;
  score?: number | null;
  description?: string | null;
  difficult?: boolean;
  attributes?: Record<string, unknown>;
}

/** Labeling-Server 模型信息 */
export interface LabelingServerModel {
  name: string;
  display_name: string;
  path: string;
  type: string;
  task: string;
  task_label: string;
  export_formats: string[];
  classes: string[];
  loaded: boolean;
  load_error?: string | null;
  manifest?: LabelingServerModelManifest | null;
}

export interface LabelingServerModelManifest {
  name: string;
  display_name: string;
  type: string;
  task: string;
  export_formats: string[];
  model_path: string;
  confidence: number;
  iou: number;
  image_size: number;
  device: string;
  classes: string[];
}

export interface LabelingServerShape {
  label: string;
  shape_type: string;
  points: [number, number][];
  score: number;
  class_id: number;
  keypoints?: number[];
}

export interface LabelingDetectionBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelingDetection {
  class_id: number;
  label: string;
  confidence: number;
  bbox: LabelingDetectionBBox;
}

export interface LabelingServerPredictResult {
  model: string;
  task: string;
  export_formats: string[];
  image_width: number;
  image_height: number;
  shapes: LabelingServerShape[];
  detections: LabelingDetection[];
}
