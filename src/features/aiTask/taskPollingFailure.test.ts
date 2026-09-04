/**
 * Phase 18: fetchTasks failure must preserve local tasks (polling network error).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiTaskRecord } from './types';
import { mergeServerTasksWithLocal } from './serverTaskSync';

const DEVICE_A = '550e8400-e29b-41d4-a716-446655440000';

describe('fetchTasks failure simulation', () => {
  it('merge path preserves local tasks when server list is unavailable', () => {
    const local: AiTaskRecord = {
      id: 'local-1',
      serverTaskId: 'server-1',
      deviceId: DEVICE_A,
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
      imageIds: ['img-1'],
      status: 'running',
      confidence: 0.25,
      iou: 0.45,
      concurrency: 4,
      replaceExisting: true,
      progress: {
        total: 10,
        completed: 3,
        success: 2,
        failed: 1,
        objects: 0,
        currentImageId: null,
        currentImageName: null,
      },
      createdAt: 1,
      updatedAt: 2,
      finishedAt: null,
      error: null,
    };

    // Simulates fetchTasks catch branch: no server tasks, keep detached local
    const afterFailure = mergeServerTasksWithLocal([local], [], DEVICE_A);
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0].status).toBe('running');
    expect(afterFailure[0].progress.completed).toBe(3);
  });
});
