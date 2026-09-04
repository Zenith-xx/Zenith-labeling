import type { Annotation, AnnotationShapeType } from '../types';
import { getPolygonBBox } from '../types';
import { generateId } from '../utils/id';
import { getObbCorners, obbFromCorners } from '../utils/obbGeometry';

export interface RawAnnotationInput {
  id?: string;
  labelId?: string;
  labelName?: string;
  labelColor?: string;
  shapeType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: number[];
  angle?: number;
  keypoints?: number[];
  hidden?: boolean;
}

export interface LabelMeShapeInput {
  label?: string;
  points?: [number, number][];
  shape_type?: string;
  group_id?: number | null;
  difficult?: boolean;
}

function normalizeShapeType(shapeType?: string): AnnotationShapeType {
  switch (shapeType) {
    case 'rotated-rectangle':
    case 'rotation':
    case 'obb':
      return 'rotated-rectangle';
    case 'polygon':
      return 'polygon';
    case 'point':
      return 'point';
    case 'pose':
      return 'pose';
    default:
      return 'rectangle';
  }
}

function buildObbAnnotation(
  labelId: string,
  raw: Pick<
    RawAnnotationInput,
    'id' | 'x' | 'y' | 'width' | 'height' | 'angle' | 'points' | 'hidden'
  >
): Annotation {
  if (raw.points && raw.points.length >= 8) {
    const obb = obbFromCorners(raw.points);
    return {
      id: raw.id ?? generateId(),
      labelId,
      shapeType: 'rotated-rectangle',
      x: obb.x,
      y: obb.y,
      width: obb.width,
      height: obb.height,
      angle: obb.angle,
      points: getObbCorners(obb.x, obb.y, obb.width, obb.height, obb.angle),
      hidden: raw.hidden,
    };
  }

  const x = raw.x ?? 0;
  const y = raw.y ?? 0;
  const width = raw.width ?? 0;
  const height = raw.height ?? 0;
  const angle = raw.angle ?? 0;

  return {
    id: raw.id ?? generateId(),
    labelId,
    shapeType: 'rotated-rectangle',
    x,
    y,
    width,
    height,
    angle,
    points: getObbCorners(x, y, width, height, angle),
    hidden: raw.hidden,
  };
}

/** Labeling-vue3 / 自定义 annotations[] 单条解析 */
export function parseRawAnnotation(raw: RawAnnotationInput, labelId: string): Annotation {
  const shapeType = normalizeShapeType(raw.shapeType);

  if (shapeType === 'rotated-rectangle') {
    return buildObbAnnotation(labelId, raw);
  }

  return {
    id: raw.id ?? generateId(),
    labelId,
    shapeType,
    x: raw.x ?? 0,
    y: raw.y ?? 0,
    width: raw.width ?? 0,
    height: raw.height ?? 0,
    points: raw.points,
    keypoints: raw.keypoints,
    hidden: raw.hidden,
  };
}

function labelMeGroupId(shape: LabelMeShapeInput): number | undefined {
  const groupId = shape.group_id;
  if (groupId === null || groupId === undefined) return undefined;
  return groupId;
}

function withGroupId(ann: Annotation, shape: LabelMeShapeInput): Annotation {
  const groupId = labelMeGroupId(shape);
  return groupId !== undefined ? { ...ann, groupId } : ann;
}

/** LabelMe shapes[] 单条解析 */
export function parseLabelMeShape(
  shape: LabelMeShapeInput,
  labelId: string
): Annotation | null {
  const points = shape.points;
  if (!points || points.length === 0) return null;

  const shapeType = normalizeShapeType(shape.shape_type);

  if (shapeType === 'rotated-rectangle') {
    if (points.length < 4) return null;
    return buildObbAnnotation(labelId, {
      points: points.flat(),
    });
  }

  if (shapeType === 'rectangle') {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return withGroupId(
      {
        id: generateId(),
        labelId,
        shapeType: 'rectangle',
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      shape
    );
  }

  if (shapeType === 'polygon') {
    const flat = points.flat();
    const bbox = getPolygonBBox(flat);
    return withGroupId(
      {
        id: generateId(),
        labelId,
        shapeType: 'polygon',
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        points: flat,
      },
      shape
    );
  }

  if (shapeType === 'point') {
    const [x, y] = points[0];
    return withGroupId(
      {
        id: generateId(),
        labelId,
        shapeType: 'point',
        x,
        y,
        width: 0,
        height: 0,
      },
      shape
    );
  }

  return null;
}

export function isValidImportedAnnotation(ann: Annotation): boolean {
  return (
    ann.width > 0 ||
    ann.height > 0 ||
    ann.shapeType === 'point' ||
    ann.shapeType === 'pose'
  );
}
