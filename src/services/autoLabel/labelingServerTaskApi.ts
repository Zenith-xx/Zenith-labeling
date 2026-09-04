import type { LabelingServerOptions } from './labelingServerClient';
import type {
  ServerTask,
  ServerTaskListResponse,
} from '@/features/aiTask/serverTaskTypes';
import {
  BUILTIN_LABELING_SERVER_URL,
  LABELING_SERVER_CONNECT_HINT,
} from '@/config/labelingServer';
import { buildLabelingApiHeaders } from '../labelingApiHeaders';

export class LabelingServerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'LabelingServerApiError';
    this.status = status;
  }
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

async function safeFetch(
  serverUrl: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const requestInit: RequestInit = {
    ...init,
    headers: buildLabelingApiHeaders(init?.headers),
  };
  try {
    return await fetch(input, requestInit);
  } catch {
    throw new LabelingServerApiError(LABELING_SERVER_CONNECT_HINT, 0);
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

async function fetchJson<T>(
  options: LabelingServerOptions,
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = normalizeServerUrl(options.serverUrl);
  const timeoutSec = options.timeoutSec ?? 30;
  const response = await safeFetch(base, `${base}${path}`, {
    ...init,
    signal: timeoutSignal(timeoutSec),
  });
  if (!response.ok) {
    const message = await parseError(response, `请求失败 (${response.status})`);
    throw new LabelingServerApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function listTasks(
  options: LabelingServerOptions
): Promise<ServerTask[]> {
  const json = await fetchJson<ServerTaskListResponse>(options, '/tasks', {
    method: 'GET',
  });
  return json.tasks ?? [];
}

export async function getTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}`,
    { method: 'GET' }
  );
}

export async function createTask(
  options: LabelingServerOptions & {
    modelName: string;
    total: number;
    confidence?: number;
    iou?: number;
  }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(options, '/tasks/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_name: options.modelName,
      total: options.total,
      confidence: options.confidence,
      iou: options.iou,
    }),
  });
}

export async function startTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}/start`,
    { method: 'POST' }
  );
}

export async function pauseTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}/pause`,
    { method: 'POST' }
  );
}

export async function resumeTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}/resume`,
    { method: 'POST' }
  );
}

export async function cancelTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}/cancel`,
    { method: 'POST' }
  );
}

export async function finishTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<ServerTask> {
  return fetchJson<ServerTask>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}/finish`,
    { method: 'POST' }
  );
}

export async function deleteTask(
  options: LabelingServerOptions & { taskId: string }
): Promise<void> {
  await fetchJson<{ message: string }>(
    options,
    `/tasks/${encodeURIComponent(options.taskId)}`,
    { method: 'DELETE' }
  );
}
