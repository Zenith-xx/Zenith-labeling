/** 让出主线程，避免长任务阻塞 UI */
export function yieldToMain(timeoutMs = 16): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: timeoutMs });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
