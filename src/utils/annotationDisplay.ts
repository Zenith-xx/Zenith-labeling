import type { Annotation, AnnotationShapeType } from '../types';
import { isPoseKeypointVisible } from './poseGeometry';

const POSE_BINDABLE_SHAPES: ReadonlySet<AnnotationShapeType> = new Set([
  'rectangle',
  'pose',
  'rotated-rectangle',
]);

export function isPoseBindableShape(shapeType: AnnotationShapeType): boolean {
  return POSE_BINDABLE_SHAPES.has(shapeType);
}

/** 解析标签选择界面的编号输入，空则返回 undefined */
export function parseGroupIdInput(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export interface ResolvePlacementGroupIdOptions {
  forKeypoint?: boolean;
  annotations?: Annotation[];
  selectedAnnotationId?: string | null;
}

/** 确定本次标注使用的编号：仅使用输入框中显式填写的编号 */
export function resolvePlacementGroupId(
  pendingGroupIdInput: string,
  _lastUsedGroupId?: number | null,
  _options?: ResolvePlacementGroupIdOptions
): number | undefined {
  return parseGroupIdInput(pendingGroupIdInput);
}

export function formatGroupIdInputValue(groupId: number | null | undefined): string {
  return groupId != null ? String(groupId) : '';
}

/** 解析并规范化 groupId（兼容 JSON/表单中的字符串编号） */
export function normalizeGroupId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export function groupIdsEqual(a: unknown, b: unknown): boolean {
  const left = normalizeGroupId(a);
  const right = normalizeGroupId(b);
  return left !== undefined && right !== undefined && left === right;
}

/** 分配下一个可用的 groupId（从 0 递增） */
export function allocateNextGroupId(annotations: readonly Annotation[]): number {
  let max = -1;
  for (const ann of annotations) {
    if (ann.groupId != null && ann.groupId > max) {
      max = ann.groupId;
    }
  }
  return max + 1;
}

/** 新建标注时确定 groupId：仅使用输入框中显式填写的编号 */
export function resolveNewAnnotationGroupId(
  pendingGroupIdInput: string,
  lastUsedGroupId?: number | null,
  options?: ResolvePlacementGroupIdOptions
): number | undefined {
  return resolvePlacementGroupId(pendingGroupIdInput, lastUsedGroupId, options);
}

/** 确定编号：输入框优先，否则继承上次使用的编号 */
export function resolveAnnotationGroupId(
  pendingGroupIdInput: string,
  lastUsedGroupId: number | null | undefined
): number | undefined {
  const fromInput = parseGroupIdInput(pendingGroupIdInput);
  if (fromInput !== undefined) return fromInput;
  if (lastUsedGroupId != null) return lastUsedGroupId;
  return undefined;
}

/** 对象栏：person (0) */
export function formatObjectPanelLabel(name: string, groupId?: number): string {
  return groupId != null ? `${name} (${groupId})` : name;
}

/** 画布方框标签：id:0 person */
export function formatCanvasLabel(groupId: number, name: string): string {
  return `id:${groupId} ${name}`;
}

/** 画布标签：类别名 + 可选置信度，例如 Person 0.60 */
export function formatAnnotationCanvasLabel(
  name: string,
  options?: { groupId?: number; score?: number }
): string {
  let text = name;
  if (options?.score != null && Number.isFinite(options.score)) {
    text = `${text} ${options.score.toFixed(2)}`;
  }
  if (options?.groupId != null) {
    return formatCanvasLabel(options.groupId, text);
  }
  return text;
}

export function isKeypointPlaced(keypoints: number[], index: number): boolean {
  const offset = index * 3;
  const v = keypoints[offset + 2] ?? 0;
  if (!isPoseKeypointVisible(v)) return false;
  const x = keypoints[offset];
  const y = keypoints[offset + 1];
  return !(x === 0 && y === 0);
}

export interface FindPoseBindTargetOptions {
  selectedAnnotationId?: string | null;
}

/** 按 groupId / 选中项 / 唯一方框查找可绑定的姿态实例 */
export function findPoseBindTarget(
  annotations: Annotation[],
  groupId?: number,
  options?: FindPoseBindTargetOptions
): Annotation | null {
  const bindable = annotations.filter((a) => isPoseBindableShape(a.shapeType));
  if (bindable.length === 0) return null;

  if (groupId !== undefined) {
    const matched = bindable.filter((a) => a.groupId === groupId);
    if (matched.length > 0) {
      const pose = matched.find((a) => a.shapeType === 'pose');
      return pose ?? matched[0];
    }
  }

  if (options?.selectedAnnotationId) {
    const selected = bindable.find((a) => a.id === options.selectedAnnotationId);
    if (selected) return selected;
  }

  if (bindable.length === 1) return bindable[0];

  return null;
}
