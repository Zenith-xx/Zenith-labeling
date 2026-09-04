import type { AiModel } from '../../modelCenter/types';
import { useModelStore } from '../../modelCenter/modelStore';
import { useInferenceStore } from '../inferenceStore';
import type {
  AiTaskModelSnapshot,
  InferenceContext,
  InferenceModelSnapshot,
  InferenceSessionConfig,
  InferenceSessionState,
  LegacyTaskModelSnapshot,
  TaskModelSnapshotInput,
} from './types';
import { DEFAULT_INFERENCE_SESSION_CONFIG } from './types';

export type {
  InferenceContext,
  InferenceModelSnapshot,
  InferenceSessionConfig,
  InferenceSessionState,
  AiTaskModelSnapshot,
  AiTaskModelSnapshotModel,
  LegacyTaskModelSnapshot,
  TaskModelSnapshotInput,
} from './types';

export { DEFAULT_INFERENCE_SESSION_CONFIG } from './types';

function isNestedTaskSnapshot(
  snapshot: TaskModelSnapshotInput
): snapshot is AiTaskModelSnapshot {
  return (
    'model' in snapshot &&
    snapshot.model != null &&
    typeof snapshot.model === 'object' &&
    'id' in snapshot.model
  );
}

function isFlatEnhancedSnapshot(
  snapshot: TaskModelSnapshotInput
): snapshot is InferenceModelSnapshot {
  return 'config' in snapshot && 'id' in snapshot && !('model' in snapshot);
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeImgSize(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 32) return fallback;
  return Math.round(value);
}

function normalizeDevice(value: string | undefined, fallback: string): string {
  const device = (value ?? fallback).trim().toLowerCase();
  if (device === 'cuda' || device === 'cpu' || device === 'auto') {
    return device;
  }
  return fallback;
}

function normalizeSessionConfig(
  config: Partial<InferenceSessionConfig> | undefined,
  fallback: InferenceSessionConfig
): InferenceSessionConfig {
  return {
    confidence: clamp01(config?.confidence ?? fallback.confidence, fallback.confidence),
    iou: clamp01(config?.iou ?? fallback.iou, fallback.iou),
    imgSize: normalizeImgSize(config?.imgSize ?? fallback.imgSize, fallback.imgSize),
    device: normalizeDevice(config?.device, fallback.device),
  };
}

function buildContextFromModel(
  model: AiModel,
  config: InferenceSessionConfig
): InferenceContext {
  return {
    modelId: model.id,
    modelName: model.name,
    fileName: model.fileName,
    task: model.task,
    classes: [...model.classes],
    version: model.version,
    confidence: config.confidence,
    iou: config.iou,
    imgSize: config.imgSize,
    device: config.device,
  };
}

/**
 * 从模型资产生成默认会话配置（打开面板 / switchModel 时使用）。
 */
export function createSessionConfigFromModel(
  model: AiModel
): InferenceSessionConfig {
  return normalizeSessionConfig(model.defaultConfig, DEFAULT_INFERENCE_SESSION_CONFIG);
}

/**
 * 从模型资产生成完整会话状态。
 */
export function createSessionStateFromModel(model: AiModel): InferenceSessionState {
  return {
    modelId: model.id,
    config: createSessionConfigFromModel(model),
  };
}

/**
 * 切换模型时重置会话：更新 modelId 并将参数恢复为该模型 defaultConfig。
 */
export function switchSessionModel(
  model: AiModel,
  _previous?: InferenceSessionState
): InferenceSessionState {
  return createSessionStateFromModel(model);
}

function resolveModelById(modelId: string): AiModel {
  const store = useModelStore.getState();
  const model =
    store.getModelById(modelId) ??
    store.getDefaultModel() ??
    store.models.find((item) => item.status === 'ready');

  if (!model) {
    throw new Error(`模型不存在或未加载: ${modelId}`);
  }
  if (model.status === 'error') {
    throw new Error(model.loadError ?? `模型 ${model.name} 未加载成功`);
  }
  return model;
}

/**
 * 从 ModelStore + 当前会话参数解析统一推理上下文。
 * 单图推理、批量任务创建前的唯一参数入口。
 */
export function resolveInferenceContext(
  session: InferenceSessionState
): InferenceContext {
  if (!session.modelId?.trim()) {
    throw new Error('请先选择 AI 模型');
  }

  const model = resolveModelById(session.modelId.trim());
  const fallback = createSessionConfigFromModel(model);
  const config = normalizeSessionConfig(session.config, fallback);

  return buildContextFromModel(model, config);
}

/**
 * 从任务快照解析推理上下文（taskRunner 执行时使用）。
 * 兼容现有 LegacyTaskModelSnapshot 与增强版 InferenceModelSnapshot。
 */
export function resolveInferenceContextFromSnapshot(
  snapshot: TaskModelSnapshotInput
): InferenceContext {
  if (isNestedTaskSnapshot(snapshot)) {
    const config = normalizeSessionConfig(
      snapshot.config,
      DEFAULT_INFERENCE_SESSION_CONFIG
    );
    return {
      modelId: snapshot.model.id,
      modelName: snapshot.model.name,
      fileName: snapshot.model.fileName,
      task: snapshot.model.task,
      classes: [...snapshot.model.classes],
      version: snapshot.model.version,
      confidence: config.confidence,
      iou: config.iou,
      imgSize: config.imgSize,
      device: config.device,
    };
  }

  if (isFlatEnhancedSnapshot(snapshot)) {
    const config = normalizeSessionConfig(
      snapshot.config,
      DEFAULT_INFERENCE_SESSION_CONFIG
    );
    return {
      modelId: snapshot.id,
      modelName: snapshot.name,
      fileName: snapshot.fileName,
      task: snapshot.task,
      classes: [...snapshot.classes],
      version: snapshot.version,
      confidence: config.confidence,
      iou: config.iou,
      imgSize: config.imgSize,
      device: config.device,
    };
  }

  const legacy = snapshot as LegacyTaskModelSnapshot;
  const config = normalizeSessionConfig(
    {
      confidence: legacy.confidence,
      iou: legacy.iou,
      imgSize: legacy.imgSize,
      device: legacy.device,
    },
    DEFAULT_INFERENCE_SESSION_CONFIG
  );

  return {
    modelId: legacy.modelId,
    modelName: legacy.modelName,
    fileName: `${legacy.modelId}.pt`,
    task: 'detect',
    classes: [],
    confidence: config.confidence,
    iou: config.iou,
    imgSize: config.imgSize,
    device: config.device,
  };
}

/**
 * 将推理上下文冻结为批量任务快照（嵌套结构）。
 */
export function toAiTaskModelSnapshot(context: InferenceContext): AiTaskModelSnapshot {
  return {
    model: {
      id: context.modelId,
      name: context.modelName,
      fileName: context.fileName,
      version: context.version,
      task: context.task,
      classes: [...context.classes],
    },
    config: {
      confidence: context.confidence,
      iou: context.iou,
      imgSize: context.imgSize,
      device: context.device,
    },
    capturedAt: Date.now(),
  };
}

/**
 * 将推理上下文冻结为任务快照（扁平结构，兼容旧代码）。
 */
export function toModelSnapshot(context: InferenceContext): InferenceModelSnapshot {
  return {
    id: context.modelId,
    name: context.modelName,
    fileName: context.fileName,
    version: context.version,
    task: context.task,
    classes: [...context.classes],
    config: {
      confidence: context.confidence,
      iou: context.iou,
      imgSize: context.imgSize,
      device: context.device,
    },
    capturedAt: Date.now(),
  };
}

/**
 * 解析当前活跃推理会话（AI 面板 InferenceStore）。
 */
export function resolveActiveInferenceSession(): InferenceSessionState {
  const { sessionModelId, config } = useInferenceStore.getState();

  if (sessionModelId?.trim()) {
    return {
      modelId: sessionModelId.trim(),
      config: { ...config },
    };
  }

  return resolveDefaultSessionState();
}

/**
 * 解析当前默认模型的会话状态（打开 AI 面板时的便捷入口）。
 */
export function resolveDefaultSessionState(): InferenceSessionState {
  const store = useModelStore.getState();
  const model =
    store.getDefaultModel() ??
    store.models.find((item) => item.status === 'ready');

  if (!model) {
    throw new Error('暂无可用模型，请先在模型中心上传模型');
  }

  return createSessionStateFromModel(model);
}
