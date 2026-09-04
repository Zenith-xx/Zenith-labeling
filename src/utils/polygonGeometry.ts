/** 多边形边/顶点几何（边插点等） */

/** 射线法：点是否在多边形内（奇偶规则，支持自相交） */
export function isPointInPolygon(px: number, py: number, points: number[]): boolean {
  const n = points.length / 2;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    const denom = yj - yi || 1e-30;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function projectPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

/**
 * 最近边索引 i：在顶点 i-1 与顶点 i 之间（闭合）。
 * 与 LabelMe `Shape.nearest_edge` 一致。
 */
export function nearestPolygonEdge(
  points: number[],
  px: number,
  py: number,
  epsilon: number,
  vertexExclusionRadius: number
): { edgeIndex: number; projected: { x: number; y: number } } | null {
  const vertexCount = points.length / 2;
  if (vertexCount < 3) return null;

  let minDistance = Infinity;
  let bestEdge: number | null = null;
  let bestProjected = { x: 0, y: 0 };

  for (let i = 0; i < vertexCount; i++) {
    const prev = (i - 1 + vertexCount) % vertexCount;
    const x1 = points[prev * 2];
    const y1 = points[prev * 2 + 1];
    const x2 = points[i * 2];
    const y2 = points[i * 2 + 1];

    const dist = distanceToSegment(px, py, x1, y1, x2, y2);
    if (dist > epsilon || dist >= minDistance) continue;

    const projected = projectPointOnSegment(px, py, x1, y1, x2, y2);
    const d1 = Math.hypot(projected.x - x1, projected.y - y1);
    const d2 = Math.hypot(projected.x - x2, projected.y - y2);
    if (d1 < vertexExclusionRadius || d2 < vertexExclusionRadius) continue;

    minDistance = dist;
    bestEdge = i;
    bestProjected = projected;
  }

  if (bestEdge === null) return null;
  return { edgeIndex: bestEdge, projected: bestProjected };
}

/** 在边索引 i 处插入新顶点（插入到 flat points 的 i*2 位置） */
export function insertPolygonVertex(
  points: number[],
  edgeIndex: number,
  x: number,
  y: number
): number[] {
  const insertAt = edgeIndex * 2;
  const next = [...points];
  next.splice(insertAt, 0, x, y);
  return next;
}
