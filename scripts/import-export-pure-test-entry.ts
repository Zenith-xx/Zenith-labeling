/**
 * Import / Export 纯函数自检（无 Store）。
 * 由 scripts/verify-import-pure.mjs 加载。
 */
import assert from 'node:assert/strict';
import {
  LabelRegistry,
  matchDatasetItems,
  parseAnnotationBatch,
  parseAnnotationFile,
  scanDatasetFiles,
} from '../src/importer';
import type { Annotation, ImageFile, Label } from '../src/types';
import { DEFAULT_POSE_CONFIG } from '../src/utils/poseConfig';
import { cocoExportToJson } from '../src/utils/cocoExport';
import { importCocoJson } from '../src/utils/cocoImport';
import {
  annotationsToVocXml,
} from '../src/utils/vocExport';
import {
  annotationsToLabelMeJson,
  LABELME_VERSION,
} from '../src/utils/labelMeExport';
import {
  annotationToYoloLine,
  annotationsToYoloTxt,
  ensurePoseImportLabels,
  labelsFromNames,
  parseYoloTxt,
} from '../src/utils/yoloLabels';
import { getObbCorners } from '../src/utils/obbGeometry';

const W = 640;
const H = 480;

function mockFile(name: string, content = ''): File {
  return new File([content], name, {
    type: name.endsWith('.json') ? 'application/json' : 'image/jpeg',
  });
}

function makeLabel(name: string, index: number): Label {
  return labelsFromNames([name])[0]!;
}

function approx(a: number, b: number, eps = 0.5): void {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b} ≈ ${a}`);
}

function mockImage(id: string, name: string): ImageFile {
  return {
    id,
    name,
    file: mockFile(name),
    width: W,
    height: H,
    loaded: true,
  };
}

async function testImporterPipeline(): Promise<void> {
  const files: File[] = [];
  for (let i = 0; i < 500; i += 1) {
    const id = String(i + 1).padStart(5, '0');
    files.push(mockFile(`${id}.jpg`));
    files.push(
      mockFile(
        `${id}.json`,
        JSON.stringify({
          annotations: [
            {
              labelName: 'crack',
              shapeType: 'rectangle',
              x: 1,
              y: 2,
              width: 10,
              height: 8,
            },
          ],
        })
      )
    );
  }

  const index = scanDatasetFiles(files);
  assert.equal(index.images.size, 500);
  const items = matchDatasetItems(index);
  assert.equal(items.length, 500);

  const inputs = items
    .filter((item) => item.annotationFile)
    .map((item) => ({
      imageId: item.id,
      annotationFile: item.annotationFile!,
    }));

  const registry = new LabelRegistry();
  const result = await parseAnnotationBatch(inputs, registry, 200);
  assert.equal(Object.keys(result.annotationsByImage).length, 500);
  assert.equal(result.annotationCount, 500);
  console.log('PASS importer: scan/match/parse batch (500 json)');
}

function testYoloHbbRoundtrip(): void {
  const labels = labelsFromNames(['cat', 'dog']);
  const ann: Annotation = {
    id: 'a1',
    labelId: labels[0]!.id,
    shapeType: 'rectangle',
    x: 100,
    y: 50,
    width: 200,
    height: 120,
  };
  const line = annotationToYoloLine(ann, labels, W, H, 'hbb');
  assert.ok(line);
  const parsed = parseYoloTxt(line!, labels, W, H, 'hbb');
  assert.equal(parsed.length, 1);
  approx(parsed[0]!.x, ann.x);
  approx(parsed[0]!.y, ann.y);
  approx(parsed[0]!.width, ann.width);
  approx(parsed[0]!.height, ann.height);
  console.log('PASS YOLO HBB roundtrip');
}

function testYoloObbRoundtrip(): void {
  const labels = labelsFromNames(['box']);
  const ann: Annotation = {
    id: 'obb1',
    labelId: labels[0]!.id,
    shapeType: 'rotated-rectangle',
    x: 120,
    y: 80,
    width: 160,
    height: 90,
    angle: 0.35,
    points: getObbCorners(120, 80, 160, 90, 0.35),
  };
  const txt = annotationsToYoloTxt([ann], labels, W, H, 'obb');
  const parsed = parseYoloTxt(txt, labels, W, H, 'obb');
  assert.equal(parsed.length, 1);
  approx(parsed[0]!.x, ann.x, 1);
  approx(parsed[0]!.y, ann.y, 1);
  approx(parsed[0]!.width, ann.width, 1);
  approx(parsed[0]!.height, ann.height, 1);
  console.log('PASS YOLO OBB roundtrip');
}

function testYoloSegRoundtrip(): void {
  const labels = labelsFromNames(['region']);
  const points = [10, 10, 200, 10, 200, 150, 10, 150];
  const ann: Annotation = {
    id: 'seg1',
    labelId: labels[0]!.id,
    shapeType: 'polygon',
    x: 10,
    y: 10,
    width: 190,
    height: 140,
    points,
  };
  const txt = annotationsToYoloTxt([ann], labels, W, H, 'seg');
  const parsed = parseYoloTxt(txt, labels, W, H, 'seg');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.points?.length, points.length);
  for (let i = 0; i < points.length; i += 1) {
    approx(parsed[0]!.points![i]!, points[i]!, 1);
  }
  console.log('PASS YOLO Seg roundtrip');
}

function testYoloPoseRoundtrip(): void {
  let labels = labelsFromNames(['person']);
  labels = ensurePoseImportLabels(labels, DEFAULT_POSE_CONFIG);
  const keypoints = new Array(51).fill(0);
  keypoints[0] = 100;
  keypoints[1] = 80;
  keypoints[2] = 2;
  keypoints[3] = 120;
  keypoints[4] = 90;
  keypoints[5] = 2;
  const ann: Annotation = {
    id: 'pose1',
    labelId: labels.find((l) => l.name === 'person')!.id,
    shapeType: 'pose',
    x: 80,
    y: 60,
    width: 120,
    height: 180,
    keypoints,
    groupId: 0,
  };
  const txt = annotationsToYoloTxt([ann], labels, W, H, 'pose', DEFAULT_POSE_CONFIG);
  assert.ok(txt.includes(' 2'), 'exported pose should include visible keypoints');
  const parsed = parseYoloTxt(txt, labels, W, H, 'pose', DEFAULT_POSE_CONFIG);
  assert.ok(parsed.length >= 2, 'pose import should split into rectangle and points');
  const rect = parsed.find((a) => a.shapeType === 'rectangle');
  assert.ok(rect);
  approx(rect!.x, ann.x, 2);
  approx(rect!.y, ann.y, 2);
  console.log('PASS YOLO Pose roundtrip');
}

function testYoloPoseSplitExport(): void {
  let labels = labelsFromNames(['person']);
  labels = ensurePoseImportLabels(labels, DEFAULT_POSE_CONFIG);
  const rect: Annotation = {
    id: 'r1',
    labelId: labels.find((l) => l.name === 'person')!.id,
    shapeType: 'rectangle',
    x: 100,
    y: 80,
    width: 200,
    height: 300,
    groupId: 0,
  };
  const pt: Annotation = {
    id: 'p1',
    labelId: labels.find((l) => l.name === 'nose')!.id,
    shapeType: 'point',
    x: 120,
    y: 90,
    width: 0,
    height: 0,
    groupId: 0,
  };
  const txt = annotationsToYoloTxt([rect, pt], labels, W, H, 'pose', DEFAULT_POSE_CONFIG);
  assert.match(txt, /0\.\d+ 0\.\d+ 2/, 'split rectangle+point export should include keypoints');
  console.log('PASS YOLO Pose split export');
}

function testYoloPoseGroupIdStringExport(): void {
  let labels = labelsFromNames(['person']);
  labels = ensurePoseImportLabels(labels, DEFAULT_POSE_CONFIG);
  const rect: Annotation = {
    id: 'r2',
    labelId: labels.find((l) => l.name === 'person')!.id,
    shapeType: 'rectangle',
    x: 100,
    y: 80,
    width: 200,
    height: 300,
    groupId: '0' as unknown as number,
  };
  const pt: Annotation = {
    id: 'p2',
    labelId: labels.find((l) => l.name === 'nose')!.id,
    shapeType: 'point',
    x: 120,
    y: 90,
    width: 0,
    height: 0,
    groupId: '0' as unknown as number,
  };
  const txt = annotationsToYoloTxt([rect, pt], labels, W, H, 'pose', DEFAULT_POSE_CONFIG);
  assert.match(txt, /0\.\d+ 0\.\d+ 2/, 'string group_id export should include keypoints');
  console.log('PASS YOLO Pose string group_id export');
}

function testCocoDetectionRoundtrip(): void {
  const labels = labelsFromNames(['cat']);
  const image = mockImage('img-1', 'photo.jpg');
  const ann: Annotation = {
    id: 'c1',
    labelId: labels[0]!.id,
    shapeType: 'rectangle',
    x: 40,
    y: 30,
    width: 100,
    height: 80,
  };
  const json = cocoExportToJson({
    format: 'detection',
    images: [image],
    annotationsByImage: { [image.id]: [ann] },
    labels,
    classNames: ['cat'],
  });
  const imported = importCocoJson(json, 'detection', [image], labels);
  const round = imported.annotationsByImage[image.id] ?? [];
  assert.equal(round.length, 1);
  approx(round[0]!.x, ann.x);
  approx(round[0]!.y, ann.y);
  approx(round[0]!.width, ann.width);
  approx(round[0]!.height, ann.height);
  console.log('PASS COCO detection roundtrip');
}

async function testLabelMeRoundtrip(): Promise<void> {
  const labels = [makeLabel('car', 0)];
  const ann: Annotation = {
    id: 'v1',
    labelId: labels[0]!.id,
    shapeType: 'rectangle',
    x: 25,
    y: 35,
    width: 110,
    height: 70,
  };

  const labelMeJson = annotationsToLabelMeJson(
    [ann],
    labels,
    'photo.jpg',
    W,
    H,
    DEFAULT_POSE_CONFIG
  );
  const doc = JSON.parse(labelMeJson);
  assert.equal(doc.version, LABELME_VERSION);
  assert.equal(doc.imageWidth, W);
  assert.equal(doc.imageHeight, H);
  assert.ok(Array.isArray(doc.shapes) && doc.shapes.length > 0);

  const imported = await parseAnnotationFile(
    mockFile('photo.json', labelMeJson),
    new LabelRegistry(labels)
  );
  assert.equal(imported.annotations.length, 1);
  approx(imported.annotations[0]!.x, ann.x);
  approx(imported.annotations[0]!.y, ann.y);
  console.log('PASS LabelMe export/import roundtrip');
}

function testVocExportStructure(): void {
  const labels = labelsFromNames(['car']);
  const ann: Annotation = {
    id: 'v1',
    labelId: labels[0]!.id,
    shapeType: 'rectangle',
    x: 25,
    y: 35,
    width: 110,
    height: 70,
  };
  const xml = annotationsToVocXml(
    [ann],
    labels,
    'photo.jpg',
    W,
    H,
    'detection'
  );
  assert.ok(xml.includes('<name>car</name>'));
  assert.ok(xml.includes('<xmin>25</xmin>'));
  assert.ok(xml.includes('<ymax>105</ymax>'));
  console.log('PASS VOC export structure');
}

function testCocoSegmentationRoundtrip(): void {
  const labels = labelsFromNames(['region']);
  const points = [10, 10, 200, 10, 200, 150, 10, 150];
  const ann: Annotation = {
    id: 'seg-coco',
    labelId: labels[0]!.id,
    shapeType: 'polygon',
    x: 10,
    y: 10,
    width: 190,
    height: 140,
    points,
  };
  const image = mockImage('img-seg', 'photo.jpg');
  const json = cocoExportToJson({
    format: 'segmentation',
    images: [image],
    annotationsByImage: { [image.id]: [ann] },
    labels,
    classNames: ['region'],
  });
  const imported = importCocoJson(json, 'segmentation', [image], labels);
  const round = imported.annotationsByImage[image.id] ?? [];
  assert.equal(round.length, 1);
  assert.equal(round[0]!.points?.length, points.length);
  for (let i = 0; i < points.length; i += 1) {
    approx(round[0]!.points![i]!, points[i]!, 1);
  }
  console.log('PASS COCO segmentation roundtrip');
}

function testCocoKeypointsRoundtrip(): void {
  let labels = labelsFromNames(['person']);
  labels = ensurePoseImportLabels(labels, DEFAULT_POSE_CONFIG);
  const keypoints = new Array(51).fill(0);
  keypoints[0] = 100;
  keypoints[1] = 80;
  keypoints[2] = 2;
  keypoints[3] = 120;
  keypoints[4] = 90;
  keypoints[5] = 2;
  const ann: Annotation = {
    id: 'pose-coco',
    labelId: labels.find((l) => l.name === 'person')!.id,
    shapeType: 'pose',
    x: 80,
    y: 60,
    width: 120,
    height: 180,
    keypoints,
    groupId: 0,
  };
  const image = mockImage('img-pose', 'photo.jpg');
  const json = cocoExportToJson({
    format: 'keypoints',
    images: [image],
    annotationsByImage: { [image.id]: [ann] },
    labels,
    poseConfig: DEFAULT_POSE_CONFIG,
  });
  const imported = importCocoJson(json, 'keypoints', [image], labels);
  const round = imported.annotationsByImage[image.id] ?? [];
  assert.ok(round.length >= 1);
  const withKp = round.find((a) => a.keypoints && a.keypoints.length > 0);
  assert.ok(withKp);
  approx(withKp!.x, ann.x, 2);
  approx(withKp!.y, ann.y, 2);
  console.log('PASS COCO keypoints roundtrip');
}

async function runTests(): Promise<void> {
  await testImporterPipeline();
  testYoloHbbRoundtrip();
  testYoloObbRoundtrip();
  testYoloSegRoundtrip();
  testYoloPoseRoundtrip();
  testYoloPoseSplitExport();
  testYoloPoseGroupIdStringExport();
  testCocoDetectionRoundtrip();
  testCocoSegmentationRoundtrip();
  testCocoKeypointsRoundtrip();
  testVocExportStructure();
  await testLabelMeRoundtrip();
  console.log('All pure import/export checks passed.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
