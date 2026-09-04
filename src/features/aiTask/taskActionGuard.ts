const inflightActions = new Map<string, Promise<unknown>>();

export function runGuardedTaskAction<T>(
  key: string,
  action: () => Promise<T>
): Promise<T> {
  const existing = inflightActions.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  let resolveOuter!: (value: T) => void;
  let rejectOuter!: (reason: unknown) => void;
  const guarded = new Promise<T>((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });
  inflightActions.set(key, guarded);

  void action()
    .then(resolveOuter, rejectOuter)
    .finally(() => {
      inflightActions.delete(key);
    });

  return guarded;
}

export function isTaskActionInFlight(key: string): boolean {
  return inflightActions.has(key);
}
