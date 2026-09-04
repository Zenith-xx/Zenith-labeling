import { applyResolvedTheme, type ResolvedTheme, useThemeStore } from '../stores/theme';
import { isEmbeddedFrame } from './embedContext';

/** 与 ICMS4CI Labeling.vue 保持一致 */
export const ICMS4CI_THEME_MESSAGE = 'icms4ci:theme';

/** 接收主系统主题（仅影响 iframe 内，不回传） */
export function initEmbedThemeSync(): () => void {
  if (!isEmbeddedFrame()) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== ICMS4CI_THEME_MESSAGE) return;
    if (typeof data.isDark !== 'boolean') return;

    const resolved: ResolvedTheme = data.isDark ? 'dark' : 'light';
    applyResolvedTheme(resolved);
    useThemeStore.setState({ resolved });
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
