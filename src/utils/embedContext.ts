/** Whether the app runs inside any iframe (e.g. ICMS4CI embed page). */
export function isEmbeddedFrame(): boolean {
  return window.self !== window.top;
}

/** iframe 内用 100% 高度，避免 100dvh 撑出空白 */
export function markEmbeddedDocument(): void {
  if (!isEmbeddedFrame()) return;
  document.documentElement.classList.add('is-embedded');
  // 尽早标记，避免首屏按 100dvh 布局后再被压缩
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
}

/**
 * Cross-origin iframes block showDirectoryPicker; same-origin iframe (via dev proxy) is OK.
 * Cross-origin falls back to <input type="file" webkitdirectory>.
 */
export function canUseFileSystemAccessApi(): boolean {
  if (window.self === window.top) return true;
  try {
    void window.parent.location.href;
    return true;
  } catch {
    return false;
  }
}

export function isFileSystemAccessBlockedError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'SecurityError') return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('cross origin') ||
      msg.includes('file picker') ||
      msg.includes('sub frames')
    );
  }
  return false;
}
