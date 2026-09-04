const BLOCKING_OVERLAY_SELECTORS = [
  '.ant-modal-wrap',
  '.ant-drawer-open',
  '.ant-image-preview-wrap',
] as const;

function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** 是否存在遮挡画布的弹层（Modal / Drawer / 图片预览等） */
export function isBlockingOverlayOpen(): boolean {
  if (typeof document === 'undefined') return false;

  for (const selector of BLOCKING_OVERLAY_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      if (node instanceof HTMLElement && isElementVisible(node)) {
        return true;
      }
    }
  }

  return false;
}

/** 鼠标事件是否发生在弹层内部 */
export function isEventOnBlockingOverlay(event: MouseEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('.ant-modal-wrap, .ant-drawer, .ant-image-preview-wrap')
  );
}
