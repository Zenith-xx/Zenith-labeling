export type ResolvedTheme = 'light' | 'dark';

export const APP_NAME = 'Zenith-labeling';

const darkColors = {
  primary: '#58a6ff',
  primaryStrong: '#1f6feb',
  bgBase: '#0d1117',
  bgPanel: '#161b22',
  bgElevated: '#1c2128',
  bgHover: '#21262d',
  border: '#30363d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  textDim: '#484f58',
  success: '#3fb950',
  danger: '#f85149',
  selection: '#1f6feb',
} as const;

const lightColors = {
  primary: '#0969da',
  primaryStrong: '#0550ae',
  bgBase: '#ffffff',
  bgPanel: '#f6f8fa',
  bgElevated: '#ffffff',
  bgHover: '#f3f4f6',
  border: '#d0d7de',
  text: '#1f2328',
  textMuted: '#656d76',
  textDim: '#8c959f',
  success: '#1a7f37',
  danger: '#cf222e',
  selection: '#0969da',
} as const;

export const themePalettes = {
  dark: darkColors,
  light: lightColors,
} as const;

/** 兼容旧引用，默认深色 */
export const themeColors = darkColors;

export function getAntdThemeToken(resolved: ResolvedTheme = 'dark') {
  const c = themePalettes[resolved];
  return {
    colorPrimary: c.primary,
    colorBgContainer: c.bgPanel,
    colorBgElevated: c.bgElevated,
    colorBorder: c.border,
    colorText: c.text,
    colorTextSecondary: c.textMuted,
    borderRadius: 6,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  };
}

