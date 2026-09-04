import type { AiModel, AiModelTask } from '../../modelCenter/types';

/** 推理会话中的运行参数（临时，不写回模型中心） */
export interface InferenceSessionConfig {
  confidence: number;
  iou: number;
  imgSize: number;
  device: string;
}

/** 当前 AI 推理会话状态（面板 / 单图 / 创建批量任务前） */
export interface InferenceSessionState {
  modelId: string;
  config: InferenceSessionConfig;
}

/**
 * 统一的 AI 推理上下文。
 * 单图 predict、批量 snapshot、taskRunner 均应通过此结构获取参数。
 */
export interface InferenceContext {
  modelId: string;
  modelName: string;
  fileName: string;
  task: AiModelTask;
  classes: string[];
  version?: string;
  confidence: number;
  iou: number;
  imgSize: number;
  device: string;
}

/**
 * 任务创建时冻结的模型快照（增强版，扁平结构，兼容旧代码）。
 */
export interface InferenceModelSnapshot {
  id: string;
  name: string;
  fileName: string;
  version?: string;
  task: AiModelTask;
  classes: string[];
  config: InferenceSessionConfig;
  capturedAt: number;
}

/** 批量任务快照中的模型元数据 */
export interface AiTaskModelSnapshotModel {
  id: string;
  name: string;
  fileName: string;
  version?: string;
  task: AiModelTask;
  classes: string[];
}

/**
 * 批量任务快照（嵌套结构）。
 * 历史任务完全独立，不依赖模型中心当前状态。
 */
export interface AiTaskModelSnapshot {
  model: AiTaskModelSnapshotModel;
  config: InferenceSessionConfig;
  capturedAt: number;
}

/** 兼容早期 aiTask 中的精简 snapshot */
export interface LegacyTaskModelSnapshot {
  modelId: string;
  modelName: string;
  confidence: number;
  iou: number;
  imgSize: number;
  device: string;
}

export type TaskModelSnapshotInput =
  | AiTaskModelSnapshot
  | InferenceModelSnapshot
  | LegacyTaskModelSnapshot;

export const DEFAULT_INFERENCE_SESSION_CONFIG: InferenceSessionConfig = {
  confidence: 0.25,
  iou: 0.45,
  imgSize: 640,
  device: 'auto',
};
