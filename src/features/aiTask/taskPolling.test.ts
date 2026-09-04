import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskPollingManager, TASK_POLL_INTERVAL_MS } from './taskPolling';
import { isActiveAiTaskStatus } from './serverTaskMapper';

describe('TaskPollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls while shouldContinue returns true', async () => {
    const manager = new TaskPollingManager();
    const callback = vi.fn().mockResolvedValue(undefined);
    let active = true;

    manager.start(callback, () => active);
    expect(manager.isActive).toBe(true);

    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(1);

    active = false;
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    expect(manager.isActive).toBe(false);
  });

  it('stops polling when completed status is not active', () => {
    expect(isActiveAiTaskStatus('completed')).toBe(false);
    expect(isActiveAiTaskStatus('failed')).toBe(false);
    expect(isActiveAiTaskStatus('cancelled')).toBe(false);
    expect(isActiveAiTaskStatus('running')).toBe(true);
    expect(isActiveAiTaskStatus('paused')).toBe(true);
    expect(isActiveAiTaskStatus('pending')).toBe(true);
  });

  it('stop clears timer without leaking', async () => {
    const manager = new TaskPollingManager();
    const callback = vi.fn().mockResolvedValue(undefined);
    manager.start(callback, () => true);
    manager.stop();
    expect(manager.isActive).toBe(false);
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS * 3);
    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('does not start duplicate timers', () => {
    const manager = new TaskPollingManager();
    const callback = vi.fn().mockResolvedValue(undefined);
    manager.start(callback, () => true);
    manager.start(callback, () => true);
    expect(manager.isActive).toBe(true);
    manager.stop();
  });

  it('continues polling after callback failure', async () => {
    const manager = new TaskPollingManager();
    const callback = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    manager.start(callback, () => true);
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(manager.isActive).toBe(true);
    manager.stop();
  });

  it('skips poll tick while previous request in flight', async () => {
    const manager = new TaskPollingManager();
    let resolveFirst: () => void = () => undefined;
    const callback = vi.fn(() => new Promise<void>((resolve) => {
      resolveFirst = resolve;
    }));
    manager.start(callback, () => true);
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TASK_POLL_INTERVAL_MS);
    expect(callback).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    manager.stop();
  });
});
