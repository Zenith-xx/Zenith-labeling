import type { AiTaskModelSnapshot, LegacyTaskModelSnapshot } from '../ai';
import { DEFAULT_INFERENCE_SESSION_CONFIG } from '../ai';
import type { AiTaskStatus } from './types-core';
import type { AiTaskRecord } from './types';

function isNestedSnapshot(value: unknown): value is AiTaskModelSnapshot {
  return (
    typeof value === 'object' &&
    value != null &&
    'model' in value &&
    typeof (value as AiTaskModelSnapshot).model === 'object' &&
    'id' in (value as AiTaskModelSnapshot).model
  );
}

function isLegacySnapshot(value: unknown): value is LegacyTaskModelSnapshot {
  return (
    typeof value === 'object' &&
    value != null &&
    'modelId' in value &&
    !('model' in value)
  );
}

function isFlatEnhancedSnapshot(
  value: unknown
): value is { id: string; name: string; fileName?: string; task?: string; classes?: string[]; version?: string; config: AiTaskModelSnapshot['config']; capturedAt?: number } {
  return (
    typeof value === 'object' &&
    value != null &&
    'id' in value &&
    'config' in value &&
    !('model' in value)
  );
}

export function migrateModelSnapshot(
  raw: unknown,
  task: Pick<AiTaskRecord, 'modelId' | 'modelName' | 'confidence' | 'iou'>
): AiTaskModelSnapshot {
  if (isNestedSnapshot(raw)) {
    return raw;
  }

  if (isFlatEnhancedSnapshot(raw)) {
    return {
      model: {
        id: raw.id,
        name: raw.name,
        fileName: raw.fileName ?? `${raw.id}.pt`,
        version: raw.version,
        task: (raw.task as AiTaskModelSnapshot['model']['task']) ?? 'detect',
        classes: raw.classes ?? [],
      },
      config: raw.config,
      capturedAt: raw.capturedAt ?? Date.now(),
    };
  }

  if (isLegacySnapshot(raw)) {
    return {
      model: {
        id: raw.modelId,
        name: raw.modelName,
        fileName: `${raw.modelId}.pt`,
        task: 'detect',
        classes: [],
      },
      config: {
        confidence: raw.confidence,
        iou: raw.iou,
        imgSize: raw.imgSize,
        device: raw.device,
      },
      capturedAt: Date.now(),
    };
  }

  return {
    model: {
      id: task.modelId,
      name: task.modelName,
      fileName: `${task.modelId}.pt`,
      task: 'detect',
      classes: [],
    },
    config: {
      confidence: task.confidence,
      iou: task.iou,
      imgSize: DEFAULT_INFERENCE_SESSION_CONFIG.imgSize,
      device: DEFAULT_INFERENCE_SESSION_CONFIG.device,
    },
    capturedAt: Date.now(),
  };
}

export function migrateTaskRecord(task: AiTaskRecord): AiTaskRecord {
  return {
    ...task,
    modelSnapshot: migrateModelSnapshot(task.modelSnapshot, task),
    modelId: isNestedSnapshot(task.modelSnapshot)
      ? task.modelSnapshot.model.id
      : task.modelId,
    modelName: isNestedSnapshot(task.modelSnapshot)
      ? task.modelSnapshot.model.name
      : task.modelName,
    confidence: isNestedSnapshot(task.modelSnapshot)
      ? task.modelSnapshot.config.confidence
      : task.confidence,
    iou: isNestedSnapshot(task.modelSnapshot)
      ? task.modelSnapshot.config.iou
      : task.iou,
  };
}

export function normalizePersistedTasks(
  tasks: AiTaskRecord[],
  activeTaskId: string | null
): { tasks: AiTaskRecord[]; activeTaskId: string | null } {
  const normalized = tasks.map((task) => {
    const migrated = migrateTaskRecord(task);
    return {
      ...migrated,
      status:
        migrated.status === 'running'
          ? ('paused' as AiTaskStatus)
          : migrated.status,
    };
  });
  return { tasks: normalized, activeTaskId };
}
