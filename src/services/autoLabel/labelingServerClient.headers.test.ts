import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkLabelingServerHealth,
  predictBatchLabelingServer,
  predictLabelingServer,
} from './labelingServerClient';
import { DEVICE_ID_HEADER } from '@/services/labelingApiHeaders';
import { setRuntimeLabelingApiToken } from '@/services/labelingApiHeaders';
import { DEVICE_ID_STORAGE_KEY } from '@/utils/deviceId';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

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

describe('labelingServerClient headers', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, VALID_UUID);
    setRuntimeLabelingApiToken('test-api-token');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ status: 'ok' }))));
  });

  it('checkLabelingServerHealth does not send X-Device-ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: 'ok', models_loaded: 0, models_total: 0 })
    );
    await checkLabelingServerHealth({ serverUrl: 'http://localhost:8100' });
    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBeNull();
    expect(getRequestHeaders().get('Authorization')).toBe('Bearer test-api-token');
  });

  it('predictLabelingServer sends X-Device-ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        model: 'best',
        task: 'hbb',
        export_formats: ['pt'],
        image_width: 1,
        image_height: 1,
        shapes: [],
        detections: [],
      })
    );

    const file = new File(['img'], 'a.jpg', { type: 'image/jpeg' });
    await predictLabelingServer({
      serverUrl: 'http://localhost:8100',
      params: {
        model: 'best',
        confidence: 0.25,
        iou: 0.45,
        imgSize: 640,
        device: 'auto',
      },
      imageFile: file,
    });

    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
    expect(getRequestHeaders().get('Content-Type')).toBeNull();
  });

  it('predictBatchLabelingServer sends X-Device-ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        model: 'best',
        task: 'hbb',
        export_formats: ['pt'],
        count: 1,
        results: [],
      })
    );

    const file = new File(['img'], 'a.jpg', { type: 'image/jpeg' });
    await predictBatchLabelingServer({
      serverUrl: 'http://localhost:8100',
      params: {
        model: 'best',
        confidence: 0.25,
        iou: 0.45,
        imgSize: 640,
        device: 'auto',
      },
      imageFiles: [file],
      taskId: 'task-1',
    });

    expect(getRequestHeaders().get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });
});
