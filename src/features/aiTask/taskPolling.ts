export const TASK_POLL_INTERVAL_MS = 1500;

export type TaskPollCallback = () => Promise<void>;

/** 单例轮询：同一时刻仅一个 interval */
export class TaskPollingManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  get isActive(): boolean {
    return this.timer !== null;
  }

  start(callback: TaskPollCallback, shouldContinue: () => boolean): void {
    this.stop();
    this.timer = setInterval(() => {
      if (!shouldContinue()) {
        this.stop();
        return;
      }
      if (this.inFlight) {
        return;
      }
      this.inFlight = true;
      void callback()
        .catch(() => undefined)
        .finally(() => {
          this.inFlight = false;
        });
    }, TASK_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.inFlight = false;
  }
}
