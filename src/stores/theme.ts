import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'labeling-vue3-theme';

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

interface ThemeStore {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const useThemeStoreVanilla = create<ThemeStore>((set) => {
  const mode = readStoredMode();
  const resolved = resolveTheme(mode);
  applyResolvedTheme(resolved);

  return {
    mode,
    resolved,
    setMode: (nextMode) => {
      localStorage.setItem(STORAGE_KEY, nextMode);
      const nextResolved = resolveTheme(nextMode);
      applyResolvedTheme(nextResolved);
      set({ mode: nextMode, resolved: nextResolved });
    },
  };
});

/** 监听系统主题变化（仅 mode=system 时生效） */
export function initThemeSystemListener() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { mode } = useThemeStore.getState();
    if (mode !== 'system') return;
    const resolved = resolveTheme('system');
    applyResolvedTheme(resolved);
    useThemeStore.setState({ resolved });
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export const useThemeStore = bridgeVanillaStoreToPinia('theme', useThemeStoreVanilla);
