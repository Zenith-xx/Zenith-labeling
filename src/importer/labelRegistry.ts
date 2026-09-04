import { getNextLabelColor } from '../constants/labelColors';
import { CreateLabelCommand } from '../history/commands/CreateLabelCommand';
import { recordTransactionCommand } from '../history/transaction';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import type { Label } from '../types';
import { generateId } from '../utils/id';

/** JSON 标注文件结构（LabelMe / Labeling-vue3 兼容） */
export interface ProjectJson {
  image?: string;
  imagePath?: string;
  labels?: Label[];
  annotations?: Array<{
    labelName?: string;
    labelId?: string;
    labelColor?: string;
  }>;
  shapes?: Array<{
    label?: string;
  }>;
}

/** 从 JSON 标注数据中提取所有标签名（自动去重） */
export function extractLabelsFromAnnotations(data: ProjectJson): Set<string> {
  const names = new Set<string>();

  if (Array.isArray(data.labels)) {
    for (const label of data.labels) {
      const name = label?.name?.trim();
      if (name) names.add(name);
    }
  }

  if (Array.isArray(data.annotations)) {
    for (const raw of data.annotations) {
      const name = raw.labelName?.trim();
      if (name) names.add(name);
    }
  }

  if (Array.isArray(data.shapes)) {
    for (const shape of data.shapes) {
      const name = shape.label?.trim();
      if (name) names.add(name);
    }
  }

  return names;
}

/** O(1) 标签查询表，导入过程中共享 */
export class LabelRegistry {
  readonly byName: Map<string, Label>;
  private colorIndex: number;

  constructor(existingLabels: readonly Label[] = []) {
    this.byName = new Map();
    for (const label of existingLabels) {
      this.byName.set(label.name, label);
    }
    this.colorIndex = existingLabels.length;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  getByName(name: string): Label | undefined {
    return this.byName.get(name);
  }

  getLabelId(name: string): string {
    const label = this.byName.get(name);
    if (!label) {
      throw new Error(`[LabelRegistry] label not synced: ${name}`);
    }
    return label.id;
  }

  register(label: Label): void {
    this.byName.set(label.name, label);
  }

  createLabel(name: string, id?: string, color?: string): Label {
    const label: Label = {
      id: id ?? generateId(),
      name,
      color: color ?? getNextLabelColor(this.colorIndex++),
    };
    this.byName.set(name, label);
    return label;
  }

  getAllLabels(): Label[] {
    return Array.from(this.byName.values());
  }
}

export interface SyncImportedLabelsResult {
  /** 本次传入的新发现名称数（去重后） */
  inputCount: number;
  /** 本次新创建的标签数 */
  newlyCreatedCount: number;
  newlyCreatedNames: string[];
}

export interface SyncImportedLabelsOptions {
  useTransaction?: boolean;
}

export function syncImportedLabels(
  discoveredNames: Iterable<string>,
  registry: LabelRegistry,
  options?: SyncImportedLabelsOptions
): SyncImportedLabelsResult {
  let inputCount = 0;
  let newlyCreatedCount = 0;
  const newlyCreatedNames: string[] = [];
  const seen = new Set<string>();

  for (const rawName of discoveredNames) {
    const name = rawName.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    inputCount += 1;

    if (registry.has(name)) continue;

    const label = registry.createLabel(name);
    newlyCreatedCount += 1;
    newlyCreatedNames.push(name);

    if (options?.useTransaction) {
      recordTransactionCommand(new CreateLabelCommand(label));
    } else {
      useAnnotationStore.getState().addLabel(label);
    }
  }

  return { inputCount, newlyCreatedCount, newlyCreatedNames };
}

/** 注册 JSON 内嵌 labels 数组（保留 id/color） */
export function registerLabelsFromJson(
  data: ProjectJson,
  registry: LabelRegistry,
  options?: SyncImportedLabelsOptions
): number {
  if (!Array.isArray(data.labels)) return 0;

  let created = 0;
  for (const label of data.labels) {
    if (!label?.id || !label?.name) continue;
    const name = label.name.trim();
    if (!name || registry.has(name)) continue;

    const createdLabel = registry.createLabel(name, label.id, label.color);
    created += 1;

    if (options?.useTransaction) {
      recordTransactionCommand(new CreateLabelCommand(createdLabel));
    } else {
      useAnnotationStore.getState().addLabel(createdLabel);
    }
  }

  return created;
}
