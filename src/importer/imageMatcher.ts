import type { ImageFile } from '../types';
import { generateId } from '../utils/id';
import { getFileBasename } from './datasetScanner';
import {
  DEFAULT_FILE_SORT_MODE,
  sortFilesByMode,
  type FileSortMode,
} from './fileOrder';
import type { DatasetFileIndex, DatasetItem } from './types';

function createImageEntry(file: File, id: string): ImageFile {
  return {
    id,
    name: file.name,
    url: '',
    width: 0,
    height: 0,
    file,
    loaded: false,
  };
}

/**
 * 将图片与 JSON 标注按 basename 匹配（忽略大小写）。
 * 图片顺序按相对路径自然排序（natsort）。
 */
export function matchDatasetItems(
  index: DatasetFileIndex,
  mode: FileSortMode = DEFAULT_FILE_SORT_MODE
): DatasetItem[] {
  const orderedFiles = sortFilesByMode(Array.from(index.images.values()), mode);

  return orderedFiles.map((imageFile) => {
    const key = getFileBasename(imageFile.name).toLowerCase();
    return {
      id: generateId(),
      imageFile,
      annotationFile: index.annotations.get(key),
    };
  });
}

export function datasetItemsToImageFiles(items: readonly DatasetItem[]): ImageFile[] {
  return items.map((item) => createImageEntry(item.imageFile, item.id));
}

export function countMatchedAnnotations(items: readonly DatasetItem[]): number {
  return items.reduce((sum, item) => (item.annotationFile ? sum + 1 : sum), 0);
}
