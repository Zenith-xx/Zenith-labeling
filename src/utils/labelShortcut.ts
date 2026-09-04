import type { Label } from '../types';

export const SHORTCUT_PAGE_SIZE = 10;

/** 解析数字快捷键 1–9、0（0 表示第 10 个），无效时返回 null */
export function parseShortcutDigit(key: string): number | null {
  if (key.length !== 1) return null;
  const code = key.charCodeAt(0);
  if (code >= 49 && code <= 57) return code - 48;
  if (code === 48) return 10;
  return null;
}

/** 页内序号 0–9 → 内部 digit 1–10 */
export function getShortcutDigitForPageIndex(pageIndex: number): number {
  return pageIndex + 1;
}

/** digit 1–10 → 显示键 1–9、0 */
export function formatShortcutKey(digit: number): string {
  return digit === 10 ? '0' : String(digit);
}

/** 快捷标签总页数（至少 1，便于 UI 显示） */
export function getShortcutTotalPages(labelCount: number): number {
  if (labelCount <= 0) return 1;
  return Math.ceil(labelCount / SHORTCUT_PAGE_SIZE);
}

/** 最大页码（0-based） */
export function getShortcutMaxPage(labelCount: number): number {
  return Math.max(0, getShortcutTotalPages(labelCount) - 1);
}

/** 当前页起始下标 */
export function getShortcutStartIndex(shortcutPage: number): number {
  return shortcutPage * SHORTCUT_PAGE_SIZE;
}

/**
 * O(1) 按当前页 + 数字键取标签。
 * index = shortcutPage * 10 + (digit - 1)
 */
export function getShortcutLabel(
  labels: readonly Label[],
  digit: number,
  shortcutPage = 0
): Label | null {
  if (digit < 1 || digit > SHORTCUT_PAGE_SIZE) return null;
  const index = getShortcutStartIndex(shortcutPage) + (digit - 1);
  return labels[index] ?? null;
}

/** 当前页可见标签（最多 10 条，slice 不拷贝全量） */
export function getVisibleShortcutLabels(
  labels: readonly Label[],
  shortcutPage: number
): Label[] {
  const startIndex = getShortcutStartIndex(shortcutPage);
  return labels.slice(startIndex, startIndex + SHORTCUT_PAGE_SIZE);
}

/** 开发模式：确认 store 中标签总数与分页状态 */
export function logShortcutLabelDebug(
  source: string,
  labelCount: number,
  shortcutPage: number
): void {
  if (import.meta.env?.DEV) {
    console.log('total labels:', labelCount, {
      source,
      shortcutPage,
      totalPages: getShortcutTotalPages(labelCount),
      startIndex: getShortcutStartIndex(shortcutPage),
    });
  }
}
