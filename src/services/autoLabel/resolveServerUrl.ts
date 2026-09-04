import { checkLabelingServerHealth } from './labelingServerClient';
import {
  BUILTIN_LABELING_SERVER_URL,
  LABELING_SERVER_CONNECT_HINT,
  getConfiguredLabelingServerUrl,
} from '@/config/labelingServer';

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = raw.trim().replace(/\/+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function defaultCandidates(): string[] {
  const candidates: string[] = [];
  if (import.meta.env.DEV) {
    candidates.push('/labeling-api');
  } else if (typeof window !== 'undefined') {
    candidates.push(`${window.location.origin}/labeling-api`);
    candidates.push(getConfiguredLabelingServerUrl());
  }
  candidates.push(
    BUILTIN_LABELING_SERVER_URL,
    'http://127.0.0.1:8100'
  );
  return uniqueUrls(candidates);
}

/** 自动探测可用的 Labeling-Server 地址，优先使用用户配置的地址。 */
export async function resolveLabelingServerUrl(
  preferred?: string,
  timeoutSec = 8
): Promise<string> {
  const candidates = uniqueUrls([
    ...(preferred ? [preferred] : []),
    ...defaultCandidates(),
  ]);

  let lastError: Error | null = null;
  for (const serverUrl of candidates) {
    try {
      await checkLabelingServerHealth({ serverUrl, timeoutSec });
      return serverUrl;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(LABELING_SERVER_CONNECT_HINT);
}
