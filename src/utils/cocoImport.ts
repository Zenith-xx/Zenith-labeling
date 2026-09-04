import type { Annotation, CocoFormat, ImageFile, Label } from '../types';
import { getPolygonBBox } from '../types';
import { generateId } from './id';
import { getBasename } from './filePicker';
import { labelsFromNames } from './yoloLabels';
import {
  mergePoseLabels,
  type PoseConfig,
} from './poseConfig';
import type { CocoDocument, CocoCategory } from './cocoExport';

export interface CocoImportResult {
  labels: Label[];
  annotationsByImage: Record<string, Annotation[]>;
  poseConfig?: PoseConfig;
  imagePatches: Record<
    string,
    { width: number; height: number; loaded: boolean }
  >;
  matchedImages: number;
  annotationCount: number;
}

function parseCocoDocument(content: string): CocoDocument {
  const data = JSON.parse(content) as CocoDocument;
  if (!Array.isArray(data.images) || !Array.isArray(data.annotations)) {
    throw new Error('无效的 COCO JSON：缺少 images 或 annotations');
  }
  return data;
}

function buildImageIdMap(imageList: ImageFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const image of imageList) {
    const key = getBasename(image.name).toLowerCase();
    if (!map.has(key)) {
      map.set(key, image.id);
    }
  }
  return map;
}

function buildCategoryMaps(categories: CocoCategory[]) {
  const idToName = new Map<number, string>();
  const idToKeypoints = new Map<number, string[]>();
  for (const cat of categories) {
    idToName.set(cat.id, cat.name);
    if (cat.keypoints?.length) {
      idToKeypoints.set(cat.id, cat.keypoints);
    }
  }
  return { idToName, idToKeypoints };
}

function poseConfigFromCategories(categories: CocoCategory[]): PoseConfig {
  const classes: Record<string, string[]> = {};
  for (const cat of categories) {
    if (cat.keypoints?.length) {
      classes[cat.name] = [...cat.keypoints];
    }
  }
  if (Object.keys(classes).length === 0) {
    throw new Error('COCO JSON 中未找到带 keypoints 的 categories');
  }
  return { hasVisible: true, classes };
}

function labelsForDetection(categories: CocoCategory[]): Label[] {
  const names = categories
    .map((c) => c.name)
    .filter((name) => name && name !== '_background_');
  return labelsFromNames(names);
}

function labelsForSegmentation(categories: CocoCategory[]): Label[] {
  const names = categories
    .map((c) => c.name)
    .filter((name) => name && name !== '_background_');
  return labelsFromNames(names);
}

function labelIdForName(labels: Label[], name: string): string | null {
  const label = labels.find((l) => l.name === name);
  return label?.id ?? null;
}

function importDetectionAnnotations(
  doc: CocoDocument,
  labels: Label[],
  imageIdMap: Map<string, string>,
  idToName: Map<number, string>
): CocoImportResult {
  const annotationsByImage: Record<string, Annotation[]> = {};
  const imagePatches: CocoImportResult['imagePatches'] = {};
  let annotationCount = 0;
  let matchedImages = 0;
  const matchedSet = new Set<string>();

  for (const cocoImage of doc.images) {
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;
    matchedSet.add(appImageId);
    if (cocoImage.width > 0 && cocoImage.height > 0) {
      imagePatches[appImageId] = {
        width: cocoImage.width,
        height: cocoImage.height,
        loaded: true,
      };
    }
  }

  for (const ann of doc.annotations) {
    const labelName = idToName.get(ann.category_id);
    if (!labelName) continue;
    const labelId = labelIdForName(labels, labelName);
    if (!labelId) continue;

    const cocoImage = doc.images.find((img) => img.id === ann.image_id);
    if (!cocoImage) continue;
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;

    const bbox = ann.bbox;
    if (!bbox || bbox.length < 4) continue;

    const list = annotationsByImage[appImageId] ?? [];
    list.push({
      id: generateId(),
      labelId,
      shapeType: 'rectangle',
      x: bbox[0],
      y: bbox[1],
      width: bbox[2],
      height: bbox[3],
      hidden: ann.ignore === 1,
    });
    annotationsByImage[appImageId] = list;
    annotationCount += 1;
  }

  matchedImages = matchedSet.size;
  return {
    labels,
    annotationsByImage,
    imagePatches,
    matchedImages,
    annotationCount,
  };
}

function importSegmentationAnnotations(
  doc: CocoDocument,
  labels: Label[],
  imageIdMap: Map<string, string>,
  idToName: Map<number, string>
): CocoImportResult {
  const annotationsByImage: Record<string, Annotation[]> = {};
  const imagePatches: CocoImportResult['imagePatches'] = {};
  let annotationCount = 0;
  const matchedSet = new Set<string>();

  for (const cocoImage of doc.images) {
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;
    matchedSet.add(appImageId);
    if (cocoImage.width > 0 && cocoImage.height > 0) {
      imagePatches[appImageId] = {
        width: cocoImage.width,
        height: cocoImage.height,
        loaded: true,
      };
    }
  }

  for (const ann of doc.annotations) {
    const labelName = idToName.get(ann.category_id);
    if (!labelName || labelName === '_background_') continue;
    const labelId = labelIdForName(labels, labelName);
    if (!labelId) continue;

    const cocoImage = doc.images.find((img) => img.id === ann.image_id);
    if (!cocoImage) continue;
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;

    const segmentations = ann.segmentation ?? [];
    const flatPolys: number[][] = [];
    for (const seg of segmentations) {
      if (!Array.isArray(seg) || seg.length < 6 || seg.length % 2 !== 0) continue;
      flatPolys.push(seg);
    }
    if (flatPolys.length === 0) continue;

    const groupId = flatPolys.length > 1 ? ann.id : undefined;
    const list = annotationsByImage[appImageId] ?? [];

    for (const flat of flatPolys) {
      const bbox = getPolygonBBox(flat);
      list.push({
        id: generateId(),
        labelId,
        shapeType: 'polygon',
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        points: flat,
        groupId,
        hidden: ann.ignore === 1,
      });
      annotationCount += 1;
    }
    annotationsByImage[appImageId] = list;
  }

  return {
    labels,
    annotationsByImage,
    imagePatches,
    matchedImages: matchedSet.size,
    annotationCount,
  };
}

function buildKeypointsFromCoco(
  values: number[],
  kptNames: string[],
  hasVisible: boolean
): number[] {
  const keypoints: number[] = [];
  const stride = hasVisible ? 3 : 2;
  for (let i = 0; i < kptNames.length; i++) {
    const base = i * stride;
    const x = values[base] ?? 0;
    const y = values[base + 1] ?? 0;
    const v = hasVisible ? values[base + 2] ?? 0 : 0;
    keypoints.push(x, y, v);
  }
  return keypoints;
}

function importKeypointAnnotations(
  doc: CocoDocument,
  labels: Label[],
  poseConfig: PoseConfig,
  imageIdMap: Map<string, string>,
  idToName: Map<number, string>,
  idToKeypoints: Map<number, string[]>
): CocoImportResult {
  const annotationsByImage: Record<string, Annotation[]> = {};
  const imagePatches: CocoImportResult['imagePatches'] = {};
  let annotationCount = 0;
  const matchedSet = new Set<string>();

  for (const cocoImage of doc.images) {
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;
    matchedSet.add(appImageId);
    if (cocoImage.width > 0 && cocoImage.height > 0) {
      imagePatches[appImageId] = {
        width: cocoImage.width,
        height: cocoImage.height,
        loaded: true,
      };
    }
  }

  for (const ann of doc.annotations) {
    const labelName = idToName.get(ann.category_id);
    if (!labelName) continue;
    const labelId = labelIdForName(labels, labelName);
    if (!labelId) continue;

    const kptNames =
      idToKeypoints.get(ann.category_id) ??
      poseConfig.classes[labelName] ??
      [];
    if (kptNames.length === 0) continue;

    const cocoImage = doc.images.find((img) => img.id === ann.image_id);
    if (!cocoImage) continue;
    const appImageId = imageIdMap.get(getBasename(cocoImage.file_name).toLowerCase());
    if (!appImageId) continue;

    const bbox = ann.bbox;
    if (!bbox || bbox.length < 4) continue;
    const keypointValues = ann.keypoints ?? [];
    const hasVisible = keypointValues.length === kptNames.length * 3;
    const keypoints = buildKeypointsFromCoco(
      keypointValues,
      kptNames,
      hasVisible
    );

    const list = annotationsByImage[appImageId] ?? [];
    list.push({
      id: generateId(),
      labelId,
      shapeType: 'pose',
      x: bbox[0],
      y: bbox[1],
      width: bbox[2],
      height: bbox[3],
      keypoints,
      groupId: typeof ann.id === 'number' ? ann.id : undefined,
      hidden: ann.ignore === 1,
    });
    annotationsByImage[appImageId] = list;
    annotationCount += 1;
  }

  return {
    labels,
    annotationsByImage,
    poseConfig,
    imagePatches,
    matchedImages: matchedSet.size,
    annotationCount,
  };
}

export function importCocoJson(
  content: string,
  format: CocoFormat,
  imageList: ImageFile[],
  existingLabels: Label[] = []
): CocoImportResult {
  const doc = parseCocoDocument(content);
  const categories = doc.categories ?? [];
  const imageIdMap = buildImageIdMap(imageList);
  const { idToName, idToKeypoints } = buildCategoryMaps(categories);

  if (format === 'detection') {
    const labels = labelsForDetection(categories);
    if (labels.length === 0) {
      throw new Error('COCO JSON 中未找到有效类别');
    }
    return importDetectionAnnotations(doc, labels, imageIdMap, idToName);
  }

  if (format === 'segmentation') {
    const labels = labelsForSegmentation(categories);
    if (labels.length === 0) {
      throw new Error('COCO JSON 中未找到有效分割类别');
    }
    return importSegmentationAnnotations(doc, labels, imageIdMap, idToName);
  }

  const poseConfig = poseConfigFromCategories(categories);
  const labels = mergePoseLabels(existingLabels, poseConfig);
  return importKeypointAnnotations(
    doc,
    labels,
    poseConfig,
    imageIdMap,
    idToName,
    idToKeypoints
  );
}
