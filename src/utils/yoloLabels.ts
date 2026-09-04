import { getNextLabelColor } from '../constants/labelColors';
import type { Annotation, ImageFile, Label, YoloFormat } from '../types';
import { getPolygonBBox } from '../types';
import { clampPolygonPoints, clampRect } from './annotationBounds';
import { generateId } from './id';
import { getBasename } from './filePicker';
import { ensureImageLoaded } from './imageLoader';
import { getObbCorners, obbFromCorners, obbFromYoloAngle } from './obbGeometry';
import { isPoseBindableShape, groupIdsEqual, normalizeGroupId } from './annotationDisplay';
import { POSE_KEYPOINT_VISIBLE } from '../constants/pose';
import { setPoseKeypoint, hasVisiblePoseKeypoints } from './poseGeometry';
import {
  DEFAULT_POSE_CONFIG,
  createEmptyKeypointsForClass,
  formatYoloExportNumber,
  getClassIndexForName,
  getKeypointNamesForClass,
  getKeypointStride,
  getPoseImportLabelNames,
  keypointsToYoloCoordsForClass,
  resolveKeypointIndexFromLabelName,
  resolvePoseClassNameForTarget,
  resolvePoseClassName,
  type PoseConfig,
  yoloCoordsToKeypointsForClass,
} from './poseConfig';

/** YOLO Seg 最少顶点数 */
const YOLO_SEG_MIN_VERTICES = 3;

/** YOLO Pose：bbox(4) + 至少 1 个关键点组 */
const YOLO_POSE_BBOX_FIELDS = 4;
const YOLO_POSE_KPT_STRIDE = 3;

/** 解析标签 txt，每行一个类别名 */
export function parseLabelsTxt(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function labelsFromNames(names: string[]): Label[] {
  return names.map((name, index) => ({
    id: generateId(),
    name,
    color: getNextLabelColor(index),
  }));
}

/** Pose 导入：补齐 yaml 中的类别名与关键点名标签（兼容仅上传 classes.txt 的场景） */
export function ensurePoseImportLabels(
  labels: Label[],
  poseConfig: PoseConfig
): Label[] {
  const byName = new Map(labels.map((label) => [label.name, label]));
  const merged = [...labels];
  let colorIndex = labels.length;

  for (const name of getPoseImportLabelNames(poseConfig)) {
    if (byName.has(name)) continue;
    const label: Label = {
      id: generateId(),
      name,
      color: getNextLabelColor(colorIndex++),
    };
    byName.set(name, label);
    merged.push(label);
  }

  return merged;
}

function getLabelByClassIndex(labels: Label[], classIndex: number): Label | undefined {
  return labels[classIndex];
}

function normalizedCoordsToPolygonPoints(
  coords: number[],
  imageWidth: number,
  imageHeight: number,
  clamp = false
): number[] | null {
  if (coords.length < YOLO_SEG_MIN_VERTICES * 2 || coords.length % 2 !== 0) {
    return null;
  }

  const points: number[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    points.push(coords[i] * imageWidth, coords[i + 1] * imageHeight);
  }

  if (clamp && imageWidth > 0 && imageHeight > 0) {
    return clampPolygonPoints(points, imageWidth, imageHeight);
  }
  return points;
}

function polygonPointsToAnnotation(labelId: string, points: number[]): Annotation {
  const bbox = getPolygonBBox(points);
  return {
    id: generateId(),
    labelId,
    shapeType: 'polygon',
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    points,
  };
}

function polygonToYoloLine(
  classIndex: number,
  points: number[],
  imageWidth: number,
  imageHeight: number,
  clamp = false
): string | null {
  if (points.length < YOLO_SEG_MIN_VERTICES * 2) return null;

  const exportPoints =
    clamp && imageWidth > 0 && imageHeight > 0
      ? clampPolygonPoints(points, imageWidth, imageHeight)
      : points;

  const nums: string[] = [];
  for (let i = 0; i < exportPoints.length; i += 2) {
    nums.push((exportPoints[i] / imageWidth).toFixed(6));
    nums.push((exportPoints[i + 1] / imageHeight).toFixed(6));
  }
  return [classIndex, ...nums].join(' ');
}

function normalizedHbbToRect(
  xc: number,
  yc: number,
  w: number,
  h: number,
  imageWidth: number,
  imageHeight: number,
  clamp = false
): { x: number; y: number; width: number; height: number } {
  let width = w * imageWidth;
  let height = h * imageHeight;
  let x = xc * imageWidth - width / 2;
  let y = yc * imageHeight - height / 2;

  if (clamp && imageWidth > 0 && imageHeight > 0) {
    const rect = clampRect(x, y, width, height, imageWidth, imageHeight);
    x = rect.x;
    y = rect.y;
    width = rect.width;
    height = rect.height;
  }

  return { x, y, width, height };
}

function poseToYoloLine(
  classIndex: number,
  className: string,
  x: number,
  y: number,
  width: number,
  height: number,
  keypoints: number[],
  imageWidth: number,
  imageHeight: number,
  poseConfig: PoseConfig,
  clamp = false
): string | null {
  if (keypoints.length < YOLO_POSE_KPT_STRIDE) return null;

  const rect =
    clamp && imageWidth > 0 && imageHeight > 0
      ? clampRect(x, y, width, height, imageWidth, imageHeight)
      : { x, y, width, height };

  const xc = (rect.x + rect.width / 2) / imageWidth;
  const yc = (rect.y + rect.height / 2) / imageHeight;
  const w = rect.width / imageWidth;
  const h = rect.height / imageHeight;
  const bbox = [xc, yc, w, h].map((n) => formatYoloExportNumber(n));
  const kptNums = keypointsToYoloCoordsForClass(
    keypoints,
    poseConfig,
    className,
    imageWidth,
    imageHeight,
    clamp
  );
  return [String(classIndex), ...bbox, ...kptNums].join(' ');
}

function normalizeGroupIdValue(value: unknown): number | undefined {
  return normalizeGroupId(value);
}

function groupIdsEqualValue(a: unknown, b: unknown): boolean {
  return groupIdsEqual(a, b);
}

interface PoseKeypointValue {
  x: number;
  y: number;
  v: number;
}

function getPoseKeypointFromMap(
  keypoints: Map<string, PoseKeypointValue>,
  name: string
): PoseKeypointValue | undefined {
  const direct = keypoints.get(name);
  if (direct) return direct;
  const normalized = name.trim().toLowerCase();
  for (const [key, value] of keypoints) {
    if (key.trim().toLowerCase() === normalized) return value;
  }
  return undefined;
}

function buildKeypointsFromPoseGroup(
  pointMap: Map<string, PoseKeypointValue>,
  className: string,
  poseConfig: PoseConfig,
  embeddedKeypoints?: number[]
): number[] {
  if (embeddedKeypoints?.length && hasVisiblePoseKeypoints(embeddedKeypoints)) {
    return embeddedKeypoints;
  }

  let keypoints = createEmptyKeypointsForClass(poseConfig, className);
  const kptNames = getKeypointNamesForClass(poseConfig, className);
  for (let i = 0; i < kptNames.length; i++) {
    const pt = getPoseKeypointFromMap(pointMap, kptNames[i]);
    if (!pt) continue;
    keypoints = setPoseKeypoint(keypoints, i, pt.x, pt.y, pt.v);
  }
  return keypoints;
}

function buildKeypointsFromPointAnnotations(
  pointAnnotations: Annotation[],
  labels: Label[],
  className: string,
  poseConfig: PoseConfig
): number[] {
  const labelNames = labelNameById(labels);
  const pointMap = new Map<string, PoseKeypointValue>();
  for (const pt of pointAnnotations) {
    if (pt.hidden) continue;
    const labelName = labelNames.get(pt.labelId);
    if (!labelName) continue;
    pointMap.set(labelName, {
      x: pt.x,
      y: pt.y,
      v: POSE_KEYPOINT_VISIBLE,
    });
  }
  return buildKeypointsFromPoseGroup(pointMap, className, poseConfig);
}

interface PoseExportInstance {
  bbox: Annotation;
  keypoints?: number[];
  points: Annotation[];
  className: string;
}

function labelNameById(labels: Label[]): Map<string, string> {
  return new Map(labels.map((label) => [label.id, label.name]));
}

function isPoseClassName(poseConfig: PoseConfig, className: string): boolean {
  return getClassIndexForName(poseConfig, className) >= 0;
}

function isKeypointLabelForClass(
  poseConfig: PoseConfig,
  className: string,
  labelName: string
): boolean {
  return resolveKeypointIndexFromLabelName(poseConfig, className, labelName) >= 0;
}

function collectPointsForPoseBbox(
  bbox: Annotation,
  annotations: Annotation[],
  labels: Label[],
  poseConfig: PoseConfig,
  className: string,
  consumedIds: Set<string>
): Annotation[] {
  const labelNames = labelNameById(labels);
  const matched: Annotation[] = [];

  for (const pt of annotations) {
    if (pt.hidden || consumedIds.has(pt.id) || pt.shapeType !== 'point') continue;

    const sharesGroup = groupIdsEqualValue(bbox.groupId, pt.groupId);
    const inside = pointInsideRect(pt, bbox);

    if (sharesGroup) {
      matched.push(pt);
      continue;
    }

    if (!inside) continue;

    const ptLabel = labelNames.get(pt.labelId);
    if (!ptLabel || !isKeypointLabelForClass(poseConfig, className, ptLabel)) {
      continue;
    }

    matched.push(pt);
  }

  return matched;
}

function pointInsideRect(point: Annotation, bbox: Annotation): boolean {
  return (
    point.x >= bbox.x &&
    point.x <= bbox.x + bbox.width &&
    point.y >= bbox.y &&
    point.y <= bbox.y + bbox.height
  );
}

/** 收集可导出的 Pose 实例：按 group_id 分组 */
function collectYoloPoseInstances(
  annotations: Annotation[],
  labels: Label[],
  poseConfig: PoseConfig
): PoseExportInstance[] {
  const labelNames = labelNameById(labels);
  const instances: PoseExportInstance[] = [];

  type PoseGroupData = {
    bbox?: Annotation;
    boxLabel?: string;
    embeddedKeypoints?: number[];
    keypoints: Map<string, PoseKeypointValue>;
  };

  const groups = new Map<number, PoseGroupData>();
  const getPoseGroup = (groupId: number): PoseGroupData => {
    const existing = groups.get(groupId);
    if (existing) return existing;
    const entry: PoseGroupData = { keypoints: new Map() };
    groups.set(groupId, entry);
    return entry;
  };

  const ungroupedBboxes: Annotation[] = [];
  const ungroupedPoints: Annotation[] = [];

  const resolveClassName = (labelId: string): string | null => {
    const name = labelNames.get(labelId);
    if (!name) return null;
    const className = resolvePoseClassNameForTarget(poseConfig, name);
    return isPoseClassName(poseConfig, className) ? className : null;
  };

  for (const ann of annotations) {
    if (ann.hidden) continue;
    const groupId = normalizeGroupIdValue(ann.groupId);

    if (
      ann.shapeType === 'pose' &&
      ann.keypoints?.length &&
      hasVisiblePoseKeypoints(ann.keypoints)
    ) {
      const className = resolveClassName(ann.labelId);
      if (!className) continue;
      if (groupId !== undefined) {
        const entry = getPoseGroup(groupId);
        entry.bbox = ann;
        entry.boxLabel = labelNames.get(ann.labelId);
        entry.embeddedKeypoints = ann.keypoints;
      } else {
        instances.push({
          bbox: ann,
          keypoints: ann.keypoints,
          points: [],
          className,
        });
      }
      continue;
    }

    if (ann.shapeType === 'point') {
      const ptLabel = labelNames.get(ann.labelId);
      if (!ptLabel) continue;
      if (groupId !== undefined) {
        const entry = getPoseGroup(groupId);
        entry.keypoints.set(ptLabel, {
          x: ann.x,
          y: ann.y,
          v: POSE_KEYPOINT_VISIBLE,
        });
      } else {
        ungroupedPoints.push(ann);
      }
      continue;
    }

    if (!isPoseBindableShape(ann.shapeType)) continue;

    if (groupId !== undefined) {
      const entry = getPoseGroup(groupId);
      entry.bbox = ann;
      entry.boxLabel = labelNames.get(ann.labelId);
    } else {
      ungroupedBboxes.push(ann);
    }
  }

  for (const [, group] of groups) {
    if (!group.bbox || !group.boxLabel) continue;
    const className = resolvePoseClassNameForTarget(poseConfig, group.boxLabel);
    if (!isPoseClassName(poseConfig, className)) continue;

    const keypoints = buildKeypointsFromPoseGroup(
      group.keypoints,
      className,
      poseConfig,
      group.embeddedKeypoints
    );
    if (!hasVisiblePoseKeypoints(keypoints)) continue;

    instances.push({
      bbox: group.bbox,
      keypoints,
      points: [],
      className,
    });
  }

  const consumedPointIds = new Set<string>();
  for (const bbox of ungroupedBboxes) {
    const className = resolveClassName(bbox.labelId);
    if (!className) continue;

    const matchedPoints = collectPointsForPoseBbox(
      bbox,
      ungroupedPoints,
      labels,
      poseConfig,
      className,
      consumedPointIds
    );
    if (matchedPoints.length === 0) continue;

    instances.push({
      bbox,
      points: matchedPoints,
      className,
    });
    for (const pt of matchedPoints) consumedPointIds.add(pt.id);
  }

  return instances;
}

function annotationsToYoloPoseTxt(
  annotations: Annotation[],
  labels: Label[],
  imageWidth: number,
  imageHeight: number,
  poseConfig: PoseConfig
): string {
  const exportLabels = ensurePoseImportLabels(labels, poseConfig);
  const lines: string[] = [];

  for (const instance of collectYoloPoseInstances(
    annotations,
    exportLabels,
    poseConfig
  )) {
    const poseClassIndex = getClassIndexForName(poseConfig, instance.className);
    if (poseClassIndex < 0) continue;

    const embeddedKeypoints =
      instance.keypoints && hasVisiblePoseKeypoints(instance.keypoints)
        ? instance.keypoints
        : undefined;
    const keypoints =
      embeddedKeypoints ??
      buildKeypointsFromPointAnnotations(
        instance.points,
        exportLabels,
        instance.className,
        poseConfig
      );

    if (!hasVisiblePoseKeypoints(keypoints)) continue;

    const line = poseToYoloLine(
      poseClassIndex,
      instance.className,
      instance.bbox.x,
      instance.bbox.y,
      instance.bbox.width,
      instance.bbox.height,
      keypoints,
      imageWidth,
      imageHeight,
      poseConfig,
      true
    );
    if (line) lines.push(line);
  }

  return lines.join('\n');
}

/** 解析 YOLO 标注行 */
export function parseYoloTxt(
  content: string,
  labels: Label[],
  imageWidth: number,
  imageHeight: number,
  format: YoloFormat = 'hbb',
  poseConfig: PoseConfig = DEFAULT_POSE_CONFIG
): Annotation[] {
  const annotations: Annotation[] = [];
  const lines = content.split(/\r?\n/);
  let nextGroupId = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length < 5 || parts.some((n) => Number.isNaN(n))) continue;

    const classIndex = Math.trunc(parts[0]);

    if (format === 'pose') {
      const className = resolvePoseClassName(poseConfig, classIndex);
      if (!className) continue;
      const classLabel = labels.find((l) => l.name === className);
      if (!classLabel) continue;

      const stride = getKeypointStride(poseConfig);
      const minFields = 1 + YOLO_POSE_BBOX_FIELDS + stride;
      if (parts.length < minFields) continue;
      let kptCoords = parts.slice(1 + YOLO_POSE_BBOX_FIELDS);
      if (kptCoords.length % stride !== 0) {
        const padded = [...kptCoords];
        while (padded.length % stride !== 0) padded.push(0);
        kptCoords = padded;
      }

      const [, xc, yc, w, h] = parts;
      const rect = normalizedHbbToRect(xc, yc, w, h, imageWidth, imageHeight, true);
      const keypoints = yoloCoordsToKeypointsForClass(
        kptCoords,
        poseConfig,
        className,
        imageWidth,
        imageHeight,
        true
      );
      const groupId = nextGroupId++;

      annotations.push({
        id: generateId(),
        labelId: classLabel.id,
        shapeType: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        groupId,
      });

      const kptNames = getKeypointNamesForClass(poseConfig, className);
      for (let i = 0; i < kptNames.length; i++) {
        const x = keypoints[i * 3];
        const y = keypoints[i * 3 + 1];
        const v = Math.trunc(keypoints[i * 3 + 2] ?? 0);
        if (v <= 0) continue;
        if (x === 0 && y === 0) continue;

        const kptLabel = labels.find((l) => l.name === kptNames[i]);
        if (!kptLabel) continue;

        annotations.push({
          id: generateId(),
          labelId: kptLabel.id,
          shapeType: 'point',
          x,
          y,
          width: 0,
          height: 0,
          groupId,
        });
      }
      continue;
    }

    const label = getLabelByClassIndex(labels, classIndex);
    if (!label) continue;

    if (format === 'obb') {
      if (parts.length === 9) {
        const coords = parts.slice(1);
        const points: number[] = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push(coords[i] * imageWidth, coords[i + 1] * imageHeight);
        }
        const obb = obbFromCorners(points);
        annotations.push({
          id: generateId(),
          labelId: label.id,
          shapeType: 'rotated-rectangle',
          x: obb.x,
          y: obb.y,
          width: obb.width,
          height: obb.height,
          angle: obb.angle,
          points: getObbCorners(obb.x, obb.y, obb.width, obb.height, obb.angle),
        });
        continue;
      }
      if (parts.length === 6) {
        const [, xc, yc, w, h, angle] = parts;
        const obb = obbFromYoloAngle(xc, yc, w, h, angle, imageWidth, imageHeight);
        annotations.push({
          id: generateId(),
          labelId: label.id,
          shapeType: 'rotated-rectangle',
          x: obb.x,
          y: obb.y,
          width: obb.width,
          height: obb.height,
          angle: obb.angle,
          points: getObbCorners(obb.x, obb.y, obb.width, obb.height, obb.angle),
        });
        continue;
      }
      continue;
    }

    if (format === 'seg') {
      const points = normalizedCoordsToPolygonPoints(
        parts.slice(1),
        imageWidth,
        imageHeight,
        true
      );
      if (!points) continue;
      annotations.push(polygonPointsToAnnotation(label.id, points));
      continue;
    }

    if (parts.length === 5) {
      const [, xc, yc, w, h] = parts;
      const rect = normalizedHbbToRect(xc, yc, w, h, imageWidth, imageHeight, false);
      annotations.push({
        id: generateId(),
        labelId: label.id,
        shapeType: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
      continue;
    }

    const points = normalizedCoordsToPolygonPoints(
      parts.slice(1),
      imageWidth,
      imageHeight,
      false
    );
    if (!points) continue;
    annotations.push(polygonPointsToAnnotation(label.id, points));
  }

  return annotations;
}

export async function importYoloFromTxtFilesAsync(
  txtFiles: File[],
  labels: Label[],
  images: ImageFile[],
  format: YoloFormat = 'hbb',
  poseConfig: PoseConfig = DEFAULT_POSE_CONFIG
): Promise<{
  annotationsByImage: Record<string, Annotation[]>;
  imagePatches: Record<string, Pick<ImageFile, 'url' | 'width' | 'height' | 'loaded'>>;
}> {
  const imageByBase = new Map<string, ImageFile>();
  for (const img of images) {
    imageByBase.set(getBasename(img.name).toLowerCase(), img);
  }

  const annotationsByImage: Record<string, Annotation[]> = {};
  const imagePatches: Record<string, Pick<ImageFile, 'url' | 'width' | 'height' | 'loaded'>> = {};

  let cursor = 0;
  const concurrency = 8;

  async function processTxtFile(file: File) {
    const base = getBasename(file.name).toLowerCase();
    const image = imageByBase.get(base);
    if (!image) return;

    const loaded = await ensureImageLoaded(image);
    imagePatches[loaded.id] = {
      url: loaded.url,
      width: loaded.width,
      height: loaded.height,
      loaded: true,
    };

    const content = await file.text();
    annotationsByImage[loaded.id] = parseYoloTxt(
      content,
      labels,
      loaded.width,
      loaded.height,
      format,
      poseConfig
    );
  }

  async function worker() {
    while (cursor < txtFiles.length) {
      const index = cursor++;
      await processTxtFile(txtFiles[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, txtFiles.length) }, () => worker())
  );

  return { annotationsByImage, imagePatches };
}

function getClassIndex(labels: Label[], labelId: string): number {
  return labels.findIndex((l) => l.id === labelId);
}

export function annotationToYoloLine(
  ann: Annotation,
  labels: Label[],
  imageWidth: number,
  imageHeight: number,
  format: YoloFormat = 'hbb',
  poseConfig: PoseConfig = DEFAULT_POSE_CONFIG
): string | null {
  const classIndex = getClassIndex(labels, ann.labelId);
  if (classIndex < 0) return null;
  const label = labels[classIndex];

  if (format === 'obb') {
    if (ann.shapeType !== 'rotated-rectangle') return null;
    const points =
      ann.points ??
      getObbCorners(ann.x, ann.y, ann.width, ann.height, ann.angle ?? 0);
    const nums: string[] = [];
    for (let i = 0; i < points.length; i += 2) {
      nums.push((points[i] / imageWidth).toFixed(6));
      nums.push((points[i + 1] / imageHeight).toFixed(6));
    }
    return [classIndex, ...nums].join(' ');
  }

  if (format === 'seg') {
    if (ann.shapeType !== 'polygon' || !ann.points) return null;
    return polygonToYoloLine(classIndex, ann.points, imageWidth, imageHeight, true);
  }

  if (format === 'pose') {
    if (ann.shapeType !== 'pose' || !ann.keypoints?.length) return null;
    const className = label.name;
    const poseClassIndex = getClassIndexForName(poseConfig, className);
    if (poseClassIndex < 0) return null;
    return poseToYoloLine(
      poseClassIndex,
      className,
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.keypoints,
      imageWidth,
      imageHeight,
      poseConfig,
      true
    );
  }

  if (ann.shapeType === 'polygon' && ann.points && ann.points.length >= 6) {
    return polygonToYoloLine(classIndex, ann.points, imageWidth, imageHeight, false);
  }

  if (ann.shapeType !== 'rectangle') return null;

  const xc = (ann.x + ann.width / 2) / imageWidth;
  const yc = (ann.y + ann.height / 2) / imageHeight;
  const w = ann.width / imageWidth;
  const h = ann.height / imageHeight;
  return [classIndex, xc.toFixed(6), yc.toFixed(6), w.toFixed(6), h.toFixed(6)].join(' ');
}

export function annotationsToYoloTxt(
  annotations: Annotation[],
  labels: Label[],
  imageWidth: number,
  imageHeight: number,
  format: YoloFormat = 'hbb',
  poseConfig: PoseConfig = DEFAULT_POSE_CONFIG
): string {
  if (format === 'pose') {
    return annotationsToYoloPoseTxt(
      annotations,
      labels,
      imageWidth,
      imageHeight,
      poseConfig
    );
  }

  return annotations
    .map((ann) =>
      annotationToYoloLine(ann, labels, imageWidth, imageHeight, format, poseConfig)
    )
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function labelsToTxt(labels: Label[]): string {
  return labels.map((l) => l.name).join('\n');
}
