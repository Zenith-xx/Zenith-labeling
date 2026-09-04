/**
 * 文件/图片排序：对齐 Windows 资源管理器「名称」列。
 * 字符类型优先级：符号 → 数字 → 英文字母（不区分大小写）→ 中文汉字（拼音序）。
 * 数字段按自然排序（整体数值比较）；同类型字符按 Unicode / 拼音逐位比较。
 */

export type FileSortMode = 'folder' | 'name' | 'natural';

export const DEFAULT_FILE_SORT_MODE: FileSortMode = 'natural';

export interface FileEntry {
  fileName: string;
  relativePath: string;
  order: number;
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** 0=符号  1=数字  2=英文字母  3=中文 */
type CharGroup = 0 | 1 | 2 | 3;

const fileScanOrder = new WeakMap<File, number>();
const fileRelativePath = new WeakMap<File, string>();

const chineseCollator = new Intl.Collator('zh-CN', { sensitivity: 'base' });

export function normalizeSortPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function isDigitChar(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function getCharGroup(ch: string): CharGroup {
  if (isDigitChar(ch)) return 1;
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return 2;
  if (CJK_RE.test(ch)) return 3;
  return 0;
}

function compareCodePoints(a: string, b: string): number {
  const codeA = a.codePointAt(0) ?? 0;
  const codeB = b.codePointAt(0) ?? 0;
  return codeA - codeB;
}

function compareSameGroupChars(chA: string, chB: string, group: CharGroup): number {
  switch (group) {
    case 0:
    case 1:
      return compareCodePoints(chA, chB);
    case 2: {
      const lowerA = chA.toLowerCase();
      const lowerB = chB.toLowerCase();
      const diff = compareCodePoints(lowerA, lowerB);
      if (diff !== 0) return diff;
      return compareCodePoints(chA, chB);
    }
    case 3:
      return chineseCollator.compare(chA, chB);
    default:
      return 0;
  }
}

function compareDigitRuns(numA: string, numB: string): number {
  const valA = BigInt(numA);
  const valB = BigInt(numB);
  if (valA < valB) return -1;
  if (valA > valB) return 1;
  if (numA.length !== numB.length) return numA.length - numB.length;
  return numA.localeCompare(numB);
}

/**
 * Windows 资源管理器风格自然排序。
 * 符号 → 数字（自然序）→ 英文（忽略大小写）→ 中文（拼音）。
 */
export function compareWindowsExplorerSort(a: string, b: string): number {
  const charsA = [...a];
  const charsB = [...b];
  let i = 0;
  let j = 0;

  while (i < charsA.length || j < charsB.length) {
    if (i >= charsA.length) return -1;
    if (j >= charsB.length) return 1;

    const chA = charsA[i]!;
    const chB = charsB[j]!;

    if (isDigitChar(chA) && isDigitChar(chB)) {
      let endA = i;
      while (endA < charsA.length && isDigitChar(charsA[endA]!)) endA += 1;
      let endB = j;
      while (endB < charsB.length && isDigitChar(charsB[endB]!)) endB += 1;

      const runA = charsA.slice(i, endA).join('');
      const runB = charsB.slice(j, endB).join('');
      const numDiff = compareDigitRuns(runA, runB);
      if (numDiff !== 0) return numDiff;

      i = endA;
      j = endB;
      continue;
    }

    const groupA = getCharGroup(chA);
    const groupB = getCharGroup(chB);
    if (groupA !== groupB) return groupA - groupB;

    const charDiff = compareSameGroupChars(chA, chB, groupA);
    if (charDiff !== 0) return charDiff;

    i += 1;
    j += 1;
  }

  return 0;
}

/** 自然排序键（英文/数字文件名） */
export function naturalSortKey(s: string): (string | number)[] {
  return s.split(/(\d+)/).map((part) => {
    if (/^\d+$/.test(part)) return Number(part);
    return part.toLowerCase();
  });
}

/** 自然排序（与 Windows 资源管理器「名称」列一致） */
export function compareNaturalSort(a: string, b: string): number {
  return compareWindowsExplorerSort(a, b);
}

export function sortFilesByName(names: readonly string[]): string[] {
  return [...names].sort(compareNaturalSort);
}

export function compareNaturalPath(a: string, b: string): number {
  return compareNaturalSort(a, b);
}

export function getFileRelativePath(file: File): string {
  const tagged = fileRelativePath.get(file);
  if (tagged) return tagged;
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel?.trim()) return normalizeSortPath(rel);
  return file.name;
}

export function getFileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
}

export function toFileEntry(file: File, order: number): FileEntry {
  const relativePath = getFileRelativePath(file);
  return {
    fileName: file.name,
    relativePath,
    order,
  };
}

export function tagFileScanOrder(file: File, order: number): File {
  fileScanOrder.set(file, order);
  return file;
}

export function getFileScanOrder(file: File): number {
  return fileScanOrder.get(file) ?? Number.MAX_SAFE_INTEGER;
}

export function tagFileWithRelativePath(file: File, relativePath: string): File {
  const normalized = normalizeSortPath(relativePath);
  fileRelativePath.set(file, normalized);
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: normalized,
      configurable: true,
      writable: false,
    });
  } catch {
    // Edge 等环境可能不允许修改 File 属性，WeakMap 仍可保留路径
  }
  return file;
}

export function compareFilesByMode(
  a: File,
  b: File,
  mode: FileSortMode = DEFAULT_FILE_SORT_MODE
): number {
  if (mode === 'folder') {
    const orderDiff = getFileScanOrder(a) - getFileScanOrder(b);
    if (orderDiff !== 0) return orderDiff;
  }

  const pathA = getFileRelativePath(a);
  const pathB = getFileRelativePath(b);

  if (mode === 'name') {
    return compareNaturalSort(getFileNameFromPath(pathA), getFileNameFromPath(pathB));
  }

  return compareNaturalSort(pathA, pathB);
}

export function sortFilesByMode(
  files: readonly File[],
  mode: FileSortMode = DEFAULT_FILE_SORT_MODE
): File[] {
  return [...files].sort((a, b) => compareFilesByMode(a, b, mode));
}

export function getFileFolderPath(file: File): string {
  return getFileRelativePath(file);
}

export function compareImageFiles(a: File, b: File): number {
  return compareFilesByMode(a, b, DEFAULT_FILE_SORT_MODE);
}

export function getImageFileSortPath(image: { name: string; file?: File }): string {
  if (image.file) {
    return getFileRelativePath(image.file);
  }
  return image.name;
}

export function compareImageFileEntries(
  a: { name: string; file?: File },
  b: { name: string; file?: File }
): number {
  return compareNaturalSort(getImageFileSortPath(a), getImageFileSortPath(b));
}

export function sortImageFileEntries<T extends { name: string; file?: File }>(
  images: readonly T[]
): T[] {
  return [...images].sort(compareImageFileEntries);
}
