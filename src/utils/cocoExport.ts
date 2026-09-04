import type { Annotation, ImageFile, Label } from '../types';
import { POSE_KEYPOINT_VISIBLE } from '../constants/pose';
import { isPoseBindableShape } from './annotationDisplay';
import { getObbAxisAlignedBBox } from './obbGeometry';
import { parseLabelsTxt } from './yoloLabels';
import {
  getClassIndexForName,
  getKeypointNamesForClass,
  getPoseClassNames,
  resolveKeypointIndexFromLabelName,
  resolvePoseClassNameForTarget,
  type PoseConfig,
} from './poseConfig';
import type { CocoFormat } from '../types';

export interface CocoCategory {
  id: number;
  name: string;
  supercategory: string | null;
  keypoints?: string[];
  skeleton?: number[][];
}

export interface CocoImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  license: number;
  url: null;
  date_captured: null;
}

export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: number[];
  area: number;
  iscrowd: number;
  ignore: number;
  segmentation?: number[][];
  keypoints?: number[];
  num_keypoints?: number;
}

export interface CocoDocument {
  info: {
    year: number;
    version: string;
    description: string;
    contributor: string;
    url: string;
    date_created: string;
  };
  licenses: { id: number; url: string; name: string }[];
  categories: CocoCategory[];
  images: CocoImage[];
  annotations: CocoAnnotation[];
  type?: 'instances';
}

export interface CocoExportInput {
  format: CocoFormat;
  images: ImageFile[];
  annotationsByImage: Record<string, Annotation[]>;
  labels: Label[];
  /** 检测 / 分割：来自 classes.txt 或 labels.txt */
  classNames?: string[];
  /** 关键点：来自 yolov8_pose.yaml */
  poseConfig?: PoseConfig;
}

const APP_VERSION = '1.0.0';

function createCocoBase(format: CocoFormat): CocoDocument {
  const doc: CocoDocument = {
    info: {
      year: new Date().getFullYear(),
      version: APP_VERSION,
      description: 'COCO Label Conversion',
      contributor: 'Labeling-vue3',
      url: '',
      date_created: new Date().toISOString().slice(0, 10),
    },
    licenses: [
      {
        id: 1,
        url: 'https://www.gnu.org/licenses/gpl-3.0.html',
        name: 'GNU GENERAL PUBLIC LICENSE Version 3',
      },
    ],
    categories: [],
    images: [],
    annotations: [],
  };
  if (format === 'segmentation') {
    doc.type = 'instances';
  }
  return doc;
}

/** 解析 COCO 分割 labels.txt（首行 _background_，与常见 COCO 分割导出一致） */
export function parseSegmentationClassNames(content: string): string[] {
  let names = parseLabelsTxt(content);
  if (names.length === 0) {
    throw new Error('分割标签文件为空');
  }
  if (names[0] === '__ignore__') {
    names = names.slice(1);
  }
  if (names[0] !== '_background_') {
    names = ['_background_', ...names];
  }
  return names;
}

/** 解析 COCO 检测 classes.txt */
export function parseDetectionClassNames(content: string): string[] {
  const names = parseLabelsTxt(content);
  if (names.length === 0) {
    throw new Error('检测标签文件为空');
  }
  return names;
}

function buildDetectionCategoriesFromNames(classNames: string[]): {
  categories: CocoCategory[];
  nameToCategoryId: Map<string, number>;
} {
  const nameToCategoryId = new Map<string, number>();
  const categories = classNames.map((name, index) => {
    const id = index + 1;
    nameToCategoryId.set(name, id);
    return { id, name, supercategory: '' };
  });
  return { categories, nameToCategoryId };
}

function buildSegmentationCategoriesFromNames(classNames: string[]): {
  categories: CocoCategory[];
  labelToCategoryId: Map<string, number>;
} {
  const labelToCategoryId = new Map<string, number>();
  const categories = classNames.map((name, index) => {
    if (name !== '_background_' && name !== '__ignore__') {
      labelToCategoryId.set(name, index);
    }
    return { id: index, name, supercategory: null };
  });
  return { categories, labelToCategoryId };
}

function resolveLabelName(labels: Label[], labelId: string): string | undefined {
  return labels.find((l) => l.id === labelId)?.name;
}

function resolvePoseCategoryId(
  poseConfig: PoseConfig,
  classNameToCategoryId: Map<string, number>,
  className: string
): number | undefined {
  const fromMap = classNameToCategoryId.get(className);
  if (fromMap != null) return fromMap;
  const classIndex = getClassIndexForName(poseConfig, className);
  return classIndex >= 0 ? classIndex + 1 : undefined;
}

function rectBbox(x: number, y: number, width: number, height: number): number[] {
  return [x, y, width, height];
}

function rectArea(width: number, height: number): number {
  return Math.max(0, width) * Math.max(0, height);
}

function polygonFlatToSegmentation(points: number[]): number[] {
  return [...points];
}

function shoelaceArea(flat: number[]): number {
  let area = 0;
  const n = flat.length / 2;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return Math.abs(area) / 2;
}

function minEnclosingBbox(segmentations: number[][]): number[] {
  const points: { x: number; y: number }[] = [];
  for (const seg of segmentations) {
    for (let i = 0; i + 1 < seg.length; i += 2) {
      points.push({ x: seg[i], y: seg[i + 1] });
    }
  }
  if (points.length === 0) return [];

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const p of points) {
    xMin = Math.min(xMin, p.x);
    yMin = Math.min(yMin, p.y);
    xMax = Math.max(xMax, p.x);
    yMax = Math.max(yMax, p.y);
  }

  const xMinInt = Math.floor(xMin);
  const yMinInt = Math.floor(yMin);
  const xMaxInt = Math.floor(xMax);
  const yMaxInt = Math.floor(yMax);
  return [
    xMinInt,
    yMinInt,
    xMaxInt - xMinInt + 1,
    yMaxInt - yMinInt + 1,
  ];
}

function buildKeypointCategories(poseConfig: PoseConfig): {
  categories: CocoCategory[];
  classNameToCategoryId: Map<string, number>;
} {
  const classNameToCategoryId = new Map<string, number>();
  const categories: CocoCategory[] = [];
  const classNames = getPoseClassNames(poseConfig);
  classNames.forEach((name, index) => {
    const id = index + 1;
    classNameToCategoryId.set(name, id);
    categories.push({
      id,
      name,
      supercategory: '',
      keypoints: [...getKeypointNamesForClass(poseConfig, name)],
      skeleton: [],
    });
  });
  return { categories, classNameToCategoryId };
}

function appendDetectionAnnotations(
  doc: CocoDocument,
  ann: Annotation,
  labels: Label[],
  nameToCategoryId: Map<string, number>,
  imageId: number,
  annotationId: number
): number {
  if (ann.hidden) return annotationId;

  const labelName = resolveLabelName(labels, ann.labelId);
  if (!labelName) return annotationId;
  const categoryId = nameToCategoryId.get(labelName);
  if (!categoryId) return annotationId;

  let bbox: number[] | null = null;
  let area = 0;

  if (ann.shapeType === 'rectangle') {
    bbox = rectBbox(ann.x, ann.y, ann.width, ann.height);
    area = rectArea(ann.width, ann.height);
  } else if (ann.shapeType === 'rotated-rectangle') {
    const aabb = getObbAxisAlignedBBox(
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.angle ?? 0
    );
    bbox = rectBbox(aabb.x, aabb.y, aabb.width, aabb.height);
    area = rectArea(aabb.width, aabb.height);
  } else {
    return annotationId;
  }

  doc.annotations.push({
    id: annotationId,
    image_id: imageId,
    category_id: categoryId,
    bbox,
    area,
    iscrowd: 0,
    ignore: 0,
    segmentation: [],
  });
  return annotationId + 1;
}

interface SegInstance {
  label: string;
  segmentations: number[][];
}

function appendSegmentationAnnotations(
  doc: CocoDocument,
  annotations: Annotation[],
  labels: Label[],
  labelToCategoryId: Map<string, number>,
  imageId: number,
  annotationId: number
): number {
  const instances = new Map<string, SegInstance>();

  for (const ann of annotations) {
    if (ann.hidden || ann.shapeType !== 'polygon' || !ann.points?.length) {
      continue;
    }
    const labelName = resolveLabelName(labels, ann.labelId);
    if (
      !labelName ||
      labelName === '__ignore__' ||
      !labelToCategoryId.has(labelName)
    ) {
      continue;
    }

    const groupKey = `${labelName}::${ann.groupId ?? ann.id}`;
    const entry = instances.get(groupKey) ?? { label: labelName, segmentations: [] };
    entry.segmentations.push(polygonFlatToSegmentation(ann.points));
    instances.set(groupKey, entry);
  }

  for (const instance of instances.values()) {
    const area = instance.segmentations.reduce(
      (sum, seg) => sum + shoelaceArea(seg),
      0
    );
    const bbox = minEnclosingBbox(instance.segmentations);
    if (bbox.length === 0) continue;

    doc.annotations.push({
      id: annotationId,
      image_id: imageId,
      category_id: labelToCategoryId.get(instance.label)!,
      segmentation: instance.segmentations,
      area,
      bbox,
      iscrowd: 0,
      ignore: 0,
    });
    annotationId += 1;
  }

  return annotationId;
}

function buildKeypointsArray(
  keypointNames: string[],
  values: Map<string, [number, number, number]>,
  hasVisible: boolean
): { keypoints: number[]; numKeypoints: number } {
  const keypoints: number[] = [];
  let numKeypoints = 0;

  for (const name of keypointNames) {
    const entry = values.get(name);
    if (!entry) {
      if (hasVisible) keypoints.push(0, 0, 0);
      else keypoints.push(0, 0);
      continue;
    }
    const [x, y, visible] = entry;
    if (visible <= 0) {
      if (hasVisible) keypoints.push(0, 0, 0);
      else keypoints.push(0, 0);
      continue;
    }
    numKeypoints += 1;
    if (hasVisible) {
      keypoints.push(Math.round(x), Math.round(y), visible);
    } else {
      keypoints.push(Math.round(x), Math.round(y));
    }
  }

  return { keypoints, numKeypoints };
}

function keypointsFromPoseAnnotation(
  ann: Annotation,
  className: string,
  poseConfig: PoseConfig
): Map<string, [number, number, number]> {
  const values = new Map<string, [number, number, number]>();
  const kptNames = getKeypointNamesForClass(poseConfig, className);
  const kpts = ann.keypoints ?? [];

  for (let i = 0; i < kptNames.length; i++) {
    const v = kpts[i * 3 + 2] ?? 0;
    if (v <= 0) continue;
    values.set(kptNames[i], [kpts[i * 3], kpts[i * 3 + 1], v]);
  }
  return values;
}

function appendKeypointAnnotations(
  doc: CocoDocument,
  annotations: Annotation[],
  labels: Label[],
  poseConfig: PoseConfig,
  classNameToCategoryId: Map<string, number>,
  imageId: number,
  annotationId: number
): number {
  const consumedGroupIds = new Set<number>();

  for (const ann of annotations) {
    if (ann.hidden || ann.shapeType !== 'pose') continue;

    const labelName = resolveLabelName(labels, ann.labelId);
    if (!labelName) continue;

    const className = resolvePoseClassNameForTarget(poseConfig, labelName);
    const categoryId = resolvePoseCategoryId(
      poseConfig,
      classNameToCategoryId,
      className
    );
    if (!categoryId) continue;

    const kptNames = getKeypointNamesForClass(poseConfig, className);
    const values = keypointsFromPoseAnnotation(ann, className, poseConfig);
    const { keypoints, numKeypoints } = buildKeypointsArray(
      kptNames,
      values,
      poseConfig.hasVisible
    );

    doc.annotations.push({
      id: annotationId,
      image_id: imageId,
      category_id: categoryId,
      bbox: rectBbox(ann.x, ann.y, ann.width, ann.height),
      area: rectArea(ann.width, ann.height),
      iscrowd: 0,
      ignore: 0,
      segmentation: [],
      keypoints,
      num_keypoints: numKeypoints,
    });
    annotationId += 1;
    if (ann.groupId != null) consumedGroupIds.add(ann.groupId);
  }

  const groups = new Map<
    number,
    { bbox?: Annotation; points: Annotation[] }
  >();

  for (const ann of annotations) {
    if (ann.hidden || ann.groupId == null || consumedGroupIds.has(ann.groupId)) {
      continue;
    }
    const entry = groups.get(ann.groupId) ?? { points: [] };
    if (ann.shapeType === 'point') {
      entry.points.push(ann);
    } else if (isPoseBindableShape(ann.shapeType)) {
      entry.bbox = ann;
    }
    groups.set(ann.groupId, entry);
  }

  for (const { bbox, points } of groups.values()) {
    if (!bbox || points.length === 0) continue;

    const labelName = resolveLabelName(labels, bbox.labelId);
    if (!labelName) continue;

    const className = resolvePoseClassNameForTarget(poseConfig, labelName);
    const categoryId = resolvePoseCategoryId(
      poseConfig,
      classNameToCategoryId,
      className
    );
    if (!categoryId) continue;

    const kptNames = getKeypointNamesForClass(poseConfig, className);
    const values = new Map<string, [number, number, number]>();

    for (const pt of points) {
      const ptLabel = resolveLabelName(labels, pt.labelId);
      if (!ptLabel) continue;
      const index = resolveKeypointIndexFromLabelName(
        poseConfig,
        className,
        ptLabel
      );
      if (index < 0) continue;
      const name = kptNames[index];
      if (!name) continue;
      values.set(name, [pt.x, pt.y, POSE_KEYPOINT_VISIBLE]);
    }

    let bx = bbox.x;
    let by = bbox.y;
    let bw = bbox.width;
    let bh = bbox.height;

    if (bbox.shapeType === 'rotated-rectangle') {
      const aabb = getObbAxisAlignedBBox(
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        bbox.angle ?? 0
      );
      bx = aabb.x;
      by = aabb.y;
      bw = aabb.width;
      bh = aabb.height;
    }

    const { keypoints, numKeypoints } = buildKeypointsArray(
      kptNames,
      values,
      poseConfig.hasVisible
    );

    doc.annotations.push({
      id: annotationId,
      image_id: imageId,
      category_id: categoryId,
      bbox: rectBbox(bx, by, bw, bh),
      area: rectArea(bw, bh),
      iscrowd: 0,
      ignore: 0,
      segmentation: [],
      keypoints,
      num_keypoints: numKeypoints,
    });
    annotationId += 1;
  }

  return annotationId;
}

export function getCocoOutputFilename(format: CocoFormat): string {
  switch (format) {
    case 'detection':
      return 'coco_detection.json';
    case 'segmentation':
      return 'coco_instance_segmentation.json';
    case 'keypoints':
      return 'coco_keypoints.json';
  }
}

export function buildCocoDocument(input: CocoExportInput): CocoDocument {
  const { format, images, annotationsByImage, labels, classNames, poseConfig } =
    input;
  const doc = createCocoBase(format);

  if (format === 'detection') {
    if (!classNames?.length) {
      throw new Error('COCO 检测导出缺少 classes.txt 配置');
    }
    const { categories, nameToCategoryId } =
      buildDetectionCategoriesFromNames(classNames);
    doc.categories = categories;

    let imageId = 0;
    let annotationId = 0;

    for (const image of images) {
      if (image.width <= 0 || image.height <= 0) continue;
      doc.images.push({
        id: imageId,
        file_name: image.name,
        width: image.width,
        height: image.height,
        license: 0,
        url: null,
        date_captured: null,
      });

      const anns = annotationsByImage[image.id] ?? [];
      for (const ann of anns) {
        annotationId = appendDetectionAnnotations(
          doc,
          ann,
          labels,
          nameToCategoryId,
          imageId,
          annotationId
        );
      }
      imageId += 1;
    }

    return doc;
  }

  if (format === 'segmentation') {
    if (!classNames?.length) {
      throw new Error('COCO 分割导出缺少 labels.txt 配置');
    }
    const { categories, labelToCategoryId } =
      buildSegmentationCategoriesFromNames(classNames);
    doc.categories = categories;

    let imageId = 0;
    let annotationId = 0;

    for (const image of images) {
      if (image.width <= 0 || image.height <= 0) continue;
      doc.images.push({
        id: imageId,
        file_name: image.name,
        width: image.width,
        height: image.height,
        license: 0,
        url: null,
        date_captured: null,
      });

      const anns = annotationsByImage[image.id] ?? [];
      annotationId = appendSegmentationAnnotations(
        doc,
        anns,
        labels,
        labelToCategoryId,
        imageId,
        annotationId
      );
      imageId += 1;
    }

    return doc;
  }

  if (!poseConfig || getPoseClassNames(poseConfig).length === 0) {
    throw new Error('COCO 关键点导出缺少 pose yaml 配置');
  }

  const { categories, classNameToCategoryId } =
    buildKeypointCategories(poseConfig);
  doc.categories = categories;

  let imageId = 0;
  let annotationId = 0;

  for (const image of images) {
    if (image.width <= 0 || image.height <= 0) continue;
    doc.images.push({
      id: imageId,
      file_name: image.name,
      width: image.width,
      height: image.height,
      license: 0,
      url: null,
      date_captured: null,
    });

    const anns = annotationsByImage[image.id] ?? [];
    annotationId = appendKeypointAnnotations(
      doc,
      anns,
      labels,
      poseConfig,
      classNameToCategoryId,
      imageId,
      annotationId
    );
    imageId += 1;
  }

  return doc;
}

export function cocoExportToJson(input: CocoExportInput): string {
  const doc = buildCocoDocument(input);
  return `${JSON.stringify(doc, null, 2)}\n`;
}
