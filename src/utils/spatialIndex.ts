import RBush from 'rbush';
import type { Annotation } from '../types';
import { getPolygonBBox } from '../types';
import { POINT_HIT_SIZE } from './shapeStyle';
import { getObbAxisAlignedBBox } from './obbGeometry';
import { getPoseUnionBBox } from './poseGeometry';

/** 空间索引条目（RBush bbox + 标注 id） */
export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  annotationId: string;
}

export interface ViewportRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 关键点默认包围盒半边长（与画布命中区一致） */
const POINT_HALF_SIZE = POINT_HIT_SIZE / 2;

export function annotationToBBox(ann: Annotation): ViewportRect | null {
  if (ann.hidden) return null;

  if (ann.shapeType === 'polygon' && ann.points && ann.points.length >= 6) {
    const bbox = getPolygonBBox(ann.points);
    return {
      minX: bbox.x,
      minY: bbox.y,
      maxX: bbox.x + bbox.width,
      maxY: bbox.y + bbox.height,
    };
  }

  if (ann.shapeType === 'point') {
    const hx = POINT_HALF_SIZE;
    const hy = POINT_HALF_SIZE;
    return {
      minX: ann.x - hx,
      minY: ann.y - hy,
      maxX: ann.x + hx,
      maxY: ann.y + hy,
    };
  }

  if (ann.shapeType === 'rotated-rectangle') {
    const bbox = getObbAxisAlignedBBox(
      ann.x,
      ann.y,
      ann.width ?? 0,
      ann.height ?? 0,
      ann.angle ?? 0
    );
    if (bbox.width <= 0 || bbox.height <= 0) return null;
    return {
      minX: bbox.x,
      minY: bbox.y,
      maxX: bbox.x + bbox.width,
      maxY: bbox.y + bbox.height,
    };
  }

  if (ann.shapeType === 'pose') {
    const union = getPoseUnionBBox(
      ann.x,
      ann.y,
      ann.width ?? 0,
      ann.height ?? 0,
      ann.keypoints
    );
    if (union.maxX <= union.minX || union.maxY <= union.minY) return null;
    return union;
  }

  // rectangle / fallback
  const w = ann.width ?? 0;
  const h = ann.height ?? 0;
  if (w <= 0 || h <= 0) return null;
  return {
    minX: ann.x,
    minY: ann.y,
    maxX: ann.x + w,
    maxY: ann.y + h,
  };
}

export function toSpatialItem(ann: Annotation): SpatialItem | null {
  const box = annotationToBBox(ann);
  if (!box) return null;
  return {
    ...box,
    annotationId: ann.id,
  };
}

/**
 * 基于 RBush 的标注空间索引。
 * 查询复杂度约 O(log n + k)，k 为命中数量。
 */
export class AnnotationSpatialIndex {
  private tree = new RBush<SpatialItem>();
  private byId = new Map<string, SpatialItem>();

  clear(): void {
    this.tree.clear();
    this.byId.clear();
  }

  /** 全量重建（切换图片 / 大批量导入时用） */
  rebuild(annotations: Annotation[]): void {
    this.clear();
    const items: SpatialItem[] = [];
    for (const ann of annotations) {
      const item = toSpatialItem(ann);
      if (!item) continue;
      items.push(item);
      this.byId.set(ann.id, item);
    }
    if (items.length > 0) {
      this.tree.load(items);
    }
  }

  insert(ann: Annotation): void {
    const item = toSpatialItem(ann);
    if (!item) return;
    const existing = this.byId.get(ann.id);
    if (existing) {
      this.tree.remove(existing);
    }
    this.byId.set(ann.id, item);
    this.tree.insert(item);
  }

  remove(annotationId: string): void {
    const existing = this.byId.get(annotationId);
    if (!existing) return;
    this.tree.remove(existing);
    this.byId.delete(annotationId);
  }

  update(ann: Annotation): void {
    this.remove(ann.id);
    if (!ann.hidden) {
      this.insert(ann);
    }
  }

  search(rect: ViewportRect): SpatialItem[] {
    return this.tree.search(rect);
  }

  /** 点查询：先搜小范围 bbox，再交由调用方做精确命中 */
  searchPoint(x: number, y: number, pad = 1): SpatialItem[] {
    return this.tree.search({
      minX: x - pad,
      minY: y - pad,
      maxX: x + pad,
      maxY: y + pad,
    });
  }

  size(): number {
    return this.byId.size;
  }
}
