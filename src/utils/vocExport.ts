import type { Annotation, Label, VocFormat } from '../types';

const VOC_DATABASE = 'Labeling-vue3';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPoint(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number
): [number, number] {
  return [
    clamp(x, 0, imageWidth),
    clamp(y, 0, imageHeight),
  ];
}

function flatPointsToPairs(points: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push([points[i], points[i + 1]]);
  }
  return pairs;
}

function rectangleToFourPoints(
  x: number,
  y: number,
  width: number,
  height: number
): [number, number][] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

function calculateBoundingBox(points: [number, number][]): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    xmin: Math.min(...xs),
    ymin: Math.min(...ys),
    xmax: Math.max(...xs),
    ymax: Math.max(...ys),
  };
}

function appendTextElement(
  parent: Element,
  tag: string,
  text: string
): Element {
  const elem = parent.ownerDocument!.createElement(tag);
  elem.textContent = text;
  parent.appendChild(elem);
  return elem;
}

function appendBndbox(
  objectElem: Element,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
): void {
  const bndbox = objectElem.ownerDocument!.createElement('bndbox');
  appendTextElement(bndbox, 'xmin', String(Math.round(xmin)));
  appendTextElement(bndbox, 'ymin', String(Math.round(ymin)));
  appendTextElement(bndbox, 'xmax', String(Math.round(xmax)));
  appendTextElement(bndbox, 'ymax', String(Math.round(ymax)));
  objectElem.appendChild(bndbox);
}

function appendPolygon(
  objectElem: Element,
  points: [number, number][]
): void {
  const polygon = objectElem.ownerDocument!.createElement('polygon');
  points.forEach((point, index) => {
    appendTextElement(polygon, `x${index + 1}`, String(point[0]));
    appendTextElement(polygon, `y${index + 1}`, String(point[1]));
  });
  objectElem.appendChild(polygon);
}

function appendObject(
  root: Element,
  labelName: string,
  points: [number, number][],
  mode: VocFormat,
  includePolygon: boolean
): boolean {
  if (points.length < 2) return false;

  const objectElem = root.ownerDocument!.createElement('object');
  appendTextElement(objectElem, 'name', labelName);
  appendTextElement(objectElem, 'pose', 'Unspecified');
  appendTextElement(objectElem, 'truncated', '0');
  appendTextElement(objectElem, 'occluded', '0');
  appendTextElement(objectElem, 'difficult', '0');

  const { xmin, ymin, xmax, ymax } = calculateBoundingBox(points);
  appendBndbox(objectElem, xmin, ymin, xmax, ymax);

  if (mode === 'segmentation' && includePolygon && points.length >= 3) {
    appendPolygon(objectElem, points);
  }

  root.appendChild(objectElem);
  return true;
}

export function annotationsToVocXml(
  annotations: Annotation[],
  labels: Label[],
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  mode: VocFormat
): string {
  const doc = document.implementation.createDocument('', 'annotation', null);
  const root = doc.documentElement;

  appendTextElement(root, 'folder', 'Annotations');
  appendTextElement(root, 'filename', imageName);

  const size = doc.createElement('size');
  appendTextElement(size, 'width', String(imageWidth));
  appendTextElement(size, 'height', String(imageHeight));
  appendTextElement(size, 'depth', '3');
  root.appendChild(size);

  const source = doc.createElement('source');
  appendTextElement(source, 'database', VOC_DATABASE);
  root.appendChild(source);

  const labelById = new Map(labels.map((l) => [l.id, l.name]));

  for (const ann of annotations) {
    if (ann.hidden) continue;

    const labelName = labelById.get(ann.labelId);
    if (!labelName) continue;

    let pairs: [number, number][] = [];

    let includePolygon = false;

    if (ann.shapeType === 'rectangle' && (mode === 'detection' || mode === 'segmentation')) {
      pairs = rectangleToFourPoints(ann.x, ann.y, ann.width, ann.height).map(
        ([x, y]) => clampPoint(x, y, imageWidth, imageHeight)
      );
    } else if (ann.shapeType === 'polygon' && mode === 'segmentation') {
      if (!ann.points || ann.points.length < 6) continue;
      pairs = flatPointsToPairs(ann.points).map(([x, y]) =>
        clampPoint(x, y, imageWidth, imageHeight)
      );
      if (pairs.length < 3) continue;
      includePolygon = true;
    } else {
      continue;
    }

    appendObject(root, labelName, pairs, mode, includePolygon);
  }

  const serializer = new XMLSerializer();
  const body = serializer.serializeToString(root);
  return `<?xml version="1.0" encoding="utf-8"?>\n${body}\n`;
}
