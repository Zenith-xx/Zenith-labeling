import type { CocoFormat } from '../types';
import type { CocoDocument } from './cocoExport';
import { downloadZip } from './downloadFile';

function readmeForFormat(format: CocoFormat): string {
  const jsonName = jsonFilename(format);
  const common = `COCO 导入示例包
================

使用步骤（与本工具上传弹窗一致）：

1. 在当前项目中准备好与 JSON 内 file_name 同名的图片
   （示例使用 demo.jpg，宽 640 × 高 480）

2. 在「选择 COCO JSON 文件」步骤，选择本包内的：
   ${jsonName}

3. 点击「开始导入」，按图片文件名匹配并合并到当前项目

包内文件：
- README.txt        本说明
- FORMAT_GUIDE.txt  字段注释（JSON 标准格式不支持行内注释）
- ${jsonName}       可直接导入的示例 JSON
`;

  if (format === 'detection') {
    return `${common}
Detection 说明：
- categories：检测类别列表，id 从 1 开始
- images：图片信息，file_name 须与项目图片 basename 一致
- annotations[].bbox：[x, y, width, height] 左上角 + 宽高（像素）
- annotations[].category_id：对应 categories[].id
`;
  }

  if (format === 'segmentation') {
    return `${common}
Segmentation 说明：
- categories 通常含 _background_（id=0），导入时会自动忽略
- annotations[].segmentation：[[x1,y1,x2,y2,...]] 多边形顶点（像素）
- 每个多边形至少 3 个顶点（6 个数值）
`;
  }

  return `${common}
Keypoints 说明：
- categories[].keypoints：关键点名称列表（顺序须与 keypoints 数组一致）
- annotations[].keypoints：x1,y1,v1, x2,y2,v2, ...
  v：0=未标注，1=遮挡，2=可见
- annotations[].bbox：人体外接框，与关键点同属一条 annotation
`;
}

function formatGuideForFormat(format: CocoFormat): string {
  const header = `COCO JSON 字段注释
==================

通用顶层字段：
  info          数据集元信息
  licenses      许可证
  categories    类别定义
  images        图片列表
  annotations   标注列表

images[] 常用字段：
  id            图片 ID（annotations.image_id 引用）
  file_name     文件名（如 demo.jpg，不含路径）
  width         图片宽度（像素）
  height        图片高度（像素）

annotations[] 通用字段：
  id            标注 ID
  image_id      关联 images[].id
  category_id   关联 categories[].id
  bbox          [x, y, width, height] 外接框（像素）
  area          区域面积
  iscrowd       0=实例，1= crowd
  ignore        0=正常，1=忽略
`;

  if (format === 'detection') {
    return `${header}
categories[]（Detection）：
  id            类别 ID（建议从 1 开始）
  name          类别名（如 person、car）
  supercategory 父类（可为空字符串）

示例见 coco_detection.json：
  - 2 个目标：person、bbox [80,60,120,200]
  - car、bbox [360,180,180,120]
`;
  }

  if (format === 'segmentation') {
    return `${header}
categories[]（Segmentation）：
  id=0 通常为 _background_（背景类，导入时跳过）
  其余 id 对应实际分割类别

annotations[].segmentation：
  二维数组，每个子数组为一组多边形顶点
  格式 [x1, y1, x2, y2, x3, y3, ...]

示例见 coco_instance_segmentation.json：
  - defect：四边形区域
  - scratch：四边形区域
`;
  }

  return `${header}
categories[]（Keypoints）：
  keypoints     关键点名称数组，如 ["nose","left_eye","right_eye"]
  skeleton      骨架连接（可选，如 [[1,2],[1,3]]）

annotations[].keypoints：
  按 categories.keypoints 顺序排列
  每个关键点 3 个数：x, y, visibility

annotations[].num_keypoints：
  可见关键点数量（可选）

示例见 coco_keypoints.json：
  - 1 个 person，含 nose / left_eye / right_eye 三个可见点
`;
}

function baseInfo(format: CocoFormat): CocoDocument['info'] {
  const formatLabel =
    format === 'detection'
      ? 'Detection'
      : format === 'segmentation'
        ? 'Instance Segmentation'
        : 'Keypoints';
  return {
    year: new Date().getFullYear(),
    version: '1.0.0',
    description: `COCO ${formatLabel} import example (demo.jpg 640x480)`,
    contributor: 'Labeling-vue3',
    url: '',
    date_created: new Date().toISOString().slice(0, 10),
  };
}

function baseLicenses(): CocoDocument['licenses'] {
  return [
    {
      id: 1,
      url: 'https://www.gnu.org/licenses/gpl-3.0.html',
      name: 'GNU GENERAL PUBLIC LICENSE Version 3',
    },
  ];
}

function demoImage(): CocoDocument['images'] {
  return [
    {
      id: 1,
      file_name: 'demo.jpg',
      width: 640,
      height: 480,
      license: 0,
      url: null,
      date_captured: null,
    },
  ];
}

function detectionDocument(): CocoDocument {
  return {
    info: baseInfo('detection'),
    licenses: baseLicenses(),
    categories: [
      { id: 1, name: 'person', supercategory: '' },
      { id: 2, name: 'car', supercategory: '' },
    ],
    images: demoImage(),
    annotations: [
      {
        id: 1,
        image_id: 1,
        category_id: 1,
        bbox: [80, 60, 120, 200],
        area: 24000,
        iscrowd: 0,
        ignore: 0,
      },
      {
        id: 2,
        image_id: 1,
        category_id: 2,
        bbox: [360, 180, 180, 120],
        area: 21600,
        iscrowd: 0,
        ignore: 0,
      },
    ],
  };
}

function segmentationDocument(): CocoDocument {
  return {
    info: baseInfo('segmentation'),
    licenses: baseLicenses(),
    type: 'instances',
    categories: [
      { id: 0, name: '_background_', supercategory: null },
      { id: 1, name: 'defect', supercategory: null },
      { id: 2, name: 'scratch', supercategory: null },
    ],
    images: demoImage(),
    annotations: [
      {
        id: 1,
        image_id: 1,
        category_id: 1,
        bbox: [120, 100, 160, 140],
        area: 12800,
        iscrowd: 0,
        ignore: 0,
        segmentation: [[120, 100, 280, 110, 270, 240, 130, 230]],
      },
      {
        id: 2,
        image_id: 1,
        category_id: 2,
        bbox: [400, 200, 100, 80],
        area: 4200,
        iscrowd: 0,
        ignore: 0,
        segmentation: [[400, 200, 500, 205, 495, 280, 405, 275]],
      },
    ],
  };
}

function keypointsDocument(): CocoDocument {
  return {
    info: baseInfo('keypoints'),
    licenses: baseLicenses(),
    categories: [
      {
        id: 1,
        name: 'person',
        supercategory: '',
        keypoints: ['nose', 'left_eye', 'right_eye'],
        skeleton: [[1, 2], [1, 3]],
      },
    ],
    images: demoImage(),
    annotations: [
      {
        id: 1,
        image_id: 1,
        category_id: 1,
        bbox: [200, 80, 160, 280],
        area: 44800,
        iscrowd: 0,
        ignore: 0,
        num_keypoints: 3,
        keypoints: [280, 120, 2, 260, 110, 2, 300, 110, 2],
      },
    ],
  };
}

function documentForFormat(format: CocoFormat): CocoDocument {
  switch (format) {
    case 'detection':
      return detectionDocument();
    case 'segmentation':
      return segmentationDocument();
    case 'keypoints':
      return keypointsDocument();
  }
}

function jsonFilename(format: CocoFormat): string {
  switch (format) {
    case 'detection':
      return 'coco_detection.json';
    case 'segmentation':
      return 'coco_instance_segmentation.json';
    case 'keypoints':
      return 'coco_keypoints.json';
  }
}

function buildSampleFiles(format: CocoFormat): Array<{ path: string; content: string }> {
  const doc = documentForFormat(format);
  const jsonName = jsonFilename(format);
  return [
    { path: 'README.txt', content: readmeForFormat(format) },
    { path: 'FORMAT_GUIDE.txt', content: formatGuideForFormat(format) },
    { path: jsonName, content: `${JSON.stringify(doc, null, 2)}\n` },
  ];
}

/** 下载 COCO 导入示例 zip（含说明文档与示例 JSON） */
export function downloadCocoImportSample(format: CocoFormat): void {
  downloadZip(`coco-${format}-import-example.zip`, buildSampleFiles(format));
}
