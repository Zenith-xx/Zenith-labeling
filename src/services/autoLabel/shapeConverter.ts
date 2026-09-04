import type { Annotation, AnnotationShapeType } from '../../types';
import { generateId } from '../../utils/id';
import { obbFromCorners } from '../../utils/obbGeometry';
import { getPolygonBBox } from '../../types';
import type { RemoteShape } from './types';

export interface ConvertedAnnotation {
  annotation: Annotation;
  labelName: string;
}

function flatPoints(points: [number, number][]): number[] {
  const flat: number[] = [];
  for (const [x, y] of points) flat.push(x, y);
  return flat;
}

function rectFromTwoPoints(points: [number, number][]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function mapShapeType(remoteType: string): AnnotationShapeType | null {
  switch (remoteType) {
    case 'rectangle':
      return 'rectangle';
    case 'polygon':
    case 'linestrip':
      return 'polygon';
    case 'rotation':
    case 'rotated_box':
      return 'rotated-rectangle';
    case 'point':
      return 'point';
    case 'pose':
      return 'pose';
    default:
      return null;
  }
}

function resolveScore(score: number | null | undefined): number | undefined {
  return score != null && Number.isFinite(score) ? score : undefined;
}

/** 将远程推理形状转为本地 Annotation（不含 labelId） */
export function remoteShapeToAnnotation(shape: RemoteShape): ConvertedAnnotation | null {
  if (!shape.points?.length) return null;
  if (!shape.label?.trim()) return null;

  const shapeType = mapShapeType(shape.shape_type);
  if (!shapeType) return null;

  const id = generateId();
  const groupId =
    shape.group_id != null && Number.isFinite(shape.group_id)
      ? shape.group_id
      : undefined;
  const score = resolveScore(shape.score);

  if (shapeType === 'rectangle') {
    const rect = rectFromTwoPoints(shape.points);
    return {
      annotation: {
        id,
        labelId: '',
        shapeType,
        ...rect,
        groupId,
        score,
      },
      labelName: shape.label.trim(),
    };
  }

  if (shapeType === 'point') {
    const [x, y] = shape.points[0];
    return {
      annotation: {
        id,
        labelId: '',
        shapeType,
        x,
        y,
        width: 0,
        height: 0,
        groupId,
        score,
      },
      labelName: shape.label.trim(),
    };
  }

  if (shapeType === 'polygon') {
    const points = flatPoints(shape.points);
    if (points.length < 6) return null;
    const bbox = getPolygonBBox(points);
    return {
      annotation: {
        id,
        labelId: '',
        shapeType,
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        points,
        groupId,
        score,
      },
      labelName: shape.label.trim(),
    };
  }

  if (shapeType === 'rotated-rectangle') {
    const cornerPoints = flatPoints(shape.points);
    if (cornerPoints.length < 8) return null;
    const obb = obbFromCorners(cornerPoints);
    return {
      annotation: {
        id,
        labelId: '',
        shapeType,
        x: obb.x,
        y: obb.y,
        width: obb.width,
        height: obb.height,
        angle: obb.angle,
        points: cornerPoints,
        groupId,
        score,
      },
      labelName: shape.label.trim(),
    };
  }

  if (shapeType === 'pose') {
    const keypoints = shape.attributes?.keypoints;
    if (!Array.isArray(keypoints) || keypoints.length < 3) return null;
    const nums = keypoints.map((v) => Number(v));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + 2 < nums.length; i += 3) {
      if (nums[i + 2] > 0) {
        xs.push(nums[i]);
        ys.push(nums[i + 1]);
      }
    }
    if (xs.length === 0) return null;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      annotation: {
        id,
        labelId: '',
        shapeType,
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1),
        keypoints: nums,
        groupId,
        score,
      },
      labelName: shape.label.trim(),
    };
  }

  return null;
}

export function remoteShapesToAnnotations(shapes: RemoteShape[]): ConvertedAnnotation[] {
  const result: ConvertedAnnotation[] = [];
  for (const shape of shapes) {
    const converted = remoteShapeToAnnotation(shape);
    if (converted) result.push(converted);
  }
  return result;
}
