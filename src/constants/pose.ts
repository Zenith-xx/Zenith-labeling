import type { Annotation } from '../types';
import {
  createEmptyKeypointsForPlacement,
  DEFAULT_POSE_CONFIG,
  getMaxKeypointCount,
  type PoseConfig,
} from '../utils/poseConfig';

/** 默认关键点数量（无自定义配置时的 COCO person 17 点） */
export const POSE_DEFAULT_KEYPOINT_COUNT = getMaxKeypointCount(DEFAULT_POSE_CONFIG);

/** 至少放置几个关键点才能完成标注 */
export const POSE_MIN_KEYPOINT_COUNT = 1;

/** 新放置关键点的默认可见性（2 = 可见） */
export const POSE_KEYPOINT_VISIBLE = 2;

/** 初始化空关键点数组 [x,y,v, ...] */
export function createEmptyKeypoints(count = POSE_DEFAULT_KEYPOINT_COUNT): number[] {
  const keypoints: number[] = [];
  for (let i = 0; i < count; i++) {
    keypoints.push(0, 0, 0);
  }
  return keypoints;
}

export function createEmptyKeypointsFromConfig(config: PoseConfig): number[] {
  return createEmptyKeypointsForPlacement(config);
}

export function getPlacementKeypointCount(config: PoseConfig): number {
  return getMaxKeypointCount(config);
}

export function countVisiblePoseKeypoints(keypoints: number[]): number {
  let count = 0;
  for (let i = 2; i < keypoints.length; i += 3) {
    if ((keypoints[i] ?? 0) > 0) count++;
  }
  return count;
}

/** 独立点标注（通过 groupId 与方框绑定） */
export function isStandalonePointAnnotation(
  ann: Pick<Annotation, 'shapeType'>
): boolean {
  return ann.shapeType === 'point';
}
