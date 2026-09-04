import type { Annotation, Label } from '../types';

const BASE = 64;
const NUM = 8;
const CHAR = 2;

/** 估算字符串占用（UTF-16） */
function strBytes(s: string): number {
  return s.length * CHAR;
}

/** 估算单条 Annotation 在 Command 中的内存占用 */
export function estimateAnnotationSize(ann: Annotation): number {
  let size =
    BASE +
    6 * NUM +
    strBytes(ann.id) +
    strBytes(ann.labelId) +
    strBytes(ann.shapeType);
  if (ann.points) size += ann.points.length * NUM;
  if (ann.hidden) size += 1;
  return size;
}

/** 估算 Label 在 Command 中的内存占用 */
export function estimateLabelSize(label: Label): number {
  return (
    BASE +
    strBytes(label.id) +
    strBytes(label.name) +
    strBytes(label.color) +
    (label.description ? strBytes(label.description) : 0)
  );
}

/** 固定几何差分 Command 的估算大小 */
export const FIXED_GEOMETRY_COMMAND_SIZE = 128;

/** 隐藏/显示等轻量 Command */
export const FIXED_LIGHT_COMMAND_SIZE = 96;
