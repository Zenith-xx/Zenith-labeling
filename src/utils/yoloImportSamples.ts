import type { YoloFormat } from '../types';
import { downloadZip } from './downloadFile';

const README = `YOLO 导入示例包
================

使用步骤（与本工具上传弹窗一致）：

1. 解压后，在「选择标签文件」步骤选择：
   - HBB / OBB / Seg：classes.txt
   - Pose：pose_classes.yaml

2. 在「选择 labels 文件夹」步骤，选择本包内的 labels 文件夹
   （其中 demo.txt 对应项目里的 demo.jpg）

说明：
- 行首 # 为注释，导入时会自动忽略
- 标注 txt 文件名须与图片 basename 相同（不含扩展名）
- 坐标均为相对图片宽高的归一化值（0~1）
`;

function hbbClassesTxt(): string {
  return `# YOLO 类别文件：每行一个类别名
# 行号从 0 开始作为 class_id（0=person, 1=car, 2=bike）
# 以 # 开头的行为注释，导入时自动忽略

person
car
bike
`;
}

function hbbDemoTxt(): string {
  return `# YOLO HBB 标注格式（每行一个目标）
# class_id  x_center  y_center  width  height
# 均为相对图片宽高的归一化坐标（0~1）
#
# 本文件对应图片：demo.jpg（请确保项目中有同名图片）

# person：画面左侧
0 0.35 0.45 0.18 0.42

# car：画面右侧
1 0.72 0.55 0.22 0.28
`;
}

function obbClassesTxt(): string {
  return `# OBB 类别文件（格式同 HBB）
# 0=ship, 1=vehicle

ship
vehicle
`;
}

function obbDemoTxt(): string {
  return `# YOLO OBB 标注（四角点格式，推荐）
# class_id  x1 y1  x2 y2  x3 y3  x4 y4
# 四个顶点按顺序排列，坐标归一化到 0~1
#
# 也支持 6 列格式：class xc yc w h angle（angle 为弧度）

# ship：旋转目标
0 0.12 0.20 0.45 0.18 0.48 0.55 0.15 0.58
`;
}

function segClassesTxt(): string {
  return `# 实例分割类别
# 0=defect, 1=scratch

defect
scratch
`;
}

function segDemoTxt(): string {
  return `# YOLO Seg 标注（多边形顶点）
# class_id  x1 y1  x2 y2  x3 y3 ...
# 至少 3 个顶点（6 个数值），坐标归一化

# defect：四边形区域
0 0.30 0.40 0.55 0.38 0.58 0.62 0.28 0.65
`;
}

function poseYaml(): string {
  return `# YOLO Pose 配置文件（yaml）
# has_visible: 关键点是否包含可见性字段（v）
# classes: 类别名 → 关键点名称列表（顺序须与标注文件一致）

has_visible: true
classes:
  person:
    - nose
    - left_eye
    - right_eye
`;
}

function poseDemoTxt(): string {
  return `# YOLO Pose 标注
# class_id  xc yc w h  kpt1_x kpt1_y kpt1_v  kpt2_x ...
# bbox 与 HBB 相同；每个关键点 3 个数：x, y, visibility
# visibility: 0=未标注, 1=遮挡, 2=可见
#
# 下方示例为 1 个 person，含 3 个关键点（nose / left_eye / right_eye）

0 0.50 0.50 0.30 0.60 0.50 0.35 2 0.45 0.32 2 0.55 0.32 2
`;
}

function buildSampleFiles(format: YoloFormat): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [
    { path: 'README.txt', content: README },
  ];

  switch (format) {
    case 'hbb':
      files.push(
        { path: 'classes.txt', content: hbbClassesTxt() },
        { path: 'labels/demo.txt', content: hbbDemoTxt() }
      );
      break;
    case 'obb':
      files.push(
        { path: 'classes.txt', content: obbClassesTxt() },
        { path: 'labels/demo.txt', content: obbDemoTxt() }
      );
      break;
    case 'seg':
      files.push(
        { path: 'classes.txt', content: segClassesTxt() },
        { path: 'labels/demo.txt', content: segDemoTxt() }
      );
      break;
    case 'pose':
      files.push(
        { path: 'pose_classes.yaml', content: poseYaml() },
        { path: 'labels/demo.txt', content: poseDemoTxt() }
      );
      break;
  }

  return files;
}

/** 下载 YOLO 导入示例 zip（含注释的类别文件与 labels/demo.txt） */
export function downloadYoloImportSample(format: YoloFormat): void {
  downloadZip(`yolo-${format}-import-example.zip`, buildSampleFiles(format));
}
