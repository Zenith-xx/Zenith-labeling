import { defineStore } from 'pinia';
import { reactive, toRefs } from 'vue';
import type { UseStore } from './zustandCompat';

function isStoreAction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Pinia reactive view over a vanilla Zustand-compat store.
 * Vue components use the Pinia store; commands/tests use getState/setState on the vanilla API.
 */
export function bridgeVanillaStoreToPinia<T extends object>(
  id: string,
  vanilla: UseStore<T>
) {
  const usePiniaStore = defineStore(id, () => {
    const initial = vanilla.getState();
    const stateKeys = (Object.keys(initial) as (keyof T & string)[]).filter(
      (key) => !isStoreAction(initial[key])
    );
    const actionKeys = (Object.keys(initial) as (keyof T & string)[]).filter(
      (key) => isStoreAction(initial[key])
    );

    const state = reactive(
      Object.fromEntries(stateKeys.map((key) => [key, initial[key]]))
    ) as Record<string, unknown>;

    vanilla.subscribe((nextState) => {
      for (const key of stateKeys) {
        state[key] = nextState[key];
      }
    });

    const actions = Object.fromEntries(
      actionKeys.map((key) => [
        key,
        (...args: unknown[]) =>
          (vanilla.getState()[key] as (...args: unknown[]) => unknown)(...args),
      ])
    );

    return {
      ...toRefs(state),
      ...actions,
    } as T;
  });

  const useStore = ((selector?: (state: T) => unknown) => {
    if (selector) {
      return selector(vanilla.getState());
    }
    return usePiniaStore();
  }) as UseStore<T>;

  useStore.getState = vanilla.getState;
  useStore.setState = vanilla.setState;
  useStore.subscribe = vanilla.subscribe;

  return useStore;
}
