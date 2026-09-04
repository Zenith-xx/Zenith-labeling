import { getNextLabelColor } from '../constants/labelColors';
import type { Label } from '../types';
import { generateId } from './id';

/** YOLO/COCO 可见关键点可见性值 */
const KEYPOINT_VISIBLE = 2;

/** 与 Ultralytics YOLO-Pose 一致的配置结构 */
export interface PoseConfig {
  hasVisible: boolean;
  classes: Record<string, string[]>;
}

const COCO_PERSON_KEYPOINTS = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export const DEFAULT_POSE_CONFIG: PoseConfig = {
  hasVisible: true,
  classes: {
    person: [...COCO_PERSON_KEYPOINTS],
  },
};

export function parsePoseConfigYaml(content: string): PoseConfig {
  const lines = content.split(/\r?\n/);
  let hasVisible = true;
  const classes: Record<string, string[]> = {};
  let inClasses = false;
  let currentClass: string | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const visibleMatch = trimmed.match(/^has_visible:\s*(true|false)\s*$/i);
    if (visibleMatch) {
      hasVisible = visibleMatch[1].toLowerCase() === 'true';
      continue;
    }

    if (/^classes:\s*$/i.test(trimmed)) {
      inClasses = true;
      continue;
    }

    if (!inClasses) continue;

    const classMatch = raw.match(/^ {2}([\w-]+):\s*$/);
    if (classMatch) {
      currentClass = classMatch[1];
      classes[currentClass] = [];
      continue;
    }

    const kptMatch = raw.match(/^ {4}- (.+)$/);
    if (kptMatch && currentClass) {
      classes[currentClass].push(kptMatch[1].trim());
    }
  }

  if (Object.keys(classes).length === 0) {
    throw new Error('无效的 Pose 配置：缺少 classes 定义');
  }

  for (const [name, kpts] of Object.entries(classes)) {
    if (!kpts.length) {
      throw new Error(`无效的 Pose 配置：类别「${name}」未定义关键点`);
    }
  }

  return { hasVisible, classes };
}

export function poseConfigToYaml(config: PoseConfig): string {
  const lines = [`has_visible: ${config.hasVisible}`, 'classes:'];
  for (const [className, keypoints] of Object.entries(config.classes)) {
    lines.push(`  ${className}:`);
    for (const name of keypoints) {
      lines.push(`    - ${name}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function getPoseClassNames(config: PoseConfig): string[] {
  return Object.keys(config.classes);
}

/** YOLO Pose 导入：类别名 + 全部关键点名（去重，用于标签管理） */
export function getPoseImportLabelNames(config: PoseConfig): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const className of getPoseClassNames(config)) {
    if (!seen.has(className)) {
      seen.add(className);
      names.push(className);
    }
    for (const keypointName of getKeypointNamesForClass(config, className)) {
      if (!seen.has(keypointName)) {
        seen.add(keypointName);
        names.push(keypointName);
      }
    }
  }
  return names;
}

export function getKeypointNamesForClass(config: PoseConfig, className: string): string[] {
  return config.classes[className] ?? [];
}

export function getKeypointCountForClass(config: PoseConfig, className: string): number {
  return getKeypointNamesForClass(config, className).length;
}

/** 标签名对应关键点序号（0-based），未匹配返回 -1 */
export function getKeypointIndexForLabelName(
  config: PoseConfig,
  className: string,
  labelName: string
): number {
  return getKeypointNamesForClass(config, className).indexOf(labelName);
}

/** 从标注绑定的标签解析 Pose 类别名 */
export function resolvePoseClassNameForTarget(
  config: PoseConfig,
  labelName: string | undefined
): string {
  const classNames = getPoseClassNames(config);
  if (labelName && config.classes[labelName]) return labelName;
  if (labelName) {
    const exact = classNames.find((name) => name === labelName);
    if (exact) return exact;
    for (const className of classNames) {
      if (config.classes[className]?.includes(labelName)) {
        return className;
      }
    }
  }
  return classNames[0] ?? 'person';
}

/** 合并已有标签与 Pose 配置类别，保留已有标签 id（与 YOLO 类别顺序一致） */
export function mergePoseLabels(
  existingLabels: readonly Label[],
  poseConfig: PoseConfig
): Label[] {
  const byName = new Map(existingLabels.map((label) => [label.name, label]));
  const classNames = getPoseClassNames(poseConfig);
  const merged: Label[] = [];
  const used = new Set<string>();

  for (let index = 0; index < classNames.length; index++) {
    const className = classNames[index];
    const current = byName.get(className);
    if (current) {
      merged.push(current);
    } else {
      merged.push({
        id: `pose-class-${className}`,
        name: className,
        color: getNextLabelColor(index),
      });
    }
    used.add(className);
  }

  let keypointColorIndex = classNames.length;
  for (const className of classNames) {
    for (const keypointName of getKeypointNamesForClass(poseConfig, className)) {
      if (used.has(keypointName)) continue;
      const current = byName.get(keypointName);
      if (current) {
        merged.push(current);
      } else {
        merged.push({
          id: generateId(),
          name: keypointName,
          color: getNextLabelColor(keypointColorIndex++),
        });
      }
      used.add(keypointName);
    }
  }

  for (const label of existingLabels) {
    if (!used.has(label.name)) {
      merged.push(label);
    }
  }

  return merged;
}

/** 标签名解析为关键点序号：先按目标类别，再全局匹配关键点名（忽略大小写） */
export function resolveKeypointIndexFromLabelName(
  config: PoseConfig,
  className: string,
  labelName: string
): number {
  const direct = getKeypointIndexForLabelName(config, className, labelName);
  if (direct >= 0) return direct;

  const normalized = labelName.trim().toLowerCase();
  if (!normalized) return -1;

  const classKeypoints = getKeypointNamesForClass(config, className);
  const classIndex = classKeypoints.findIndex(
    (name) => name.toLowerCase() === normalized
  );
  if (classIndex >= 0) return classIndex;

  for (const keypointNames of Object.values(config.classes)) {
    const index = keypointNames.findIndex(
      (name) => name.toLowerCase() === normalized
    );
    if (index >= 0) return index;
  }

  return -1;
}

export function getMaxKeypointCount(config: PoseConfig): number {
  return Math.max(0, ...Object.values(config.classes).map((kpts) => kpts.length));
}

export function getKeypointStride(config: PoseConfig): number {
  return config.hasVisible ? 3 : 2;
}

export function createEmptyKeypointsForClass(
  config: PoseConfig,
  className: string
): number[] {
  const count = getKeypointCountForClass(config, className);
  const keypoints: number[] = [];
  for (let i = 0; i < count; i++) {
    keypoints.push(0, 0, 0);
  }
  return keypoints;
}

export function createEmptyKeypointsForPlacement(config: PoseConfig): number[] {
  const count = getMaxKeypointCount(config);
  const keypoints: number[] = [];
  for (let i = 0; i < count; i++) {
    keypoints.push(0, 0, 0);
  }
  return keypoints;
}

export function labelsFromPoseConfig(config: PoseConfig): Label[] {
  return mergePoseLabels([], config);
}

export function resolvePoseClassName(config: PoseConfig, classIndex: number): string | null {
  const names = getPoseClassNames(config);
  return names[classIndex] ?? null;
}

export function getClassIndexForName(config: PoseConfig, className: string): number {
  return getPoseClassNames(config).indexOf(className);
}

/** 与 Ultralytics 一致：保留 6 位小数的归一化值 */
export function formatYoloExportNumber(value: number): string {
  return (Math.round(value * 1_000_000) / 1_000_000).toFixed(6);
}

/** YOLO Pose 导出关键点：先取整像素再归一化 */
export function formatYoloKeypointCoord(pixel: number, imageSize: number): string {
  if (imageSize <= 0) return '0.000000';
  return formatYoloExportNumber(Math.trunc(pixel) / imageSize);
}

/** 将 YOLO 行中的关键点坐标按配置类别长度截断/补齐为内部 [x,y,v,...] */
export function yoloCoordsToKeypointsForClass(
  coords: number[],
  config: PoseConfig,
  className: string,
  imageWidth: number,
  imageHeight: number,
  clamp = false
): number[] {
  const names = getKeypointNamesForClass(config, className);
  const stride = getKeypointStride(config);
  const keypoints: number[] = [];

  for (let i = 0; i < names.length; i++) {
    const offset = i * stride;
    if (offset + stride - 1 >= coords.length) {
      keypoints.push(0, 0, 0);
      continue;
    }
    const nx = coords[offset];
    const ny = coords[offset + 1];
    const v = config.hasVisible ? Math.trunc(coords[offset + 2] ?? 0) : KEYPOINT_VISIBLE;
    if ((nx === 0 && ny === 0) || v <= 0) {
      keypoints.push(0, 0, v);
      continue;
    }
    let x = nx * imageWidth;
    let y = ny * imageHeight;
    if (clamp && imageWidth > 0 && imageHeight > 0) {
      x = Math.max(0, Math.min(x, imageWidth));
      y = Math.max(0, Math.min(y, imageHeight));
    }
    keypoints.push(x, y, v);
  }

  return keypoints;
}

/** 内部关键点 → YOLO 行坐标（按类别顺序，末尾补零到 maxKeypoints） */
export function keypointsToYoloCoordsForClass(
  keypoints: number[],
  config: PoseConfig,
  className: string,
  imageWidth: number,
  imageHeight: number,
  clamp = false
): string[] {
  const names = getKeypointNamesForClass(config, className);
  const maxCount = getMaxKeypointCount(config);
  const stride = getKeypointStride(config);
  const nums: string[] = [];

  const pointByIndex = new Map<number, { x: number; y: number; v: number }>();
  for (let i = 0; i < keypoints.length; i += 3) {
    pointByIndex.set(i / 3, {
      x: keypoints[i],
      y: keypoints[i + 1],
      v: keypoints[i + 2] ?? 0,
    });
  }

  for (let i = 0; i < maxCount; i++) {
    if (i >= names.length) {
      if (config.hasVisible) nums.push('0', '0', '0');
      else nums.push('0', '0');
      continue;
    }

    const pt = pointByIndex.get(i);
    const v = pt?.v ?? 0;
    if (!pt || v <= 0) {
      if (config.hasVisible) nums.push('0', '0', '0');
      else nums.push('0', '0');
      continue;
    }

    let x = pt.x;
    let y = pt.y;
    if (clamp && imageWidth > 0 && imageHeight > 0) {
      x = Math.max(0, Math.min(x, imageWidth));
      y = Math.max(0, Math.min(y, imageHeight));
    }
    nums.push(formatYoloKeypointCoord(x, imageWidth));
    nums.push(formatYoloKeypointCoord(y, imageHeight));
    if (config.hasVisible) nums.push(String(Math.trunc(v)));
  }

  return nums;
}
