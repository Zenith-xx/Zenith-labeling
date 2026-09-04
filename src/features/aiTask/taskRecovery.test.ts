import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/deviceId', () => ({
  getDeviceId: () => '550e8400-e29b-41d4-a716-446655440000',
}));

import type { AiTaskRecord } from './types';
import {
  evaluateTaskRecovery,
  getCompletedOffset,
  getRemainingImageCount,
  isRecoverableTaskStatus,
  isRefreshOrphanedRunningTask,
} from './taskRecovery';

const DEVICE_A = '550e8400-e29b-41d4-a716-446655440000';

function task(partial: Partial<AiTaskRecord> & Pick<AiTaskRecord, 'id'>): AiTaskRecord {
  return {
    id: partial.id,
    serverTaskId: partial.serverTaskId ?? 'server-1',
    deviceId: partial.deviceId ?? DEVICE_A,
    serverDetached: partial.serverDetached,
    modelId: 'best',
    modelName: 'best',
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
    imageIds: partial.imageIds ?? ['img-1', 'img-2', 'img-3'],
    status: partial.status ?? 'pending',
    confidence: 0.25,
    iou: 0.45,
    concurrency: 4,
    replaceExisting: true,
    progress: partial.progress ?? {
      total: 3,
      completed: 0,
      success: 0,
      failed: 0,
      objects: 0,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt: 1,
    updatedAt: 1,
    finishedAt: null,
    error: null,
  };
}

describe('taskRecovery', () => {
  it('identifies recoverable statuses', () => {
    expect(isRecoverableTaskStatus('pending')).toBe(true);
    expect(isRecoverableTaskStatus('paused')).toBe(true);
    expect(isRecoverableTaskStatus('running')).toBe(false);
    expect(isRecoverableTaskStatus('completed')).toBe(false);
  });

  it('computes remaining images from completed offset', () => {
    const record = task({
      id: 't1',
      progress: {
        total: 10,
        completed: 4,
        success: 3,
        failed: 1,
        objects: 0,
        currentImageId: null,
        currentImageName: null,
      },
      imageIds: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(getCompletedOffset(record, 5)).toBe(4);
    expect(getRemainingImageCount(record)).toBe(1);
  });

  it('allows continue for pending task with images', () => {
    const recovery = evaluateTaskRecovery(task({ id: 't1', status: 'pending' }));
    expect(recovery.canContinue).toBe(true);
    expect(recovery.canAbandon).toBe(true);
  });

  it('blocks continue for running task but allows refresh', () => {
    const recovery = evaluateTaskRecovery(task({ id: 't1', status: 'running' }));
    expect(recovery.canContinue).toBe(false);
    expect(recovery.canRefresh).toBe(true);
  });

  it('blocks continue for completed task', () => {
    const recovery = evaluateTaskRecovery(task({ id: 't1', status: 'completed' }));
    expect(recovery.canContinue).toBe(false);
    expect(recovery.canRefresh).toBe(false);
  });

  it('blocks detached tasks', () => {
    const recovery = evaluateTaskRecovery(
      task({ id: 't1', serverDetached: true, serverTaskId: null })
    );
    expect(recovery.canContinue).toBe(false);
    expect(recovery.message).toContain('解绑');
  });

  it('detects refresh-orphaned running tasks', () => {
    const orphaned = task({
      id: 't1',
      status: 'running',
      progress: {
        total: 10,
        completed: 2,
        success: 2,
        failed: 0,
        objects: 0,
        currentImageId: null,
        currentImageName: null,
      },
    });
    expect(isRefreshOrphanedRunningTask(orphaned)).toBe(true);
    expect(isRefreshOrphanedRunningTask({ ...orphaned, status: 'paused' })).toBe(
      false
    );
    expect(
      isRefreshOrphanedRunningTask({
        ...orphaned,
        progress: { ...orphaned.progress, completed: 10 },
      })
    ).toBe(false);
  });
});
