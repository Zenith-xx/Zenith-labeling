const DEFAULT_FONT =
  '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  if (measureCtx) measureCtx.font = DEFAULT_FONT;
  return measureCtx;
}

/** 测量多段文本的最大像素宽度 */
export function measureMaxTextWidth(texts: string[], font = DEFAULT_FONT): number {
  if (texts.length === 0) return 0;
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = font;
  let max = 0;
  for (const text of texts) {
    max = Math.max(max, ctx.measureText(text).width);
  }
  return max;
}
