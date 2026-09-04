import type { LabelingServerPredictResult } from './types';
import {
  BUILTIN_LABELING_SERVER_URL,
  LABELING_SERVER_CONNECT_HINT,
  LABELING_SERVER_TIMEOUT_HINT,
} from '@/config/labelingServer';
import { buildLabelingApiAuthHeaders, buildLabelingApiHeaders } from '../labelingApiHeaders';

export interface LabelingServerOptions {
  serverUrl: string;
  timeoutSec?: number;
}

/** 单图 / 批量推理统一参数（与 POST /predict、/predict/batch 一致） */
export interface LabelingServerPredictParams {
  model: string;
  confidence: number;
  iou: number;
  imgSize: number;
  device: string;
}

export function appendPredictParams(
  form: FormData,
  params: LabelingServerPredictParams
): void {
  form.append('model_name', params.model);
  form.append('confidence', String(params.confidence));
  form.append('iou', String(params.iou));
  form.append('image_size', String(params.imgSize));
  form.append('device', params.device);
}

export function inferenceContextToPredictParams(context: {
  modelId: string;
  confidence: number;
  iou: number;
  imgSize: number;
  device: string;
}): LabelingServerPredictParams {
  return {
    model: context.modelId,
    confidence: context.confidence,
    iou: context.iou,
    imgSize: context.imgSize,
    device: context.device,
  };
}

export interface ServerHealth {
  status: string;
  models_loaded: number;
  models_total: number;
}

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return BUILTIN_LABELING_SERVER_URL;
  return trimmed;
}

function timeoutSignal(timeoutSec: number): AbortSignal {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutSec * 1000);
  return controller.signal;
}

function connectionError(cause?: unknown): Error {
  if (cause instanceof Error && cause.name === 'AbortError') {
    return new Error(LABELING_SERVER_TIMEOUT_HINT);
  }
  return new Error(LABELING_SERVER_CONNECT_HINT);
}

interface SafeFetchOptions {
  includeDeviceId?: boolean;
}

async function safeFetch(
  serverUrl: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: SafeFetchOptions
): Promise<Response> {
  const includeDeviceId = options?.includeDeviceId !== false;
  const requestInit: RequestInit = includeDeviceId
    ? { ...init, headers: buildLabelingApiHeaders(init?.headers) }
    : { ...init, headers: buildLabelingApiAuthHeaders(init?.headers) };
  try {
    return await fetch(input, requestInit);
  } catch (err) {
    throw connectionError(err);
  }
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { detail?: string | { msg?: string }[] };
    if (typeof json.detail === 'string') return json.detail;
    if (Array.isArray(json.detail) && json.detail[0]?.msg) {
      return json.detail.map((d) => d.msg).join('; ');
    }
  } catch {
    // ignore
  }
  const text = await response.text().catch(() => '');
  return text ? text.slice(0, 500) : fallback;
}

export async function checkLabelingServerHealth(
  options: LabelingServerOptions
): Promise<ServerHealth> {
  const base = normalizeServerUrl(options.serverUrl);
  const timeoutSec = options.timeoutSec ?? 10;
  const response = await safeFetch(
    base,
    `${base}/health`,
    { method: 'GET', signal: timeoutSignal(timeoutSec) },
    { includeDeviceId: false }
  );
  if (!response.ok) {
    throw new Error(await parseError(response, `服务不可用 (${response.status})`));
  }
  return (await response.json()) as ServerHealth;
}

export async function predictLabelingServer(
  options: LabelingServerOptions & {
    params: LabelingServerPredictParams;
    imageFile: File;
  }
): Promise<LabelingServerPredictResult> {
  const base = normalizeServerUrl(options.serverUrl);
  const timeoutSec = options.timeoutSec ?? 120;
  const form = new FormData();
  appendPredictParams(form, options.params);
  form.append('image', options.imageFile, options.imageFile.name);

  const response = await safeFetch(base, `${base}/predict`, {
    method: 'POST',
    body: form,
    signal: timeoutSignal(timeoutSec),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, `推理失败 (${response.status})`));
  }
  return (await response.json()) as LabelingServerPredictResult;
}

export interface LabelingServerBatchResultItem {
  imageName: string;
  image_width: number;
  image_height: number;
  shapes: LabelingServerPredictResult['shapes'];
  detections: LabelingServerPredictResult['detections'];
  error?: string | null;
}

export interface LabelingServerBatchPredictResult {
  model: string;
  task: string;
  export_formats: string[];
  count: number;
  results: LabelingServerBatchResultItem[];
}

export async function predictBatchLabelingServer(
  options: LabelingServerOptions & {
    params: LabelingServerPredictParams;
    imageFiles: File[];
    taskId?: string;
  }
): Promise<LabelingServerBatchPredictResult> {
  const base = normalizeServerUrl(options.serverUrl);
  const timeoutSec = Math.max(options.timeoutSec ?? 120, 180);
  const form = new FormData();
  appendPredictParams(form, options.params);
  for (const file of options.imageFiles) {
    form.append('images', file, file.name);
  }
  if (options.taskId) {
    form.append('task_id', options.taskId);
  }

  const response = await safeFetch(base, `${base}/predict/batch`, {
    method: 'POST',
    body: form,
    signal: timeoutSignal(timeoutSec),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, `批量推理失败 (${response.status})`));
  }
  return (await response.json()) as LabelingServerBatchPredictResult;
}
