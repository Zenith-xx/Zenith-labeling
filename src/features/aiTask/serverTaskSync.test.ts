import { describe, expect, it } from 'vitest';

import type { AiTaskRecord } from './types';
import {
  detachTasksForDeviceChange,
  mergeServerTasksWithLocal,
  resolveDuplicateServerBindings,
} from './serverTaskSync';
import type { ServerTask } from './serverTaskTypes';

const DEVICE_A = '550e8400-e29b-41d4-a716-446655440000';
const DEVICE_B = '7c9e6679-7425-42c6-95d4-123456789abc';

function localTask(
  partial: Partial<AiTaskRecord> & Pick<AiTaskRecord, 'id'>
): AiTaskRecord {
  return {
    id: partial.id,
    serverTaskId: partial.serverTaskId ?? null,
    deviceId: partial.deviceId,
    modelId: partial.modelId ?? 'best',
    modelName: partial.modelName ?? 'best',
    modelSnapshot: partial.modelSnapshot ?? {
      model: {
        id: 'best',
        name: 'best',
        fileName: 'best.pt',
        task: 'detect',
        classes: [],
      },
      config: { confidence: 0.25, iou: 0.45, imgSize: 640, device: 'auto' },
      capturedAt: 1,
    },
    imageScope: 'all',
    imageIds: ['img-1'],
    status: partial.status ?? 'pending',
    confidence: 0.25,
    iou: 0.45,
    concurrency: 4,
    replaceExisting: true,
    progress: partial.progress ?? {
      total: 1,
      completed: 0,
      success: 0,
      failed: 0,
      objects: 0,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt: partial.createdAt ?? 1000,
    updatedAt: partial.updatedAt ?? 1000,
    finishedAt: partial.finishedAt ?? null,
    error: partial.error ?? null,
  };
}

function serverTask(partial: Partial<ServerTask> & Pick<ServerTask, 'task_id'>): ServerTask {
  return {
    task_id: partial.task_id,
    device_id: partial.device_id ?? DEVICE_A,
    model_name: partial.model_name ?? 'best',
    status: partial.status ?? 'running',
    total: partial.total ?? 10,
    completed: partial.completed ?? 2,
    success: partial.success ?? 1,
    failed: partial.failed ?? 1,
    progress: partial.progress ?? 0.2,
    created_at: partial.created_at ?? 1,
    updated_at: partial.updated_at ?? 2,
    error: partial.error ?? null,
    confidence: partial.confidence ?? 0.25,
    iou: partial.iou ?? 0.45,
  };
}

describe('serverTaskSync', () => {
  it('merges server status into matching local task', () => {
    const local = localTask({
      id: 'local-1',
      serverTaskId: 'server-1',
      deviceId: DEVICE_A,
      status: 'running',
    });
    const merged = mergeServerTasksWithLocal(
      [local],
      [serverTask({ task_id: 'server-1', status: 'cancelled' })],
      DEVICE_A
    );
    expect(merged[0].status).toBe('cancelled');
    expect(merged[0].serverTaskId).toBe('server-1');
  });

  it('includes server-only tasks for current device', () => {
    const merged = mergeServerTasksWithLocal(
      [],
      [serverTask({ task_id: 'server-only', device_id: DEVICE_A })],
      DEVICE_A
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('server-only');
  });

  it('detaches server link when device id changes', () => {
    const local = localTask({
      id: 'local-1',
      serverTaskId: 'server-1',
      deviceId: DEVICE_A,
    });
    const detached = detachTasksForDeviceChange([local], DEVICE_B);
    expect(detached[0].serverTaskId).toBeNull();
    expect(detached[0].serverDetached).toBe(true);
    expect(detached[0].deviceId).toBe(DEVICE_B);
  });

  it('marks duplicate serverTaskId bindings as detached', () => {
    const older = localTask({
      id: 'local-old',
      serverTaskId: 'server-1',
      updatedAt: 100,
    });
    const newer = localTask({
      id: 'local-new',
      serverTaskId: 'server-1',
      updatedAt: 200,
    });
    const resolved = resolveDuplicateServerBindings([older, newer]);
    const oldTask = resolved.find((task) => task.id === 'local-old');
    const newTask = resolved.find((task) => task.id === 'local-new');
    expect(oldTask?.serverTaskId).toBeNull();
    expect(oldTask?.serverDetached).toBe(true);
    expect(newTask?.serverTaskId).toBe('server-1');
  });
});
