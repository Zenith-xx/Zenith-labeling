import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_ID_HEADER,
  buildLabelingApiAuthHeaders,
  buildLabelingApiHeaders,
  setRuntimeLabelingApiToken,
} from './labelingApiHeaders';
import { DEVICE_ID_STORAGE_KEY } from '@/utils/deviceId';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('buildLabelingApiHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, VALID_UUID);
    setRuntimeLabelingApiToken(undefined);
    vi.unstubAllEnvs();
  });

  it('adds X-Device-ID from getDeviceId', () => {
    const headers = buildLabelingApiHeaders();
    expect(headers.get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('adds Authorization when runtime API token is set', () => {
    setRuntimeLabelingApiToken('secret-token');
    const headers = buildLabelingApiHeaders();
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
  });

  it('does not override caller Authorization header', () => {
    setRuntimeLabelingApiToken('secret-token');
    const headers = buildLabelingApiHeaders({ Authorization: 'Bearer custom' });
    expect(headers.get('Authorization')).toBe('Bearer custom');
  });

  it('preserves other headers', () => {
    const headers = buildLabelingApiHeaders({
      'Content-Type': 'application/json',
    });
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get(DEVICE_ID_HEADER)).toBe(VALID_UUID);
  });

  it('does not force multipart content type for form uploads', () => {
    const headers = buildLabelingApiHeaders();
    expect(headers.get('Content-Type')).toBeNull();
  });
});

describe('buildLabelingApiAuthHeaders', () => {
  beforeEach(() => {
    setRuntimeLabelingApiToken('health-token');
  });

  it('adds Authorization without X-Device-ID', () => {
    const headers = buildLabelingApiAuthHeaders();
    expect(headers.get('Authorization')).toBe('Bearer health-token');
    expect(headers.get(DEVICE_ID_HEADER)).toBeNull();
  });
});
