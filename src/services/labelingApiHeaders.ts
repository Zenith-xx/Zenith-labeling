import { getDeviceId } from '@/utils/deviceId';

export const DEVICE_ID_HEADER = 'X-Device-ID';
export const API_TOKEN_HEADER = 'X-Labeling-API-Token';

let runtimeApiToken: string | undefined;

/** Override persisted/env API token at runtime (e.g. from AI settings store). */
export function setRuntimeLabelingApiToken(token: string | undefined): void {
  runtimeApiToken = token?.trim() || undefined;
}

/** Resolve API token from runtime override, then Vite env. */
export function getLabelingApiToken(): string | undefined {
  const envToken = import.meta.env.VITE_LABELING_API_TOKEN?.trim();
  return runtimeApiToken || envToken || undefined;
}

function applyApiToken(headers: Headers): void {
  const token = getLabelingApiToken();
  if (!token) return;
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
}

/** Merge caller headers with device id and API token when configured. */
export function buildLabelingApiHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  merged.set(DEVICE_ID_HEADER, getDeviceId());
  applyApiToken(merged);
  return merged;
}

/** Headers for endpoints that do not require X-Device-ID (e.g. health check). */
export function buildLabelingApiAuthHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  applyApiToken(merged);
  return merged;
}
