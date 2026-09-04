import type { LabelingServerOptions } from '../../services/autoLabel/labelingServerClient';
import { buildLabelingApiHeaders } from '../../services/labelingApiHeaders';
import type { AiModel, AiModelTestResult, AiModelUpdateInput } from './types';
import { mapServerModelToAiModel } from './mappers';

export interface ModelListResponseV2 {
  models: Array<Record<string, unknown>>;
  defaultModelId: string | null;
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { detail?: string };
    if (typeof json.detail === 'string') return json.detail;
  } catch {
    // ignore
  }
  return fallback;
}

export async function fetchModelList(
  options: LabelingServerOptions
): Promise<{ models: AiModel[]; defaultModelId: string | null }> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/models`, {
    headers: buildLabelingApiHeaders(),
    signal: AbortSignal.timeout((options.timeoutSec ?? 30) * 1000),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '获取模型列表失败'));
  }
  const json = (await response.json()) as ModelListResponseV2;
  const models = (json.models ?? []).map((item) =>
    mapServerModelToAiModel(item as never)
  );
  return { models, defaultModelId: json.defaultModelId ?? null };
}

export async function fetchModelDetail(
  options: LabelingServerOptions & { modelId: string }
): Promise<AiModel> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/models/${encodeURIComponent(options.modelId)}`,
    {
      headers: buildLabelingApiHeaders(),
      signal: AbortSignal.timeout((options.timeoutSec ?? 30) * 1000),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '获取模型详情失败'));
  }
  const json = (await response.json()) as Record<string, unknown>;
  return mapServerModelToAiModel(json as never);
}

export async function uploadModelFile(
  options: LabelingServerOptions & {
    file: File;
    replace?: boolean;
    task?: string;
  }
): Promise<AiModel> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const form = new FormData();
  form.append('file', options.file, options.file.name);
  form.append('replace', String(options.replace === true));
  form.append('task', options.task ?? 'auto');
  const response = await fetch(`${base}/models/upload`, {
    method: 'POST',
    headers: buildLabelingApiHeaders(),
    body: form,
    signal: AbortSignal.timeout(Math.max(options.timeoutSec ?? 60, 300) * 1000),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, '上传模型失败'));
  }
  const json = (await response.json()) as Record<string, unknown>;
  return mapServerModelToAiModel(json as never);
}

export async function updateModelConfig(
  options: LabelingServerOptions & {
    modelId: string;
    updates: AiModelUpdateInput;
  }
): Promise<AiModel> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/models/${encodeURIComponent(options.modelId)}`,
    {
      method: 'PUT',
      headers: buildLabelingApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options.updates),
      signal: AbortSignal.timeout((options.timeoutSec ?? 30) * 1000),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '更新模型配置失败'));
  }
  const json = (await response.json()) as Record<string, unknown>;
  return mapServerModelToAiModel({
    ...json,
    id: options.modelId,
    name: options.modelId,
    display_name: json.display_name,
    path: json.model_path,
    task: json.task,
    classes: json.classes,
    loaded: true,
  } as never);
}

export async function deleteModelById(
  options: LabelingServerOptions & { modelId: string }
): Promise<void> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/models/${encodeURIComponent(options.modelId)}`,
    {
      method: 'DELETE',
      headers: buildLabelingApiHeaders(),
      signal: AbortSignal.timeout((options.timeoutSec ?? 30) * 1000),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '删除模型失败'));
  }
}

export async function setDefaultModel(
  options: LabelingServerOptions & { modelId: string }
): Promise<void> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/models/${encodeURIComponent(options.modelId)}/default`,
    {
      method: 'POST',
      headers: buildLabelingApiHeaders(),
      signal: AbortSignal.timeout((options.timeoutSec ?? 30) * 1000),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '设置默认模型失败'));
  }
}

export async function testModelWithImage(
  options: LabelingServerOptions & {
    modelId: string;
    imageFile: File;
    confidence?: number;
    iou?: number;
  }
): Promise<AiModelTestResult> {
  const base = options.serverUrl.replace(/\/+$/, '');
  const form = new FormData();
  form.append('image', options.imageFile, options.imageFile.name);
  if (options.confidence != null) {
    form.append('confidence', String(options.confidence));
  }
  if (options.iou != null) {
    form.append('iou', String(options.iou));
  }
  const response = await fetch(
    `${base}/models/${encodeURIComponent(options.modelId)}/test`,
    {
      method: 'POST',
      headers: buildLabelingApiHeaders(),
      body: form,
      signal: AbortSignal.timeout(Math.max(options.timeoutSec ?? 60, 120) * 1000),
    }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, '模型测试失败'));
  }
  const json = (await response.json()) as {
    model_id: string;
    latency_ms: number;
    device: string;
    image_width: number;
    image_height: number;
    shapes: AiModelTestResult['shapes'];
    detections: Array<{ label: string; confidence: number }>;
  };
  return {
    modelId: json.model_id,
    latencyMs: json.latency_ms,
    device: json.device,
    imageWidth: json.image_width,
    imageHeight: json.image_height,
    shapes: json.shapes,
    detections: json.detections,
  };
}
