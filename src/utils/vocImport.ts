import type { Annotation, ImageFile, Label, VocFormat } from '../types';
import { getPolygonBBox } from '../types';
import { generateId } from './id';
import { getBasename } from './filePicker';
import { labelsFromNames } from './yoloLabels';

export interface VocImportResult {
  labels: Label[];
  annotationsByImage: Record<string, Annotation[]>;
  imagePatches: Record<
    string,
    { width: number; height: number; loaded: boolean }
  >;
  matchedImages: number;
  annotationCount: number;
}

function normalizeMatchKey(filename: string): string {
  const leaf = filename.replace(/^.*[/\\]/, '').trim();
  return getBasename(leaf).toLowerCase();
}

function buildImageIdMap(imageList: ImageFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const image of imageList) {
    const key = normalizeMatchKey(image.name);
    if (!map.has(key)) {
      map.set(key, image.id);
    }
  }
  return map;
}

function getDirectChild(parent: Element, tag: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tag) return child;
  }
  return null;
}

function getNestedText(parent: Element, path: string): string | null {
  const parts = path.split('/');
  let node: Element | null = parent;
  for (const part of parts) {
    if (!node) return null;
    node = getDirectChild(node, part);
  }
  return node?.textContent?.trim() ?? null;
}

function getCoordinate(obj: Element, path: string): number {
  const text = getNestedText(obj, path);
  if (text == null || text === '') {
    throw new Error(`missing <${path}>`);
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new Error(`invalid <${path}>`);
  }
  return value;
}

function resolveImageFilename(
  root: Element,
  fallbackImageName: string
): string {
  const filenameElem = getDirectChild(root, 'filename');
  const raw = filenameElem?.textContent?.trim() ?? '';
  if (!raw) return fallbackImageName;

  const xmlImageFilename = raw.replace(/^.*[/\\]/, '').trim();
  if (!xmlImageFilename) return fallbackImageName;

  if (xmlImageFilename.includes('.')) {
    return xmlImageFilename;
  }

  const ext = fallbackImageName.includes('.')
    ? fallbackImageName.slice(fallbackImageName.lastIndexOf('.'))
    : '';
  return `${xmlImageFilename}${ext}`;
}

function resolveImageId(
  imageIdMap: Map<string, string>,
  imageName: string,
  xmlBasename: string
): string | undefined {
  return (
    imageIdMap.get(normalizeMatchKey(imageName)) ??
    imageIdMap.get(xmlBasename)
  );
}

function parsePolygonObject(obj: Element): number[] {
  const polygonElem = getDirectChild(obj, 'polygon');
  if (!polygonElem) {
    throw new Error('missing polygon');
  }

  const points: number[] = [];
  let index = 1;
  while (true) {
    const xNode = getDirectChild(polygonElem, `x${index}`);
    const yNode = getDirectChild(polygonElem, `y${index}`);
    if (!xNode || !yNode) break;
    const xText = xNode.textContent?.trim();
    const yText = yNode.textContent?.trim();
    if (xText == null || yText == null || xText === '' || yText === '') break;
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`invalid polygon point ${index}`);
    }
    points.push(x, y);
    index += 1;
  }

  if (points.length < 6) {
    throw new Error('polygon has fewer than 3 points');
  }
  return points;
}

function parseBndboxRectangle(labelId: string): (obj: Element) => Annotation {
  return (obj) => {
    const xmin = getCoordinate(obj, 'bndbox/xmin');
    const ymin = getCoordinate(obj, 'bndbox/ymin');
    const xmax = getCoordinate(obj, 'bndbox/xmax');
    const ymax = getCoordinate(obj, 'bndbox/ymax');
    const x = Math.min(xmin, xmax);
    const y = Math.min(ymin, ymax);
    const width = Math.abs(xmax - xmin);
    const height = Math.abs(ymax - ymin);

    return {
      id: generateId(),
      labelId,
      shapeType: 'rectangle',
      x,
      y,
      width,
      height,
    };
  };
}

function parseVocObject(
  obj: Element,
  mode: VocFormat,
  labelId: string,
  groupId: number
): Annotation | null {
  try {
    if (mode === 'segmentation' && getDirectChild(obj, 'polygon')) {
      const points = parsePolygonObject(obj);
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
        groupId,
      };
    }

    if (getDirectChild(obj, 'bndbox')) {
      return { ...parseBndboxRectangle(labelId)(obj), groupId };
    }

    throw new Error(`missing geometry for mode ${mode}`);
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn(
        `Skipping VOC object: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  }
}

function parseVocDocument(
  doc: Document,
  mode: VocFormat,
  fallbackImageName: string
): {
  imageName: string;
  width: number;
  height: number;
  objects: { labelName: string; element: Element }[];
} {
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('无效的 VOC XML');
  }

  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'annotation') {
    throw new Error('根节点必须是 <annotation>');
  }

  const widthText = getNestedText(root, 'size/width');
  const heightText = getNestedText(root, 'size/height');
  if (widthText == null || heightText == null) {
    throw new Error('VOC XML 缺少 <size> 元素');
  }
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('VOC XML 中图片尺寸无效');
  }

  const imageName = resolveImageFilename(root, fallbackImageName);
  const objects: { labelName: string; element: Element }[] = [];

  for (const obj of Array.from(root.getElementsByTagName('object'))) {
    const nameElem = getDirectChild(obj, 'name');
    const labelName = nameElem?.textContent?.trim();
    if (!labelName) continue;
    objects.push({ labelName, element: obj });
  }

  return { imageName, width, height, objects };
}

export async function importVocFromXmlFilesAsync(
  xmlFiles: File[],
  imageList: ImageFile[],
  mode: VocFormat
): Promise<VocImportResult> {
  const imageIdMap = buildImageIdMap(imageList);
  const parsedFiles: {
    appImageId: string;
    width: number;
    height: number;
    objects: { labelName: string; element: Element }[];
  }[] = [];

  for (const file of xmlFiles) {
    const xmlBasename = getBasename(file.name).toLowerCase();
    const fallbackImageName = `${xmlBasename}.jpg`;

    try {
      const doc = new DOMParser().parseFromString(
        await file.text(),
        'text/xml'
      );
      const parsed = parseVocDocument(doc, mode, fallbackImageName);
      const appImageId = resolveImageId(
        imageIdMap,
        parsed.imageName,
        xmlBasename
      );
      if (!appImageId) continue;

      parsedFiles.push({
        appImageId,
        width: parsed.width,
        height: parsed.height,
        objects: parsed.objects,
      });
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn(`Skipping ${file.name}:`, err);
      }
    }
  }

  const allLabelNames = new Set<string>();
  for (const file of parsedFiles) {
    for (const { labelName } of file.objects) {
      allLabelNames.add(labelName);
    }
  }

  const labels = labelsFromNames([...allLabelNames]);
  const labelIdByName = new Map(labels.map((l) => [l.name, l.id]));
  const annotationsByImage: Record<string, Annotation[]> = {};
  const imagePatches: VocImportResult['imagePatches'] = {};
  const matchedSet = new Set<string>();
  let annotationCount = 0;

  for (const file of parsedFiles) {
    matchedSet.add(file.appImageId);
    imagePatches[file.appImageId] = {
      width: file.width,
      height: file.height,
      loaded: true,
    };

    const anns: Annotation[] = [];
    let groupId = 0;
    for (const { labelName, element } of file.objects) {
      const labelId = labelIdByName.get(labelName);
      if (!labelId) continue;

      const ann = parseVocObject(element, mode, labelId, groupId);
      if (ann) {
        anns.push(ann);
        groupId += 1;
      }
    }

    annotationsByImage[file.appImageId] = anns;
    annotationCount += anns.length;
  }

  return {
    labels,
    annotationsByImage,
    imagePatches,
    matchedImages: matchedSet.size,
    annotationCount,
  };
}
