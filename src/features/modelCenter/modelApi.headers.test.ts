import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchModelList, uploadModelFile } from './modelApi';
import { DEVICE_ID_HEADER } from '@/services/labelingApiHeaders';
import { DEVICE_ID_STORAGE_KEY } from '@/utils/deviceId';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('modelApi headers', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, VALID_UUID);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            models: [],
            defaultModelId: null,
          })
        )
      )
    );
  });

  it('fetchModelList sends X-Device-ID', async () => {
    await fetchModelList({ serverUrl: 'http://localhost:8100' });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('uploadModelFile sends X-Device-ID without multipart content type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        id: 'best',
        name: 'best',
        display_name: 'best',
        path: 'best.pt',
        type: 'detect',
        task: 'hbb',
        task_label: 'HBB',
        export_formats: ['pt'],
        classes: [],
      })
    );

    const file = new File(['weights'], 'best.pt', { type: 'application/octet-stream' });
    await uploadModelFile({
      serverUrl: 'http://localhost:8100',
      file,
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
    expect(headers.get('Content-Type')).toBeNull();
    expect(init.body).toBeInstanceOf(FormData);
  });
});
