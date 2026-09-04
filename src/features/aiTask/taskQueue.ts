export interface QueueControl {
  isPaused: () => boolean;
  isCancelled: () => boolean;
  waitIfPaused: () => Promise<void>;
}

export interface QueueRunOptions<T> {
  items: T[];
  concurrency: number;
  maxRetries?: number;
  control: QueueControl;
  worker: (item: T, index: number) => Promise<void>;
  onItemStart?: (item: T, index: number) => void;
  onItemComplete?: (item: T, index: number, error?: Error) => void;
  yieldEvery?: number;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 16 });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

/**
 * 固定并发 worker 池，不一次性创建全部 Promise。
 */
export async function runTaskQueue<T>(options: QueueRunOptions<T>): Promise<void> {
  const {
    items,
    concurrency,
    maxRetries = 0,
    control,
    worker,
    onItemStart,
    onItemComplete,
    yieldEvery = 1,
  } = options;

  if (items.length === 0) return;

  let nextIndex = 0;
  let processedSinceYield = 0;

  const takeNextIndex = (): number | null => {
    if (nextIndex >= items.length) return null;
    const current = nextIndex;
    nextIndex += 1;
    return current;
  };

  const workerLoop = async (): Promise<void> => {
    while (true) {
      if (control.isCancelled()) return;
      await control.waitIfPaused();
      if (control.isCancelled()) return;

      const index = takeNextIndex();
      if (index === null) return;

      const item = items[index];
      onItemStart?.(item, index);

      let attempt = 0;
      let lastError: Error | undefined;
      while (attempt <= maxRetries) {
        if (control.isCancelled()) return;
        await control.waitIfPaused();
        if (control.isCancelled()) return;

        try {
          await worker(item, index);
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          attempt += 1;
          if (attempt > maxRetries) break;
        }
      }

      onItemComplete?.(item, index, lastError);
      processedSinceYield += 1;
      if (processedSinceYield >= yieldEvery) {
        processedSinceYield = 0;
        await yieldToMainThread();
      }
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => workerLoop()));
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
