import { VIEW_ZOOM_MAX, VIEW_ZOOM_MIN } from './shapeStyle';

/** 计算使图片完整显示在画布内的缩放比例（含边距） */
export function computeFitZoom(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  options?: { padding?: number; minZoom?: number; maxZoom?: number }
): number {
  const padding = options?.padding ?? 32;
  const minZoom = options?.minZoom ?? VIEW_ZOOM_MIN;
  const maxZoom = options?.maxZoom ?? VIEW_ZOOM_MAX;

  if (imageWidth <= 0 || imageHeight <= 0) return 1;
  if (containerWidth <= 0 || containerHeight <= 0) return 1;

  const availableW = Math.max(containerWidth - padding * 2, 1);
  const availableH = Math.max(containerHeight - padding * 2, 1);
  const scaleX = availableW / imageWidth;
  const scaleY = availableH / imageHeight;
  const fitZoom = Math.min(scaleX, scaleY);

  return Math.min(maxZoom, Math.max(minZoom, fitZoom));
}

/** 图片在舞台坐标系中的偏移（居中 + 平移） */
export function getImageOffset(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  stagePosition: { x: number; y: number }
): { x: number; y: number } {
  const imgW = imageWidth * zoom;
  const imgH = imageHeight * zoom;
  return {
    x: (containerWidth - imgW) / 2 + stagePosition.x,
    y: (containerHeight - imgH) / 2 + stagePosition.y,
  };
}

/** 将画布可视区域转换为图片坐标系下的边界（用于十字辅助线铺满视口） */
export function getViewportBoundsInImage(
  containerWidth: number,
  containerHeight: number,
  imageOffset: { x: number; y: number },
  zoom: number
): { left: number; top: number; right: number; bottom: number } {
  if (zoom <= 0) {
    return { left: 0, top: 0, right: containerWidth, bottom: containerHeight };
  }
  return {
    left: -imageOffset.x / zoom,
    top: -imageOffset.y / zoom,
    right: (containerWidth - imageOffset.x) / zoom,
    bottom: (containerHeight - imageOffset.y) / zoom,
  };
}

export const VIEW_TRANSFORM_DURATION_MS = 180;
export const ANNOTATION_FADE_DURATION_MS = 150;

export function clampViewZoom(zoom: number): number {
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, zoom));
}

/** easeOut cubic，用于视图与透明度过渡 */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

export interface StageViewState {
  zoom: number;
  stagePosition: { x: number; y: number };
}

/**
 * 平滑过渡 zoom 与 stagePosition（requestAnimationFrame + easeOut）。
 * 返回取消函数。
 */
export function animateViewTransform(
  from: StageViewState,
  to: StageViewState,
  options: {
    duration?: number;
    onUpdate: (zoom: number, stagePosition: { x: number; y: number }) => void;
    onComplete?: () => void;
  }
): () => void {
  const duration = options.duration ?? VIEW_TRANSFORM_DURATION_MS;
  let rafId = 0;
  const startTime = performance.now();
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const elapsed = performance.now() - startTime;
    const eased = easeOutCubic(Math.min(1, elapsed / duration));
    const zoom = from.zoom + (to.zoom - from.zoom) * eased;
    const stagePosition = {
      x: from.stagePosition.x + (to.stagePosition.x - from.stagePosition.x) * eased,
      y: from.stagePosition.y + (to.stagePosition.y - from.stagePosition.y) * eased,
    };
    options.onUpdate(clampViewZoom(zoom), stagePosition);
    if (elapsed < duration) {
      rafId = requestAnimationFrame(tick);
    } else {
      options.onUpdate(clampViewZoom(to.zoom), to.stagePosition);
      options.onComplete?.();
    }
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}

/** 数值 opacity 渐变动画 */
export function animateOpacity(
  from: number,
  to: number,
  options: {
    duration?: number;
    onUpdate: (opacity: number) => void;
    onComplete?: () => void;
  }
): () => void {
  const duration = options.duration ?? ANNOTATION_FADE_DURATION_MS;
  let rafId = 0;
  const startTime = performance.now();
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const elapsed = performance.now() - startTime;
    const eased = easeOutCubic(Math.min(1, elapsed / duration));
    const value = from + (to - from) * eased;
    options.onUpdate(value);
    if (elapsed < duration) {
      rafId = requestAnimationFrame(tick);
    } else {
      options.onUpdate(to);
      options.onComplete?.();
    }
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}

/** 判断视图变换是否需要动画（避免无意义过渡） */
export function viewTransformNeedsAnimation(
  from: StageViewState,
  to: StageViewState,
  epsilon = 0.001
): boolean {
  return (
    Math.abs(from.zoom - to.zoom) > epsilon ||
    Math.abs(from.stagePosition.x - to.stagePosition.x) > 0.5 ||
    Math.abs(from.stagePosition.y - to.stagePosition.y) > 0.5
  );
}
