/**
 * Zustand-compatible vanilla store (no zustand package).
 * Source of truth for imperative getState / setState used by History commands and verify scripts.
 */

export type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T> | T)
) => void;

export type GetState<T> = () => T;

export type StoreListener<T> = (state: T, prevState: T) => void;

export interface VanillaStore<T extends object> {
  getState: GetState<T>;
  setState: SetState<T>;
  subscribe: (listener: StoreListener<T>) => () => void;
}

export type UseStore<T extends object> = {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState: GetState<T>;
  setState: SetState<T>;
  subscribe: (listener: StoreListener<T>) => () => void;
};

export function create<T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T
): UseStore<T> {
  let state = {} as T;
  const listeners = new Set<StoreListener<T>>();

  const getState: GetState<T> = () => state;

  const setState: SetState<T> = (partial) => {
    const prevState = state;
    const partialState =
      typeof partial === 'function' ? partial(state) : partial;
    if (partialState === state) return;
    state = { ...state, ...partialState };
    listeners.forEach((listener) => listener(state, prevState));
  };

  const subscribe = (listener: StoreListener<T>) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = initializer(setState, getState);

  const useStore = ((selector?: (s: T) => unknown) => {
    const current = getState();
    return selector ? selector(current) : current;
  }) as UseStore<T>;

  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe;

  return useStore;
}
