import { describe, expect, it, vi } from 'vitest';

import { isTaskActionInFlight, runGuardedTaskAction } from './taskActionGuard';

describe('taskActionGuard', () => {
  it('prevents duplicate concurrent actions', async () => {
    const fn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'ok';
    });
    const first = runGuardedTaskAction('pause:task-1', fn);
    expect(isTaskActionInFlight('pause:task-1')).toBe(true);
    const second = runGuardedTaskAction('pause:task-1', fn);
    expect(second).toBe(first);
    await first;
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isTaskActionInFlight('pause:task-1')).toBe(false);
  });
});
