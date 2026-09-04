import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_ID_STORAGE_KEY,
  getDeviceId,
  isValidDeviceId,
} from './deviceId';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('deviceId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '7c9e6679-7425-42c6-95d4-123456789abc'),
    });
  });

  it('generates and persists a UUID v4 when storage is empty', () => {
    const deviceId = getDeviceId();
    expect(isValidDeviceId(deviceId)).toBe(true);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(deviceId);
  });

  it('returns the same id on subsequent calls', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid stored UUID v4', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, VALID_UUID);
    expect(getDeviceId()).toBe(VALID_UUID);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('replaces invalid stored values such as abc', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, 'abc');
    const deviceId = getDeviceId();
    expect(deviceId).toBe('7c9e6679-7425-42c6-95d4-123456789abc');
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(deviceId);
  });

  it('replaces path traversal values', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, '../');
    const deviceId = getDeviceId();
    expect(isValidDeviceId(deviceId)).toBe(true);
    expect(deviceId).not.toBe('../');
  });

  it('replaces legacy values', () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, 'legacy');
    const deviceId = getDeviceId();
    expect(deviceId).toBe('7c9e6679-7425-42c6-95d4-123456789abc');
  });
});
