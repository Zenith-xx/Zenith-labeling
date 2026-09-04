import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/deviceId', () => ({
  getDeviceId: () => '550e8400-e29b-41d4-a716-446655440000',
}));

import type { AiTaskRecord } from './types';
import { applyAutoLabelResult } from '../../services/autoLabel/applyAutoLabelResult';
import { predictBatchLabelingServer } from '../../services/autoLabel/labelingServerClient';
import {
  continueAiTask,
  isAiTaskRunningLocally,
  runAiTask,
} from './taskRunner';
import { useAiTaskStore } from '@/store/useAiTaskStore';
import { useAiStore } from '@/store/useAiStore';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import * as taskRecovery from './taskRecovery';

vi.mock('../../services/autoLabel/resolveServerUrl', () => ({
  resolveLabelingServerUrl: vi.fn(async (url: string) => url),
}));

vi.mock('../../services/autoLabel/labelingServerTaskApi', () => ({
  createTask: vi.fn(async () => ({ task_id: 'server-task-1' })),
  startTask: vi.fn(async () => ({ status: 'running' })),
  resumeTask: vi.fn(async () => ({ status: 'running' })),
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

vi.mock('../modelCenter/modelApi', () => ({
  fetchModelList: vi.fn(async () => ({
    models: [{ id: 'best', name: 'best' }],
    defaultModelId: 'best',
  })),
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

describe('continueAiTask', () => {
  beforeEach(() => {
    vi.mocked(applyAutoLabelResult).mockReturnValue(0);
    vi.spyOn(taskRecovery, 'validateTaskModelAvailable').mockResolvedValue(true);
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
    vi.spyOn(taskRecovery, 'validateTaskModelAvailable').mockResolvedValue(true);
  });

  it('does not auto-run on refresh - continue is explicit', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1', status: 'pending' })],
    });
    expect(isAiTaskRunningLocally('local-1')).toBe(false);
    expect(predictBatchLabelingServer).not.toHaveBeenCalled();
  });

  it('continues pending task after user action', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1', status: 'pending' })],
    });
    vi.spyOn(useAiTaskStore.getState(), 'fetchTask').mockResolvedValue();
    await continueAiTask('local-1');
    expect(predictBatchLabelingServer).toHaveBeenCalled();
  });

  it('continues orphaned running task after page refresh', async () => {
    useAiTaskStore.setState({
      tasks: [
        baseTask({
          id: 'local-1',
          status: 'running',
          imageIds: ['img-1', 'img-2'],
          progress: {
            total: 2,
            completed: 0,
            success: 0,
            failed: 0,
            objects: 0,
            currentImageId: null,
            currentImageName: null,
          },
        }),
      ],
    });
    vi.spyOn(useAiTaskStore.getState(), 'fetchTask').mockResolvedValue();
    const result = await continueAiTask('local-1');
    expect(result.started).toBe(true);
    expect(predictBatchLabelingServer).toHaveBeenCalled();
  });

  it('blocks continue when task is actively running locally', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-active', status: 'paused' })],
    });
    const runPromise = runAiTask('local-active');
    const result = await continueAiTask('local-active');
    expect(result.started).toBe(false);
    expect(result.message).toContain('正在执行');
    await runPromise;
  });

  it('blocks continue when model is missing', async () => {
    vi.spyOn(taskRecovery, 'validateTaskModelAvailable').mockResolvedValue(false);
    useAiTaskStore.setState({
      tasks: [
        baseTask({
          id: 'local-model',
          status: 'paused',
          serverTaskId: 'server-model-missing',
        }),
      ],
    });
    const result = await continueAiTask('local-model');
    expect(result.started).toBe(false);
    expect(result.message).toContain('模型已不存在');
  });

  it('prevents duplicate continue clicks', async () => {
    useAiTaskStore.setState({
      tasks: [baseTask({ id: 'local-1', status: 'paused' })],
    });
    vi.spyOn(useAiTaskStore.getState(), 'fetchTask').mockResolvedValue();
    vi.spyOn(useAiTaskStore.getState(), 'resumeTask').mockResolvedValue();
    const first = continueAiTask('local-1');
    const second = continueAiTask('local-1');
    expect(second).toBe(first);
    await first;
  });
});
