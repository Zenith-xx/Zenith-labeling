/**
 * Phase 18 integration tests: data consistency & lifecycle acceptance.
 * Not browser E2E — uses Vitest with mocked network/store boundaries.
 */
import { describe, expect, it, vi } from 'vitest';

import type { AiTaskRecord } from './types';
import { TASK_STALL_THRESHOLD_MS } from './types-core';
import { applyServerTaskToLocal } from './serverTaskMapper';
import {
  detachTasksForDeviceChange,
  mergeServerTasksWithLocal,
} from './serverTaskSync';
import { evaluateTaskRecovery, getCompletedOffset } from './taskRecovery';
import {
  getTaskDisplayKind,
  isTaskStalled,
  syncProgressTimestamp,
} from './taskDisplay';
import type { ServerTask } from './serverTaskTypes';

const DEVICE_A = '550e8400-e29b-41d4-a716-446655440000';
const DEVICE_B = '7c9e6679-7425-42c6-95d4-123456789abc';

vi.mock('../../utils/deviceId', () => ({
  getDeviceId: () => DEVICE_A,
}));

function localTask(
  partial: Partial<AiTaskRecord> & Pick<AiTaskRecord, 'id'>
): AiTaskRecord {
  return {
    id: partial.id,
    serverTaskId: partial.serverTaskId ?? 'server-1',
    deviceId: partial.deviceId ?? DEVICE_A,
    serverDetached: partial.serverDetached,
    modelId: 'best',
    modelName: 'best',
    modelSnapshot: {
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
    imageIds: partial.imageIds ?? ['img-0', 'img-1', 'img-2', 'img-3'],
    status: partial.status ?? 'running',
    confidence: 0.25,
    iou: 0.45,
    concurrency: 4,
    replaceExisting: true,
    progress: partial.progress ?? {
      total: 4,
      completed: 0,
      success: 0,
      failed: 0,
      objects: 2,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt: 1000,
    updatedAt: 2000,
    finishedAt: null,
    error: partial.error ?? null,
    lastProgressAt: partial.lastProgressAt,
    lastProgressCompleted: partial.lastProgressCompleted,
  };
}

function serverTask(
  partial: Partial<ServerTask> & Pick<ServerTask, 'task_id'>
): ServerTask {
  return {
    task_id: partial.task_id,
    device_id: partial.device_id ?? DEVICE_A,
    model_name: 'best',
    status: partial.status ?? 'completed',
    total: partial.total ?? 4,
    completed: partial.completed ?? 4,
    success: partial.success ?? 3,
    failed: partial.failed ?? 1,
    progress: partial.progress ?? 1.0,
    created_at: 1,
    updated_at: 99,
    error: partial.error ?? null,
    confidence: 0.25,
    iou: 0.45,
  };
}

describe('Phase 18 data consistency', () => {
  it('server terminal status overrides local running on merge', () => {
    const local = localTask({
      id: 'local-1',
      serverTaskId: 'server-1',
      status: 'running',
      progress: {
        total: 4,
        completed: 1,
        success: 1,
        failed: 0,
        objects: 5,
        currentImageId: null,
        currentImageName: null,
      },
    });
    const merged = mergeServerTasksWithLocal(
      [local],
      [serverTask({ task_id: 'server-1', status: 'completed' })],
      DEVICE_A
    );
    expect(merged[0].status).toBe('completed');
    expect(merged[0].progress.completed).toBe(4);
    expect(merged[0].progress.objects).toBe(5);
    expect(merged[0].imageIds).toEqual(local.imageIds);
  });

  it('completedOffset resumes from remaining images only', () => {
    const task = localTask({
      id: 't1',
      progress: {
        total: 4,
        completed: 2,
        success: 2,
        failed: 0,
        objects: 0,
        currentImageId: null,
        currentImageName: null,
      },
    });
    const offset = getCompletedOffset(task, task.imageIds.length);
    expect(offset).toBe(2);
    expect(task.imageIds.slice(offset)).toEqual(['img-2', 'img-3']);
  });

  it('device change detaches server binding and blocks continue', () => {
    const local = localTask({
      id: 'local-1',
      serverTaskId: 'server-a',
      deviceId: DEVICE_A,
    });
    const detached = detachTasksForDeviceChange([local], DEVICE_B);
    expect(detached[0].serverTaskId).toBeNull();
    expect(detached[0].serverDetached).toBe(true);
    const recovery = evaluateTaskRecovery(detached[0]);
    expect(recovery.canContinue).toBe(false);
  });

  it('stalled UI clears when progress advances', () => {
    const stalled = localTask({
      id: 't-stall',
      status: 'running',
      lastProgressAt: Date.now() - TASK_STALL_THRESHOLD_MS - 1000,
      lastProgressCompleted: 1,
      progress: {
        total: 10,
        completed: 1,
        success: 1,
        failed: 0,
        objects: 0,
        currentImageId: null,
        currentImageName: null,
      },
    });
    expect(isTaskStalled(stalled)).toBe(true);
    expect(getTaskDisplayKind(stalled)).toBe('stalled');

    const advanced = {
      ...stalled,
      progress: { ...stalled.progress, completed: 2 },
      ...syncProgressTimestamp(stalled, 2, Date.now()),
    };
    expect(isTaskStalled(advanced)).toBe(false);
    expect(getTaskDisplayKind(advanced)).toBe('running');
  });

  it('applyServerTaskToLocal never downgrades terminal server status', () => {
    const local = localTask({ id: 'l1', status: 'running' });
    const merged = applyServerTaskToLocal(
      local,
      serverTask({ task_id: 'server-1', status: 'cancelled', completed: 2, progress: 0.5 })
    );
    expect(merged.status).toBe('cancelled');
    expect(merged.progress.completed).toBe(2);
  });

  it('terminal tasks cannot continue', () => {
    expect(evaluateTaskRecovery(localTask({ id: 'c', status: 'completed' })).canContinue).toBe(
      false
    );
    expect(evaluateTaskRecovery(localTask({ id: 'f', status: 'failed' })).canContinue).toBe(
      false
    );
    expect(evaluateTaskRecovery(localTask({ id: 'x', status: 'cancelled' })).canContinue).toBe(
      false
    );
  });
});
