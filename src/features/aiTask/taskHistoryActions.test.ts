import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../utils/deviceId', () => ({
  getDeviceId: () => '550e8400-e29b-41d4-a716-446655440000',
}));

const runningLocally = vi.hoisted(() => new Set<string>());

vi.mock('./taskRunner', () => ({
  isAiTaskRunningLocally: (taskId: string) => runningLocally.has(taskId),
  hasInFlightBatch: () => false,
}));

import type { AiTaskRecord } from './types';
import { getTaskHistoryActions } from './taskHistoryActions';

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

beforeEach(() => {
  runningLocally.clear();
});

describe('getTaskHistoryActions', () => {
  it('Case 1: pending + remaining shows continue', () => {
    const actions = getTaskHistoryActions(task({ id: 't1', status: 'pending' }));
    expect(actions.showContinue).toBe(true);
    expect(actions.showRefreshStatus).toBe(false);
  });

  it('Case 2: paused + remaining shows continue', () => {
    const actions = getTaskHistoryActions(
      task({
        id: 't1',
        status: 'paused',
        progress: {
          total: 3,
          completed: 1,
          success: 1,
          failed: 0,
          objects: 0,
          currentImageId: null,
          currentImageName: null,
        },
      })
    );
    expect(actions.showContinue).toBe(true);
    expect(actions.showRefreshStatus).toBe(false);
  });

  it('Case 3: running + server running shows refresh, not continue', () => {
    const actions = getTaskHistoryActions(task({ id: 't1', status: 'running' }));
    expect(actions.showContinue).toBe(true);
    expect(actions.showRefreshStatus).toBe(false);
    expect(actions.runningHint).toContain('刷新');
  });

  it('Case 4: completed does not show continue', () => {
    const actions = getTaskHistoryActions(
      task({
        id: 't1',
        status: 'completed',
        progress: {
          total: 3,
          completed: 3,
          success: 3,
          failed: 0,
          objects: 0,
          currentImageId: null,
          currentImageName: null,
        },
      })
    );
    expect(actions.showContinue).toBe(false);
    expect(actions.showRefreshStatus).toBe(false);
  });

  it('Case 5: cancelled does not show continue', () => {
    const actions = getTaskHistoryActions(task({ id: 't1', status: 'cancelled' }));
    expect(actions.showContinue).toBe(false);
    expect(actions.showRefreshStatus).toBe(false);
  });

  it('Case 6: failed follows recovery (no continue)', () => {
    const actions = getTaskHistoryActions(task({ id: 't1', status: 'failed' }));
    expect(actions.showContinue).toBe(false);
    expect(actions.recovery.canContinue).toBe(false);
  });

  it('Case 7: hides continue while task runs locally', () => {
    runningLocally.add('t1');
    const actions = getTaskHistoryActions(task({ id: 't1', status: 'paused' }));
    expect(actions.showContinue).toBe(false);
    expect(actions.recovery.canContinue).toBe(true);
  });
});
