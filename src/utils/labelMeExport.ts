import type { Annotation, Label } from '../types';
import { getObbCorners } from './obbGeometry';
import {
  getKeypointNamesForClass,
  resolvePoseClassNameForTarget,
  type PoseConfig,
} from './poseConfig';
import { getBasename } from './filePicker';

export const LABELME_VERSION = '1.0.0';

export interface LabelMeShapeOutput {
  label: string;
  score: null;
  points: [number, number][];
  group_id: number | null;
  description: string | null;
  difficult: boolean;
  shape_type: string;
  flags: Record<string, boolean>;
  attributes: Record<string, unknown>;
}

export interface LabelMeDocument {
  version: string;
  flags: Record<string, boolean>;
  shapes: LabelMeShapeOutput[];
  imagePath: string;
  imageData: null;
  imageHeight: number;
  imageWidth: number;
}

function baseShape(
  label: string,
  shapeType: string,
  points: [number, number][],
  groupId?: number
): LabelMeShapeOutput {
  return {
    label,
    score: null,
    points,
    group_id: groupId ?? null,
    description: null,
    difficult: false,
    shape_type: shapeType,
    flags: {},
    attributes: {},
  };
}

function rectToFourPoints(
  x: number,
  y: number,
  width: number,
  height: number
): [number, number][] {
  const x1 = x + width;
  const y1 = y + height;
  return [
    [x, y],
    [x1, y],
    [x1, y1],
    [x, y1],
  ];
}

function flatPointsToPairs(points: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push([points[i], points[i + 1]]);
  }
  return pairs;
}

function expandPoseToShapes(
  ann: Annotation,
  classLabel: string,
  poseConfig: PoseConfig
): LabelMeShapeOutput[] {
  const className = resolvePoseClassNameForTarget(poseConfig, classLabel);
  const kptNames = getKeypointNamesForClass(poseConfig, className);
  const groupId = ann.groupId;
  const shapes: LabelMeShapeOutput[] = [
    baseShape(
      className,
      'rectangle',
      rectToFourPoints(ann.x, ann.y, ann.width, ann.height),
      groupId
    ),
  ];

  const kpts = ann.keypoints ?? [];
  for (let i = 0; i < kptNames.length; i++) {
    const visibility = kpts[i * 3 + 2] ?? 0;
    if (visibility <= 0) continue;
    const x = kpts[i * 3];
    const y = kpts[i * 3 + 1];
    shapes.push({
      ...baseShape(kptNames[i], 'point', [[x, y]], groupId),
      difficult: visibility === 1,
    });
  }

  return shapes;
}

function annotationToLabelMeShapes(
  ann: Annotation,
  labelName: string,
  poseConfig: PoseConfig
): LabelMeShapeOutput[] {
  if (ann.hidden) return [];

  const groupId = ann.groupId;

  if (ann.shapeType === 'pose') {
    return expandPoseToShapes(ann, labelName, poseConfig);
  }

  if (ann.shapeType === 'point') {
    return [baseShape(labelName, 'point', [[ann.x, ann.y]], groupId)];
  }

  if (ann.shapeType === 'rectangle') {
    return [
      baseShape(
        labelName,
        'rectangle',
        rectToFourPoints(ann.x, ann.y, ann.width, ann.height),
        groupId
      ),
    ];
  }

  if (ann.shapeType === 'polygon' && ann.points && ann.points.length >= 6) {
    return [
      baseShape(labelName, 'polygon', flatPointsToPairs(ann.points), groupId),
    ];
  }

  if (ann.shapeType === 'rotated-rectangle') {
    const corners = getObbCorners(
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.angle ?? 0
    );
    return [
      baseShape(labelName, 'rotation', flatPointsToPairs(corners), groupId),
    ];
  }

  return [];
}

/** 图片名 → 同目录 LabelMe JSON 文件名 */
export function getLabelMeJsonFilename(imageName: string): string {
  return `${getBasename(imageName)}.json`;
}

export function buildLabelMeDocument(
  annotations: Annotation[],
  labels: Label[],
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  poseConfig: PoseConfig
): LabelMeDocument {
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const shapes: LabelMeShapeOutput[] = [];

  for (const ann of annotations) {
    const label = labelById.get(ann.labelId);
    const labelName = label?.name ?? 'unknown';
    shapes.push(...annotationToLabelMeShapes(ann, labelName, poseConfig));
  }

  return {
    version: LABELME_VERSION,
    flags: {},
    shapes,
    imagePath: imageName,
    imageData: null,
    imageHeight,
    imageWidth,
  };
}

export function labelMeDocumentToJson(doc: LabelMeDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function annotationsToLabelMeJson(
  annotations: Annotation[],
  labels: Label[],
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  poseConfig: PoseConfig
): string {
  const doc = buildLabelMeDocument(
    annotations,
    labels,
    imageName,
    imageWidth,
    imageHeight,
    poseConfig
  );
  return labelMeDocumentToJson(doc);
}
