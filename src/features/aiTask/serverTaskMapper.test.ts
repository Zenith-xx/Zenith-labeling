import { describe, expect, it } from 'vitest';

import { applyServerTaskToLocal } from './serverTaskMapper';
import type { AiTaskRecord } from './types';
import type { ServerTask } from './serverTaskTypes';

function localTask(): AiTaskRecord {
  return {
    id: 'local-1',
    serverTaskId: 'server-1',
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
      completed: 8,
      success: 7,
      failed: 1,
      objects: 3,
      currentImageId: null,
      currentImageName: null,
    },
    createdAt: 1,
    updatedAt: 1,
    finishedAt: null,
    error: null,
  };
}

function serverTask(): ServerTask {
  return {
    task_id: 'server-1',
    device_id: '550e8400-e29b-41d4-a716-446655440000',
    model_name: 'best',
    status: 'running',
    total: 10,
    completed: 5,
    success: 4,
    failed: 1,
    progress: 0.5,
    created_at: 1,
    updated_at: 2,
    error: null,
    confidence: 0.25,
    iou: 0.45,
  };
}

describe('serverTaskMapper merge priority', () => {
  it('prefers server progress fields over local', () => {
    const merged = applyServerTaskToLocal(localTask(), serverTask());
    expect(merged.status).toBe('running');
    expect(merged.progress.completed).toBe(5);
    expect(merged.progress.success).toBe(4);
    expect(merged.progress.failed).toBe(1);
    expect(merged.progress.objects).toBe(3);
  });
});
