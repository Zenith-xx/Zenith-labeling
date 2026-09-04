/** Labeling-Server URL defaults for dev proxy and production builds. */

export const BUILTIN_LABELING_SERVER_URL = 'http://localhost:8100';

/** Production URL from ``VITE_LABELING_SERVER_URL`` or built-in default. */
export function getConfiguredLabelingServerUrl(): string {
  const fromEnv = import.meta.env.VITE_LABELING_SERVER_URL?.trim();
  if (!fromEnv) {
    return BUILTIN_LABELING_SERVER_URL;
  }
  return fromEnv.replace(/\/+$/, '');
}

/** Default URL shown in AI settings when no persisted value exists. */
export function getDefaultLabelingServerUrl(): string {
  if (import.meta.env.DEV) {
    return '/labeling-api';
  }
  return getConfiguredLabelingServerUrl();
}

/** 面向用户的简短连接失败提示 */
export const LABELING_SERVER_CONNECT_HINT = '标注服务未连接';
export const LABELING_SERVER_TIMEOUT_HINT = '连接超时，请稍后重试';
