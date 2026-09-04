import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelTask,
  createTask,
  deleteTask,
  getTask,
  LabelingServerApiError,
  listTasks,
  pauseTask,
  resumeTask,
  startTask,
} from './labelingServerTaskApi';
import { DEVICE_ID_HEADER } from '@/services/labelingApiHeaders';
import { DEVICE_ID_STORAGE_KEY } from '@/utils/deviceId';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SERVER_URL = 'http://localhost:8100';

const sampleTask = {
  task_id: 'task-1',
  device_id: VALID_UUID,
  model_name: 'best',
  status: 'pending',
  total: 10,
  completed: 0,
  success: 0,
  failed: 0,
  progress: 0,
  created_at: 1,
  updated_at: 1,
  error: null,
  confidence: 0.25,
  iou: 0.45,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getRequestHeaders(callIndex = 0): Headers {
  const init = vi.mocked(fetch).mock.calls[callIndex]?.[1] as RequestInit;
  return new Headers(init?.headers);
}

describe('labelingServerTaskApi', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, VALID_UUID);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('listTasks sends X-Device-ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ tasks: [sampleTask] }));
    const tasks = await listTasks({ serverUrl: SERVER_URL });
    expect(tasks).toHaveLength(1);
    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${SERVER_URL}/tasks`);
  });

  it('getTask fetches single task', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(sampleTask));
    const task = await getTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    expect(task.task_id).toBe('task-1');
    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('createTask posts JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ...sampleTask, status: 'pending' }));
    const task = await createTask({
      serverUrl: SERVER_URL,
      modelName: 'best',
      total: 10,
      confidence: 0.25,
      iou: 0.45,
    });
    expect(task.model_name).toBe('best');
    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('startTask pause resume cancel call correct paths', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ ...sampleTask, status: 'running' }))
    );

    await startTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('/tasks/task-1/start');

    await pauseTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('/tasks/task-1/pause');

    await resumeTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    expect(String(vi.mocked(fetch).mock.calls[2]?.[0])).toContain('/tasks/task-1/resume');

    await cancelTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    expect(String(vi.mocked(fetch).mock.calls[3]?.[0])).toContain('/tasks/task-1/cancel');
  });

  it('deleteTask uses DELETE method', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: 'ok' }));
    await deleteTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('throws LabelingServerApiError for 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: '任务不存在' }, 404)
    );
    await expect(
      getTask({ serverUrl: SERVER_URL, taskId: 'missing' })
    ).rejects.toMatchObject({ status: 404, name: 'LabelingServerApiError' });
  });

  it('throws LabelingServerApiError for 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: '只能删除已结束的任务' }, 409)
    );
    try {
      await deleteTask({ serverUrl: SERVER_URL, taskId: 'task-1' });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(LabelingServerApiError);
      expect((err as LabelingServerApiError).status).toBe(409);
    }
  });
});
