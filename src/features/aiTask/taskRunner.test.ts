import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiTaskRecord } from './types';
import { applyAutoLabelResult } from '../../services/autoLabel/applyAutoLabelResult';
import { predictBatchLabelingServer } from '../../services/autoLabel/labelingServerClient';
import {
  isAiTaskRunningLocally,
  hasInFlightBatch,
  runAiTask,
} from './taskRunner';
import { useAiTaskStore } from '@/store/useAiTaskStore';
import { useAiStore } from '@/store/useAiStore';
import { useAnnotationStore } from '@/store/useAnnotationStore';

vi.mock('../../services/autoLabel/resolveServerUrl', () => ({
  resolveLabelingServerUrl: vi.fn(async (url: string) => url),
}));

vi.mock('../../services/autoLabel/labelingServerTaskApi', () => ({
  createTask: vi.fn(async () => ({ task_id: 'server-task-1' })),
  startTask: vi.fn(async () => ({})),
}));

vi.mock('../../services/autoLabel/labelingServerClient', () => ({
  inferenceContextToPredictParams: vi.fn(() => ({})),
  predictBatchLabelingServer: vi.fn(async () => ({
    model: 'best',
    task: 'hbb',
    export_formats: ['pt'],
    count: 1,
    results: [
      {
        imageName: 'img.jpg',
        image_width: 1,
        image_height: 1,
        shapes: [],
        detections: [],
        error: null,
      },
    ],
  })),
}));

vi.mock('../../services/autoLabel/imageEncode', () => ({
  imageFileToUploadFile: vi.fn(async () => new File(['x'], 'img.jpg')),
}));

vi.mock('../../services/autoLabel/applyAutoLabelResult', () => ({
  applyAutoLabelResult: vi.fn(() => 0),
}));

vi.mock('../../services/autoLabel/detectionConverter', () => ({
  predictionToRemoteShapes: vi.fn(() => []),
}));

function baseTask(partial: Partial<AiTaskRecord> & Pick<AiTaskRecord, 'id'>): AiTaskRecord {
  return {
    id: partial.id,
    serverTaskId: partial.serverTaskId ?? 'server-task-1',
    deviceId: partial.deviceId ?? '550e8400-e29b-41d4-a716-446655440000',
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
    imageIds: partial.imageIds ?? ['img-1'],
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
    createdAt: 1,
    updatedAt: 1,
    finishedAt: partial.finishedAt ?? null,
    error: partial.error ?? null,
  };
}

describe('taskRunner reliability', () => {
  beforeEach(() => {
    vi.mocked(applyAutoLabelResult).mockReturnValue(0);
  });

  afterEach(() => {
    useAiTaskStore.setState({
      tasks: [],
      activeTaskId: null,
      loading: false,
      error: null,
      syncError: null,
    });
    useAiStore.setState({ serverUrl: 'http://localhost:8000', timeoutSec: 60 });
    useAnnotationStore.setState({
      imageList: [
        {
          id: 'img-1',
          name: 'img.jpg',
          url: 'blob:img',
          width: 1,
          height: 1,
        },
      ],
    });
    vi.clearAllMocks();
    vi.mocked(applyAutoLabelResult).mockReturnValue(0);
  });

  it('does not run terminal tasks', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1', status: 'completed' })],
    });
    const result = await runAiTask('local-1');
    expect(result.processed).toBe(0);
    expect(isAiTaskRunningLocally('local-1')).toBe(false);
  });

  it('prevents duplicate concurrent runAiTask', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1' })],
    });
    const first = runAiTask('local-1');
    expect(isAiTaskRunningLocally('local-1')).toBe(true);
    const second = runAiTask('local-1');
    expect(second).toBe(first);
    await first;
    expect(isAiTaskRunningLocally('local-1')).toBe(false);
  });

  it('tracks in-flight batch by serverTaskId during execution', async () => {
    vi.mocked(predictBatchLabelingServer).mockClear();
    vi.mocked(predictBatchLabelingServer).mockImplementation(async () => {
      expect(hasInFlightBatch('server-task-1')).toBe(true);
      return {
        model: 'best',
        task: 'hbb',
        export_formats: ['pt'],
        count: 1,
        results: [
          {
            imageName: 'img.jpg',
            image_width: 1,
            image_height: 1,
            shapes: [],
            detections: [],
            error: null,
          },
        ],
      };
    });

    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1' })],
    });
    await runAiTask('local-1');
    expect(hasInFlightBatch('server-task-1')).toBe(false);
    expect(predictBatchLabelingServer).toHaveBeenCalled();
  });
});
