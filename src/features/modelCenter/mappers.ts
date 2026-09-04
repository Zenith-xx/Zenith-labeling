import type { LabelingServerModel } from '../../services/autoLabel/types';
import type { AiModel, AiModelFormat, AiModelStatus, AiModelTask } from './types';

const TASK_MAP: Record<string, AiModelTask> = {
  hbb: 'detect',
  detect: 'detect',
  obb: 'obb',
  seg: 'seg',
  pose: 'pose',
};

export function mapServerTask(task: string): AiModelTask {
  return TASK_MAP[task] ?? 'detect';
}

export function mapClientTask(task: AiModelTask): string {
  if (task === 'detect') return 'hbb';
  return task;
}

function mapStatus(model: LabelingServerModel): AiModelStatus {
  if (model.loaded) return 'ready';
  if (model.load_error) return 'error';
  return 'loading';
}

function mapFormat(path: string, format?: string): AiModelFormat {
  if (format === 'onnx') return 'onnx';
  return path.toLowerCase().endsWith('.onnx') ? 'onnx' : 'pt';
}

export function mapServerModelToAiModel(
  model: LabelingServerModel & {
    id?: string;
    format?: string;
    framework?: string;
    status?: string;
    inputSize?: number;
    defaultConfig?: {
      confidence: number;
      iou: number;
      imgSize: number;
      device: string;
    };
    version?: string | null;
    description?: string | null;
    source?: string;
    createdBy?: string | null;
    createdAt?: number | null;
    updatedAt?: number | null;
    isDefault?: boolean;
  }
): AiModel {
  const manifest = model.manifest;
  const defaultConfig = model.defaultConfig ?? {
    confidence: manifest?.confidence ?? 0.25,
    iou: manifest?.iou ?? 0.45,
    imgSize: manifest?.image_size ?? model.inputSize ?? 640,
    device: (manifest?.device ?? 'auto') as AiModel['defaultConfig']['device'],
  };

  return {
    id: model.id ?? model.name,
    name: model.display_name || model.name,
    fileName: model.path || manifest?.model_path || `${model.name}.pt`,
    format: mapFormat(model.path || '', model.format),
    task: mapServerTask(model.task),
    framework: model.framework ?? 'ultralytics',
    classes: model.classes ?? manifest?.classes ?? [],
    inputSize: defaultConfig.imgSize,
    defaultConfig: {
      confidence: defaultConfig.confidence,
      iou: defaultConfig.iou,
      imgSize: defaultConfig.imgSize,
      device: (defaultConfig.device as AiModel['defaultConfig']['device']) || 'auto',
    },
      status: (model.status as AiModelStatus) ?? mapStatus(model),
    loaded: model.loaded,
    loadError: model.load_error,
    version: model.version ?? undefined,
    description: model.description ?? undefined,
    source: (model.source as AiModel['source']) ?? 'upload',
    createdBy: model.createdBy ?? undefined,
    createdAt: model.createdAt ?? undefined,
    updatedAt: model.updatedAt ?? undefined,
    isDefault: model.isDefault ?? false,
    taskLabel: model.task_label,
    exportFormats: model.export_formats,
  };
}
