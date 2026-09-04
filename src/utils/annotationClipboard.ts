import type { Annotation } from '../types';
import { getPolygonBBox } from '../types';
import { generateId } from './id';
import {
  clampPoint,
  clampRect,
  clampRectPosition,
  translatePolygonPoints,
} from './annotationBounds';
import {
  annotationPatchFromObb,
  buildObbFromParams,
  getObbCorners,
  obbFromCorners,
} from './obbGeometry';
import { clampPoseKeypoints, translatePoseKeypoints } from './poseGeometry';

/** 粘贴 / 快速复制时的位移（像素，图像坐标） */
export const ANNOTATION_PASTE_OFFSET = 10;

function cloneAnnotationDeep(ann: Annotation): Annotation {
  return {
    ...ann,
    points: ann.points ? [...ann.points] : undefined,
    keypoints: ann.keypoints ? [...ann.keypoints] : undefined,
  };
}

let clipboard: Annotation[] | null = null;
let clipboardPrimaryId: string | null = null;

export function clearAnnotationClipboard(): void {
  clipboard = null;
  clipboardPrimaryId = null;
}

export function copyAnnotationsToClipboard(
  annotations: Annotation[],
  primaryId: string
): void {
  clipboard = annotations.map(cloneAnnotationDeep);
  clipboardPrimaryId = primaryId;
}

export function hasAnnotationClipboard(): boolean {
  return clipboard !== null && clipboard.length > 0;
}

/** 仅复制当前选中的单个标注 */
export function getAnnotationsForCopy(
  all: Annotation[],
  selectedId: string
): { annotations: Annotation[]; primaryId: string } | null {
  const selected = all.find((a) => a.id === selectedId);
  if (!selected) return null;
  return { annotations: [selected], primaryId: selectedId };
}

function translateAnnotation(
  ann: Annotation,
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): Annotation {
  const base: Annotation = {
    ...ann,
    id: generateId(),
    hidden: false,
    groupId: ann.groupId,
    points: ann.points ? [...ann.points] : undefined,
    keypoints: ann.keypoints ? [...ann.keypoints] : undefined,
  };

  if (ann.shapeType === 'point') {
    const p = clampPoint(ann.x + dx, ann.y + dy, maxWidth, maxHeight);
    return { ...base, x: p.x, y: p.y };
  }

  if (ann.shapeType === 'polygon' && ann.points) {
    const points = translatePolygonPoints(ann.points, dx, dy, maxWidth, maxHeight);
    const bbox = getPolygonBBox(points);
    return { ...base, points, ...bbox };
  }

  if (ann.shapeType === 'rotated-rectangle') {
    const corners =
      ann.points && ann.points.length >= 8
        ? ann.points
        : getObbCorners(ann.x, ann.y, ann.width, ann.height, ann.angle ?? 0);
    const points = translatePolygonPoints(corners, dx, dy, maxWidth, maxHeight);
    const parsed = obbFromCorners(points);
    const obb = buildObbFromParams(
      parsed.x,
      parsed.y,
      parsed.width,
      parsed.height,
      parsed.angle
    );
    const patch = annotationPatchFromObb(obb);
    return {
      ...base,
      x: patch.x!,
      y: patch.y!,
      width: patch.width!,
      height: patch.height!,
      angle: patch.angle,
      points: patch.points,
    };
  }

  if (ann.shapeType === 'pose') {
    const pos = clampRectPosition(
      ann.x + dx,
      ann.y + dy,
      ann.width,
      ann.height,
      maxWidth,
      maxHeight
    );
    const actualDx = pos.x - ann.x;
    const actualDy = pos.y - ann.y;
    const keypoints = translatePoseKeypoints(
      ann.keypoints ?? [],
      actualDx,
      actualDy,
      maxWidth,
      maxHeight
    );
    return {
      ...base,
      x: pos.x,
      y: pos.y,
      width: ann.width,
      height: ann.height,
      keypoints: clampPoseKeypoints(keypoints, maxWidth, maxHeight),
    };
  }

  const clamped = clampRect(
    ann.x + dx,
    ann.y + dy,
    ann.width,
    ann.height,
    maxWidth,
    maxHeight
  );
  return { ...base, ...clamped };
}

function buildOffsetCopies(
  source: Annotation[],
  primarySourceId: string,
  maxWidth: number,
  maxHeight: number,
  offset: number
): { annotations: Annotation[]; primaryId: string } {
  const idMap = new Map<string, string>();
  const copied: Annotation[] = [];

  for (const ann of source) {
    const next = translateAnnotation(ann, offset, offset, maxWidth, maxHeight);
    idMap.set(ann.id, next.id);
    copied.push(next);
  }

  const primaryId =
    idMap.get(primarySourceId) ?? copied[copied.length - 1]?.id ?? '';

  return { annotations: copied, primaryId };
}

export function buildPasteResult(
  maxWidth: number,
  maxHeight: number,
  offset = ANNOTATION_PASTE_OFFSET
): { annotations: Annotation[]; primaryId: string } | null {
  if (!clipboard || clipboard.length === 0) return null;
  return buildOffsetCopies(
    clipboard,
    clipboardPrimaryId ?? clipboard[0].id,
    maxWidth,
    maxHeight,
    offset
  );
}

export function buildDuplicateResult(
  all: Annotation[],
  selectedId: string,
  maxWidth: number,
  maxHeight: number,
  offset = ANNOTATION_PASTE_OFFSET
): { annotations: Annotation[]; primaryId: string } | null {
  const copySet = getAnnotationsForCopy(all, selectedId);
  if (!copySet) return null;
  return buildOffsetCopies(
    copySet.annotations,
    copySet.primaryId,
    maxWidth,
    maxHeight,
    offset
  );
}
