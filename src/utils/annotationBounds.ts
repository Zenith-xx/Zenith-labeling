import { distanceToSegment } from './polygonGeometry';

/** 将坐标限制在图片范围内 */
export function clampPoint(
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
): { x: number; y: number } {
  if (maxWidth <= 0 || maxHeight <= 0) return { x, y };
  return {
    x: Math.max(0, Math.min(x, maxWidth)),
    y: Math.max(0, Math.min(y, maxHeight)),
  };
}

/** 将矩形位置限制在图片内（整框不超出边界） */
export function clampRectPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { x: number; y: number } {
  if (maxWidth <= 0 || maxHeight <= 0) return { x, y };

  const maxX = Math.max(0, maxWidth - width);
  const maxY = Math.max(0, maxHeight - height);

  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

/**
 * 将矩形裁剪到图片范围内（与原矩形取交集，结果完全在图片内）
 * 用于标注完成、移动结束、缩放角点后的最终校正
 */
export function clampRect(
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  minSize = 5
): { x: number; y: number; width: number; height: number } {
  if (maxWidth <= 0 || maxHeight <= 0) {
    return { x, y, width, height };
  }

  if (width <= 0 || height <= 0) {
    const w = Math.min(maxWidth, minSize);
    const h = Math.min(maxHeight, minSize);
    return { x: 0, y: 0, width: w, height: h };
  }

  const right = x + width;
  const bottom = y + height;

  const clipLeft = Math.max(0, x);
  const clipTop = Math.max(0, y);
  const clipRight = Math.min(maxWidth, right);
  const clipBottom = Math.min(maxHeight, bottom);

  let w = clipRight - clipLeft;
  let h = clipBottom - clipTop;

  if (w < minSize || h < minSize) {
    const fallbackW = Math.min(maxWidth, Math.max(minSize, width));
    const fallbackH = Math.min(maxHeight, Math.max(minSize, height));
    const px = Math.max(0, Math.min(Math.max(0, x), maxWidth - fallbackW));
    const py = Math.max(0, Math.min(Math.max(0, y), maxHeight - fallbackH));
    return {
      x: px,
      y: py,
      width: Math.max(minSize, Math.min(fallbackW, maxWidth)),
      height: Math.max(minSize, Math.min(fallbackH, maxHeight)),
    };
  }

  w = Math.max(minSize, Math.min(w, maxWidth));
  h = Math.max(minSize, Math.min(h, maxHeight));

  let px = clipLeft;
  let py = clipTop;

  if (px + w > maxWidth) px = maxWidth - w;
  if (py + h > maxHeight) py = maxHeight - h;

  return {
    x: Math.max(0, px),
    y: Math.max(0, py),
    width: w,
    height: h,
  };
}

/** 由对角两点生成矩形（绘制过程中不裁剪，允许超出图片） */
export function rectFromDiagonal(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; width: number; height: number } {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 限制多边形各顶点在图片范围内（逐点 clamp，会改变形状，仅用于单顶点编辑或入库校正） */
export function clampPolygonPoints(
  points: number[],
  maxWidth: number,
  maxHeight: number
): number[] {
  if (maxWidth <= 0 || maxHeight <= 0) return points;
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const p = clampPoint(points[i], points[i + 1], maxWidth, maxHeight);
    result.push(p.x, p.y);
  }
  return result;
}

/** 刚性平移多边形：整体移动，仅在触边时限制 dx/dy，不挤压形状 */
export function translatePolygonPoints(
  points: number[],
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): number[] {
  if (points.length < 4) return points;
  if (maxWidth <= 0 || maxHeight <= 0) {
    const next: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      next.push(points[i] + dx, points[i + 1] + dy);
    }
    return next;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }

  const clampedDx = Math.max(-minX, Math.min(dx, maxWidth - maxX));
  const clampedDy = Math.max(-minY, Math.min(dy, maxHeight - maxY));

  const next: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    next.push(points[i] + clampedDx, points[i + 1] + clampedDy);
  }
  return next;
}

export interface RectangleHitTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRectangle(
  x: number,
  y: number,
  rect: Pick<RectangleHitTarget, 'x' | 'y' | 'width' | 'height'>
): boolean {
  const { width, height } = rect;
  if (width <= 0 || height <= 0) return false;
  return (
    x >= rect.x &&
    x <= rect.x + width &&
    y >= rect.y &&
    y <= rect.y + height
  );
}

/** 点到矩形边框的屏幕像素距离（0 = 在边上，内部为到最近边的距离） */
export function distanceToRectBorderScreen(
  x: number,
  y: number,
  rect: Pick<RectangleHitTarget, 'x' | 'y' | 'width' | 'height'>,
  zoom: number
): number {
  const { width, height } = rect;
  if (width <= 0 || height <= 0) return Infinity;

  const safeZoom = Math.max(zoom, 1e-6);
  const sx = x * safeZoom;
  const sy = y * safeZoom;
  const left = rect.x * safeZoom;
  const top = rect.y * safeZoom;
  const right = (rect.x + width) * safeZoom;
  const bottom = (rect.y + height) * safeZoom;

  const insideX = sx >= left && sx <= right;
  const insideY = sy >= top && sy <= bottom;

  if (insideX && insideY) {
    return Math.min(sx - left, right - sx, sy - top, bottom - sy);
  }

  const dx = insideX ? 0 : sx < left ? left - sx : sx - right;
  const dy = insideY ? 0 : sy < top ? top - sy : sy - bottom;
  if (!insideX && !insideY) return Math.hypot(dx, dy);
  return Math.max(dx, dy);
}

/** 点是否在矩形边框附近的固定屏幕像素容差内 */
export function pointNearRectBorderScreen(
  x: number,
  y: number,
  rect: Pick<RectangleHitTarget, 'x' | 'y' | 'width' | 'height'>,
  zoom: number,
  screenTolerance: number
): boolean {
  if (screenTolerance <= 0) return false;
  return distanceToRectBorderScreen(x, y, rect, zoom) <= screenTolerance;
}

/** 点是否落在折线边框附近（按线段距离，匹配画布描边路径） */
export function pointNearPolylineBorder(
  x: number,
  y: number,
  points: number[],
  tolerance: number,
  closed = true
): boolean {
  const vertexCount = points.length / 2;
  if (vertexCount < 2 || tolerance <= 0) return false;

  const edgeCount = closed ? vertexCount : vertexCount - 1;
  for (let i = 0; i < edgeCount; i++) {
    const j = closed ? (i + 1) % vertexCount : i + 1;
    const x1 = points[i * 2];
    const y1 = points[i * 2 + 1];
    const x2 = points[j * 2];
    const y2 = points[j * 2 + 1];
    if (distanceToSegment(x, y, x1, y1, x2, y2) <= tolerance) {
      return true;
    }
  }
  return false;
}

/** 点是否落在矩形边框附近（用于重叠方框按边线选中） */
export function pointNearRectangleBorder(
  x: number,
  y: number,
  rect: Pick<RectangleHitTarget, 'x' | 'y' | 'width' | 'height'>,
  tolerance: number
): boolean {
  const { width, height } = rect;
  if (width <= 0 || height <= 0 || tolerance <= 0) return false;

  const left = rect.x;
  const right = rect.x + width;
  const top = rect.y;
  const bottom = rect.y + height;
  const edges = [
    left,
    top,
    right,
    top,
    right,
    bottom,
    left,
    bottom,
    left,
    top,
  ];
  return pointNearPolylineBorder(x, y, edges, tolerance, false);
}

/**
 * 重叠方框优先选中面积最小者（按边框命中）
 */
export function pickSmallestRectangleAtPoint(
  x: number,
  y: number,
  rectangles: RectangleHitTarget[],
  tolerance: number
): string | null {
  let bestId: string | null = null;
  let bestArea = Infinity;
  let bestIndex = -1;

  for (let i = 0; i < rectangles.length; i++) {
    const rect = rectangles[i];
    if (!pointNearRectangleBorder(x, y, rect, tolerance)) continue;
    const area = rect.width * rect.height;
    if (area < bestArea || (area === bestArea && i > bestIndex)) {
      bestArea = area;
      bestId = rect.id;
      bestIndex = i;
    }
  }

  return bestId;
}
