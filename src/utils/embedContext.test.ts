import { describe, expect, it, vi } from 'vitest';

import {
  canUseFileSystemAccessApi,
  isEmbeddedFrame,
  isFileSystemAccessBlockedError,
} from './embedContext';

describe('embedContext', () => {
  it('returns false when not in an iframe', () => {
    expect(isEmbeddedFrame()).toBe(false);
    expect(canUseFileSystemAccessApi()).toBe(true);
  });

  it('blocks file system access in cross-origin iframe', () => {
    vi.stubGlobal('parent', {
      get location() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    vi.stubGlobal('top', {});

    expect(isEmbeddedFrame()).toBe(true);
    expect(canUseFileSystemAccessApi()).toBe(false);

    vi.unstubAllGlobals();
  });

  it('allows file system access in same-origin iframe', () => {
    vi.stubGlobal('parent', { location: { href: 'http://localhost:4000/icms4ci/static/' } });
    vi.stubGlobal('top', {});

    expect(isEmbeddedFrame()).toBe(true);
    expect(canUseFileSystemAccessApi()).toBe(true);

    vi.unstubAllGlobals();
  });

  it('detects cross-origin picker errors', () => {
    expect(
      isFileSystemAccessBlockedError(
        new DOMException(
          "Failed to execute 'showDirectoryPicker' on 'Window': Cross origin sub frames aren't allowed to show a file picker.",
          'SecurityError'
        )
      )
    ).toBe(true);
  });
});
