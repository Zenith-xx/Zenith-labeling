import { describe, expect, it } from 'vitest';

import { TASK_STALL_THRESHOLD_MS } from './types-core';
import type { AiTaskRecord } from './types';
import {
  canDeleteTask,
  getTaskDisplayKind,
  getTaskDisplayLabel,
  isTaskStalled,
  syncProgressTimestamp,
} from './taskDisplay';

function task(
  partial: Partial<AiTaskRecord> & Pick<AiTaskRecord, 'id'>
): AiTaskRecord {
  const now = 1_000_000;
  return {
    id: partial.id,
    serverTaskId: partial.serverTaskId ?? 'server-1',
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
    imageIds: ['a', 'b'],
    status: partial.status ?? 'running',
    confidence: 0.25,
    iou: 0.45,
    concurrency: 4,
    replaceExisting: true,
    progress: partial.progress ?? {
      total: 10,
      completed: 3,
      success: 2,
      failed: 1,
      objects: 0,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
    finishedAt: null,
    error: null,
    lastProgressAt: partial.lastProgressAt,
    lastProgressCompleted: partial.lastProgressCompleted,
  };
}

describe('taskDisplay', () => {
  it('detects stalled running task', () => {
    const stalled = task({
      id: 't1',
      status: 'running',
      lastProgressAt: Date.now() - TASK_STALL_THRESHOLD_MS - 1000,
      lastProgressCompleted: 2,
    });
    expect(isTaskStalled(stalled)).toBe(true);
    expect(getTaskDisplayKind(stalled)).toBe('stalled');
    expect(getTaskDisplayLabel(stalled)).toBe('长时间无进度');
  });

  it('does not mark running as stalled when progress recently updated', () => {
    const active = task({
      id: 't2',
      status: 'running',
      lastProgressAt: Date.now() - 1000,
      lastProgressCompleted: 2,
    });
    expect(isTaskStalled(active)).toBe(false);
    expect(getTaskDisplayLabel(active)).toBe('运行中');
  });

  it('does not mark completed as stalled', () => {
    const done = task({ id: 't3', status: 'completed' });
    expect(isTaskStalled(done)).toBe(false);
    expect(canDeleteTask(done)).toBe(true);
  });

  it('syncProgressTimestamp updates only when completed grows', () => {
    const base = task({ id: 't4', lastProgressAt: 100, lastProgressCompleted: 2 });
    const same = syncProgressTimestamp(base, 2, 200);
    expect(same.lastProgressAt).toBe(100);
    const grown = syncProgressTimestamp(base, 5, 300);
    expect(grown.lastProgressAt).toBe(300);
    expect(grown.lastProgressCompleted).toBe(5);
  });

  it('canDeleteTask only allows terminal statuses', () => {
    expect(canDeleteTask(task({ id: 'a', status: 'running' }))).toBe(false);
    expect(canDeleteTask(task({ id: 'b', status: 'paused' }))).toBe(false);
    expect(canDeleteTask(task({ id: 'c', status: 'failed' }))).toBe(true);
  });
});
