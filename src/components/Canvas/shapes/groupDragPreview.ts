import type { Annotation } from '../../../types';
import { getObbCorners } from '../../../utils/obbGeometry';

/** 多选拖动：记录每个标注在拖动开始时的位置，用于联动预览 */
export interface GroupDragSnapshot {
  shapeType: Annotation['shapeType'];
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  points?: number[];
  keypoints?: number[];
}

export function snapshotAnnotationForGroupDrag(ann: Annotation): GroupDragSnapshot {
  return {
    shapeType: ann.shapeType,
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
    angle: ann.angle,
    points: ann.points ? [...ann.points] : undefined,
    keypoints: ann.keypoints ? [...ann.keypoints] : undefined,
  };
}

/** 整组刚性平移：统一限制 dx/dy，避免各框单独贴边导致相互挤压 */
export function clampGroupDragDelta(
  snapshots: Iterable<GroupDragSnapshot>,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): { dx: number; dy: number } {
  if (imageWidth <= 0 || imageHeight <= 0) return { dx, dy };

  let minDx = -Infinity;
  let maxDx = Infinity;
  let minDy = -Infinity;
  let maxDy = Infinity;

  const considerPoint = (px: number, py: number): void => {
    minDx = Math.max(minDx, -px);
    maxDx = Math.min(maxDx, imageWidth - px);
    minDy = Math.max(minDy, -py);
    maxDy = Math.min(maxDy, imageHeight - py);
  };

  const considerRect = (x: number, y: number, width: number, height: number): void => {
    considerPoint(x, y);
    considerPoint(x + width, y + height);
  };

  for (const snap of snapshots) {
    if (snap.shapeType === 'polygon' && snap.points && snap.points.length >= 4) {
      for (let i = 0; i < snap.points.length; i += 2) {
        considerPoint(snap.points[i], snap.points[i + 1]);
      }
      continue;
    }

    if (snap.shapeType === 'rotated-rectangle') {
      const corners =
        snap.points && snap.points.length >= 8
          ? snap.points
          : getObbCorners(snap.x, snap.y, snap.width, snap.height, snap.angle ?? 0);
      for (let i = 0; i < corners.length; i += 2) {
        considerPoint(corners[i], corners[i + 1]);
      }
      continue;
    }

    if (snap.shapeType === 'point') {
      considerPoint(snap.x, snap.y);
      continue;
    }

    considerRect(snap.x, snap.y, snap.width, snap.height);
  }

  return {
    dx: Math.max(minDx, Math.min(dx, maxDx)),
    dy: Math.max(minDy, Math.min(dy, maxDy)),
  };
}

export function rigidTranslatePoints(points: number[], dx: number, dy: number): number[] {
  const next: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    next.push(points[i] + dx, points[i + 1] + dy);
  }
  return next;
}

export interface GroupDragPreviewCapable {
  beginGroupDragPreview(): void;
  applyGroupDragPreview(dx: number, dy: number): void;
  clearGroupDragPreview(): void;
}

export function isGroupDragPreviewCapable(
  host: unknown
): host is GroupDragPreviewCapable {
  const candidate = host as GroupDragPreviewCapable;
  return (
    typeof candidate?.beginGroupDragPreview === 'function' &&
    typeof candidate?.applyGroupDragPreview === 'function' &&
    typeof candidate?.clearGroupDragPreview === 'function'
  );
}
