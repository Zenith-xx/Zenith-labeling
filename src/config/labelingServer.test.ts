import { describe, expect, it, vi } from 'vitest';

import {
  BUILTIN_LABELING_SERVER_URL,
  getConfiguredLabelingServerUrl,
  getDefaultLabelingServerUrl,
} from './labelingServer';

describe('labelingServer config', () => {
  it('uses built-in URL when VITE_LABELING_SERVER_URL is unset', () => {
    vi.stubEnv('VITE_LABELING_SERVER_URL', '');
    expect(getConfiguredLabelingServerUrl()).toBe(BUILTIN_LABELING_SERVER_URL);
  });

  it('reads VITE_LABELING_SERVER_URL and trims trailing slashes', () => {
    vi.stubEnv(
      'VITE_LABELING_SERVER_URL',
      'http://192.168.1.100:8100/'
    );
    expect(getConfiguredLabelingServerUrl()).toBe('http://192.168.1.100:8100');
  });

  it('uses proxy path in development', () => {
    vi.stubEnv('DEV', true);
    expect(getDefaultLabelingServerUrl()).toBe('/labeling-api');
  });

  it('uses configured URL in production mode', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_LABELING_SERVER_URL', 'http://labeling.internal:8100');
    expect(getDefaultLabelingServerUrl()).toBe('http://labeling.internal:8100');
  });
});
