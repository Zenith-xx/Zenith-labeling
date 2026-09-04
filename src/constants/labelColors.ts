/**
 * 默认标签色板（RGB 列表）
 */
const DEFAULT_LABEL_COLORMAP_RGB: [number, number, number][] = [
  [170, 170, 255],
  [255, 170, 170],
  [170, 255, 170],
  [255, 255, 170],
  [170, 255, 255],
  [255, 170, 255],
  [85, 170, 255],
  [255, 170, 0],
  [40, 255, 255],
  [0, 255, 127],
  [255, 105, 180],
  [127, 255, 212],
  [255, 215, 0],
  [100, 149, 237],
  [255, 182, 193],
  [64, 224, 208],
  [255, 223, 186],
  [147, 112, 219],
  [0, 191, 255],
  [240, 128, 128],
  [152, 251, 152],
  [173, 216, 230],
  [255, 192, 203],
  [221, 160, 221],
  [135, 206, 250],
  [255, 250, 205],
  [175, 238, 238],
  [250, 128, 114],
  [154, 205, 50],
  [32, 178, 170],
  [255, 160, 122],
  [176, 224, 230],
];

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export const LABEL_COLORS = DEFAULT_LABEL_COLORMAP_RGB.map(([r, g, b]) => rgbToHex(r, g, b));

/** 颜色选择器「基本颜色」网格（8×6），与新建标签默认色顺序一致 */
export const BASIC_COLOR_PALETTE: string[] = [
  ...LABEL_COLORS,
  '#7f7f7f',
  '#c0c0c0',
  '#ffffff',
  '#000000',
  '#ff7f50',
  '#dda0dd',
  '#98fb98',
  '#f0e68c',
  '#87cefa',
  '#ffb6c1',
  '#20b2aa',
  '#cd853f',
  '#4682b4',
  '#9acd32',
  '#ff6347',
  '#6a5acd',
];

/** 按基本色板顺序分配：第 1 个标签取 palette[0]，第 2 个取 palette[1]，循环 */
export function getNextLabelColor(index: number): string {
  const safeIndex = Math.max(0, index);
  return BASIC_COLOR_PALETTE[safeIndex % BASIC_COLOR_PALETTE.length];
}
