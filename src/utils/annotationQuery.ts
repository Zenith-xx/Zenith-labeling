import type { Annotation } from '../types';
import { getPolygonBBox } from '../types';
import {
  AnnotationSpatialIndex,
  type ViewportRect,
} from './spatialIndex';
import { getImageOffset, getViewportBoundsInImage } from './canvasView';
import { pointInRectangle, distanceToRectBorderScreen } from './annotationBounds';
import { getObbAxisAlignedBBox, getObbCorners, pointInObb } from './obbGeometry';
import { getPoseUnionBBox } from './poseGeometry';
import {
  BORDER_HIT_SIZE,
  getPointHitRadiusImage,
  imageSizeForZoom,
} from './shapeStyle';

export type { ViewportRect };

/** 视口外扩（图片像素），避免边缘标注突然消失 */
const VIEWPORT_PAD = 64;

export function computeViewportRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  stagePosition: { x: number; y: number },
  pad = VIEWPORT_PAD
): ViewportRect {
  const offset = getImageOffset(
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
    zoom,
    stagePosition
  );
  const bounds = getViewportBoundsInImage(
    containerWidth,
    containerHeight,
    offset,
    zoom
  );
  return {
    minX: bounds.left - pad,
    minY: bounds.top - pad,
    maxX: bounds.right + pad,
    maxY: bounds.bottom + pad,
  };
}

/**
 * 按视口从空间索引取可见标注，并按面积从大到小排序（小框在上层绘制）。
 */
export function getVisibleAnnotations(
  index: AnnotationSpatialIndex,
  annotationsById: Map<string, Annotation>,
  viewport: ViewportRect
): Annotation[] {
  const hits = index.search(viewport);
  const visible: Annotation[] = [];
  for (const hit of hits) {
    const ann = annotationsById.get(hit.annotationId);
    if (!ann || ann.hidden) continue;
    visible.push(ann);
  }

  visible.sort((a, b) => annotationArea(b) - annotationArea(a));
  return visible;
}

function annotationArea(ann: Annotation): number {
  if (ann.shapeType === 'rotated-rectangle') {
    const bbox = getObbAxisAlignedBBox(
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.angle ?? 0
    );
    return bbox.width * bbox.height;
  }
  if (ann.shapeType === 'rectangle') {
    return (ann.width ?? 0) * (ann.height ?? 0);
  }
  if (ann.shapeType === 'polygon' && ann.points) {
    const b = getPolygonBBox(ann.points);
    return b.width * b.height;
  }
  if (ann.shapeType === 'pose') {
    const union = getPoseUnionBBox(ann.x, ann.y, ann.width, ann.height, ann.keypoints);
    return (union.maxX - union.minX) * (union.maxY - union.minY);
  }
  return 1;
}

/** 边框命中容差（图像坐标），对应固定屏幕像素 BORDER_HIT_SIZE */
export function getAnnotationBorderHitTolerance(zoom: number): number {
  return imageSizeForZoom(BORDER_HIT_SIZE, zoom);
}

function distanceToObbBorderScreen(
  x: number,
  y: number,
  ann: { x: number; y: number; width: number; height: number; angle?: number },
  zoom: number
): number {
  const safeZoom = Math.max(zoom, 1e-6);
  const sx = x * safeZoom;
  const sy = y * safeZoom;
  const corners = getObbCorners(ann.x, ann.y, ann.width, ann.height, ann.angle ?? 0);
  let best = Infinity;
  for (let i = 0; i < corners.length; i += 2) {
    const j = (i + 2) % corners.length;
    const dist = distanceToSegmentScreen(
      sx,
      sy,
      corners[i] * safeZoom,
      corners[i + 1] * safeZoom,
      corners[j] * safeZoom,
      corners[j + 1] * safeZoom
    );
    if (dist < best) best = dist;
  }
  return best;
}

function distanceToSegmentScreen(
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
  if (lenSq < 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distanceToPolygonBorderScreen(
  x: number,
  y: number,
  points: number[],
  zoom: number
): number {
  const safeZoom = Math.max(zoom, 1e-6);
  const sx = x * safeZoom;
  const sy = y * safeZoom;
  const vertexCount = points.length / 2;
  if (vertexCount < 2) return Infinity;

  let best = Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const j = (i + 1) % vertexCount;
    const dist = distanceToSegmentScreen(
      sx,
      sy,
      points[i * 2] * safeZoom,
      points[i * 2 + 1] * safeZoom,
      points[j * 2] * safeZoom,
      points[j * 2 + 1] * safeZoom
    );
    if (dist < best) best = dist;
  }
  return best;
}

function considerBorderHit(
  annId: string,
  area: number,
  borderDist: number,
  pick: { bestBorderId: string | null; bestBorderArea: number; bestBorderDist: number }
): void {
  if (
    area < pick.bestBorderArea ||
    (area === pick.bestBorderArea && borderDist < pick.bestBorderDist)
  ) {
    pick.bestBorderArea = area;
    pick.bestBorderDist = borderDist;
    pick.bestBorderId = annId;
  }
}

/**
 * 用空间索引做悬停/点击命中：重叠时按边框选中，非重叠时仍可按内部区域选中。
 */
export function pickAnnotationAtPoint(
  index: AnnotationSpatialIndex,
  annotationsById: Map<string, Annotation>,
  x: number,
  y: number,
  options?: {
    shapeTypes?: Annotation['shapeType'][];
    borderHitTolerance?: number;
    zoom?: number;
  }
): string | null {
  const zoom = options?.zoom ?? 1;
  const borderScreenPx = BORDER_HIT_SIZE;
  const tolerance =
    options?.borderHitTolerance ?? getAnnotationBorderHitTolerance(zoom);
  const candidates = index.searchPoint(x, y, Math.max(tolerance * 1.5, 4));

  const borderPick = {
    bestBorderId: null as string | null,
    bestBorderArea: Infinity,
    bestBorderDist: Infinity,
  };
  let bestFillId: string | null = null;
  let bestFillArea = Infinity;

  for (const hit of candidates) {
    const ann = annotationsById.get(hit.annotationId);
    if (!ann || ann.hidden) continue;
    if (options?.shapeTypes && !options.shapeTypes.includes(ann.shapeType)) {
      continue;
    }

    if (ann.shapeType === 'rotated-rectangle') {
      const bbox = getObbAxisAlignedBBox(
        ann.x,
        ann.y,
        ann.width,
        ann.height,
        ann.angle ?? 0
      );
      const area = bbox.width * bbox.height;
      const borderDist = distanceToObbBorderScreen(x, y, ann, zoom);
      const onBorder = borderDist <= borderScreenPx;
      const inFill = pointInObb(
        x,
        y,
        ann.x,
        ann.y,
        ann.width,
        ann.height,
        ann.angle ?? 0
      );
      if (onBorder) {
        considerBorderHit(ann.id, area, borderDist, borderPick);
      }
      if (inFill && area < bestFillArea) {
        bestFillArea = area;
        bestFillId = ann.id;
      }
      continue;
    }

    if (ann.shapeType === 'rectangle') {
      const rect = {
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
      };
      const area = ann.width * ann.height;
      const borderDist = distanceToRectBorderScreen(x, y, rect, zoom);
      const onBorder = borderDist <= borderScreenPx;
      const inFill = pointInRectangle(x, y, rect);
      if (onBorder) {
        considerBorderHit(ann.id, area, borderDist, borderPick);
      }
      if (inFill && area < bestFillArea) {
        bestFillArea = area;
        bestFillId = ann.id;
      }
      continue;
    }

    if (ann.shapeType === 'point') {
      const dx = x - ann.x;
      const dy = y - ann.y;
      const hitRadius = getPointHitRadiusImage(zoom);
      if (dx * dx + dy * dy > hitRadius * hitRadius) continue;
      if (1 < bestFillArea) {
        bestFillArea = 1;
        bestFillId = ann.id;
      }
      continue;
    }

    if (ann.shapeType === 'polygon' && ann.points && ann.points.length >= 6) {
      const area = annotationArea(ann);
      const borderDist = distanceToPolygonBorderScreen(x, y, ann.points, zoom);
      const onBorder = borderDist <= borderScreenPx;
      const inFill = pointInPolygon(x, y, ann.points);
      if (onBorder) {
        considerBorderHit(ann.id, area, borderDist, borderPick);
      }
      if (inFill && area < bestFillArea) {
        bestFillArea = area;
        bestFillId = ann.id;
      }
      continue;
    }

    if (ann.shapeType === 'pose') {
      const union = getPoseUnionBBox(ann.x, ann.y, ann.width, ann.height, ann.keypoints);
      if (x < union.minX || x > union.maxX || y < union.minY || y > union.maxY) {
        continue;
      }
      const rect = {
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
      };
      const area = annotationArea(ann);
      const borderDist = distanceToRectBorderScreen(x, y, rect, zoom);
      const onBoxBorder = borderDist <= borderScreenPx;
      const inBoxFill = pointInRectangle(x, y, rect);
      let hitKpt = false;
      const kpts = ann.keypoints ?? [];
      const kptHitRadius = getPointHitRadiusImage(zoom);
      const kptHitRadiusSq = kptHitRadius * kptHitRadius;
      for (let i = 0; i < kpts.length; i += 3) {
        const v = kpts[i + 2] ?? 0;
        if (v <= 0) continue;
        const dx = x - kpts[i];
        const dy = y - kpts[i + 1];
        if (dx * dx + dy * dy <= kptHitRadiusSq) {
          hitKpt = true;
          break;
        }
      }
      if (onBoxBorder) {
        considerBorderHit(ann.id, area, borderDist, borderPick);
      }
      if ((inBoxFill || hitKpt) && area < bestFillArea) {
        bestFillArea = area;
        bestFillId = ann.id;
      }
    }
  }

  return resolvePickWinner(
    borderPick.bestBorderId,
    bestFillId,
    annotationsById
  );
}

function pointInPolygon(x: number, y: number, points: number[]): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type AxisBounds = { minX: number; minY: number; maxX: number; maxY: number };

function getAnnotationAxisBounds(ann: Annotation): AxisBounds {
  if (ann.shapeType === 'rotated-rectangle') {
    const bbox = getObbAxisAlignedBBox(
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.angle ?? 0
    );
    return {
      minX: bbox.x,
      minY: bbox.y,
      maxX: bbox.x + bbox.width,
      maxY: bbox.y + bbox.height,
    };
  }
  if (ann.shapeType === 'rectangle') {
    return {
      minX: ann.x,
      minY: ann.y,
      maxX: ann.x + ann.width,
      maxY: ann.y + ann.height,
    };
  }
  if (ann.shapeType === 'polygon' && ann.points) {
    const bbox = getPolygonBBox(ann.points);
    return {
      minX: bbox.x,
      minY: bbox.y,
      maxX: bbox.x + bbox.width,
      maxY: bbox.y + bbox.height,
    };
  }
  if (ann.shapeType === 'pose') {
    return getPoseUnionBBox(ann.x, ann.y, ann.width, ann.height, ann.keypoints);
  }
  if (ann.shapeType === 'point') {
    return { minX: ann.x, minY: ann.y, maxX: ann.x, maxY: ann.y };
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** 两标注填充区域是否有面积重叠（相邻贴边不算重叠） */
function annotationFillsOverlap(a: Annotation, b: Annotation): boolean {
  const boundsA = getAnnotationAxisBounds(a);
  const boundsB = getAnnotationAxisBounds(b);
  const overlapW = Math.min(boundsA.maxX, boundsB.maxX) - Math.max(boundsA.minX, boundsB.minX);
  const overlapH = Math.min(boundsA.maxY, boundsB.maxY) - Math.max(boundsA.minY, boundsB.minY);
  return overlapW > 0 && overlapH > 0;
}

function resolvePickWinner(
  bestBorderId: string | null,
  bestFillId: string | null,
  annotationsById: Map<string, Annotation>
): string | null {
  if (bestBorderId && bestFillId && bestBorderId !== bestFillId) {
    const fillAnn = annotationsById.get(bestFillId);
    const borderAnn = annotationsById.get(bestBorderId);
    // 相邻框：边框容差会伸进邻框内部，此时以实际落在内部的填充为准
    if (fillAnn && borderAnn && !annotationFillsOverlap(fillAnn, borderAnn)) {
      return bestFillId;
    }
    return bestBorderId;
  }
  if (bestBorderId) return bestBorderId;
  return bestFillId;
}

/** 构建 id → Annotation 映射，供查询层 O(1) 取对象 */
export function buildAnnotationMap(
  annotations: Annotation[]
): Map<string, Annotation> {
  const map = new Map<string, Annotation>();
  for (const ann of annotations) {
    map.set(ann.id, ann);
  }
  return map;
}
