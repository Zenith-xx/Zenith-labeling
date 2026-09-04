import { getFileRelativePath } from './fileOrder';
import type { DatasetFileIndex } from './types';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isJsonFile(name: string): boolean {
  return name.toLowerCase().endsWith('.json');
}

export function getFileBasename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/** 从 JSON 文件名提取用于匹配图片的键（小写） */
export function getAnnotationMatchKey(jsonFileName: string): string {
  const annMatch = jsonFileName.match(/^(.+)_annotations\.json$/i);
  if (annMatch) return annMatch[1].toLowerCase();
  return getFileBasename(jsonFileName).toLowerCase();
}

/**
 * 扫描文件夹文件列表，只建立索引，不读取图片/JSON 内容。
 */
export function scanDatasetFiles(files: readonly File[]): DatasetFileIndex {
  const images = new Map<string, File>();
  const annotations = new Map<string, File>();
  const imageOrder: string[] = [];

  for (const file of files) {
    if (isImageFile(file.name)) {
      const key = getFileBasename(file.name).toLowerCase();
      const sortPath = getFileRelativePath(file);
      if (!images.has(key)) {
        images.set(key, file);
        imageOrder.push(sortPath);
      }
    } else if (isJsonFile(file.name)) {
      const key = getAnnotationMatchKey(file.name);
      if (!annotations.has(key)) {
        annotations.set(key, file);
      }
    }
  }

  return { images, annotations, imageOrder };
}

export function countIndexedImages(index: DatasetFileIndex): number {
  return index.images.size;
}
