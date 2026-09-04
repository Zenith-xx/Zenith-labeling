import { clampPoint } from './annotationBounds';
import type { Annotation } from '../types';
import type { ViewportRect } from './spatialIndex';

export interface PoseGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  keypoints: number[];
}

/** 关键点可见性：v > 0 表示已标注 */
export function isPoseKeypointVisible(v: number): boolean {
  return v > 0;
}

export function hasVisiblePoseKeypoints(keypoints: number[]): boolean {
  for (let i = 2; i < keypoints.length; i += 3) {
    if (isPoseKeypointVisible(keypoints[i] ?? 0)) return true;
  }
  return false;
}

export function getPoseKeypointCount(keypoints: number[]): number {
  return Math.floor(keypoints.length / 3);
}

/** 限制可见关键点坐标；不可见点保持 0,0,v */
export function clampPoseKeypoints(
  keypoints: number[],
  maxWidth: number,
  maxHeight: number
): number[] {
  if (maxWidth <= 0 || maxHeight <= 0) return keypoints;

  const result: number[] = [];
  for (let i = 0; i < keypoints.length; i += 3) {
    const v = keypoints[i + 2] ?? 0;
    if (!isPoseKeypointVisible(v)) {
      result.push(0, 0, v);
      continue;
    }
    const p = clampPoint(keypoints[i], keypoints[i + 1], maxWidth, maxHeight);
    result.push(p.x, p.y, v);
  }
  return result;
}

/** 平移关键点坐标（用于复制/粘贴整组标注，不用于方框拖动） */
export function translatePoseKeypoints(
  keypoints: number[],
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): number[] {
  const next: number[] = [];
  for (let i = 0; i < keypoints.length; i += 3) {
    const v = keypoints[i + 2] ?? 0;
    if (!isPoseKeypointVisible(v)) {
      next.push(0, 0, v);
      continue;
    }
    const p = clampPoint(keypoints[i] + dx, keypoints[i + 1] + dy, maxWidth, maxHeight);
    next.push(p.x, p.y, v);
  }
  return next;
}

/** Pose 外接框：bbox 与可见关键点的并集 */
export function getPoseUnionBBox(
  x: number,
  y: number,
  width: number,
  height: number,
  keypoints?: number[]
): ViewportRect {
  let minX = x;
  let minY = y;
  let maxX = x + width;
  let maxY = y + height;

  if (keypoints) {
    for (let i = 0; i < keypoints.length; i += 3) {
      const v = keypoints[i + 2] ?? 0;
      if (!isPoseKeypointVisible(v)) continue;
      const kx = keypoints[i];
      const ky = keypoints[i + 1];
      if (kx === 0 && ky === 0) continue;
      minX = Math.min(minX, kx);
      minY = Math.min(minY, ky);
      maxX = Math.max(maxX, kx);
      maxY = Math.max(maxY, ky);
    }
  }

  return { minX, minY, maxX, maxY };
}

export function poseGeometryFromAnnotation(ann: Annotation): PoseGeometry {
  return {
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
    keypoints: ann.keypoints ? [...ann.keypoints] : [],
  };
}

export function poseGeometryEqual(a: PoseGeometry, b: PoseGeometry, eps = 0.5): boolean {
  if (
    Math.abs(a.x - b.x) > eps ||
    Math.abs(a.y - b.y) > eps ||
    Math.abs(a.width - b.width) > eps ||
    Math.abs(a.height - b.height) > eps ||
    a.keypoints.length !== b.keypoints.length
  ) {
    return false;
  }
  for (let i = 0; i < a.keypoints.length; i++) {
    if (Math.abs(a.keypoints[i] - b.keypoints[i]) > eps) return false;
  }
  return true;
}

export function setPoseKeypoint(
  keypoints: number[],
  index: number,
  x: number,
  y: number,
  visibility = 2
): number[] {
  const next = [...keypoints];
  const offset = index * 3;
  next[offset] = x;
  next[offset + 1] = y;
  next[offset + 2] = visibility;
  return next;
}
