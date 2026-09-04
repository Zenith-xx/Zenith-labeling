import type { ImageFile } from '../../types';
import { compareImageFileEntries } from '../../importer/fileOrder';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import type { AiTaskImageRange, AiTaskImageScope } from './types';

export interface ResolveTaskImageOptions {
  range?: AiTaskImageRange;
}

/** 将 1-based 范围钳制到 [1, total] 并保证 start <= end */
export function clampImageRange(
  start: number,
  end: number,
  total: number
): AiTaskImageRange {
  if (total <= 0) {
    return { start: 1, end: 1 };
  }
  let s = Math.floor(start);
  let e = Math.floor(end);
  if (!Number.isFinite(s)) s = 1;
  if (!Number.isFinite(e)) e = total;
  s = Math.max(1, Math.min(s, total));
  e = Math.max(1, Math.min(e, total));
  if (s > e) {
    return { start: e, end: s };
  }
  return { start: s, end: e };
}

export function resolveTaskImageIds(
  scope: AiTaskImageScope,
  options?: ResolveTaskImageOptions
): ImageFile[] {
  const { imageList, currentImage, annotationsByImage } = useAnnotationStore.getState();
  const sorted = [...imageList].sort(compareImageFileEntries);

  if (scope === 'current') {
    return currentImage ? [currentImage] : [];
  }

  if (scope === 'unannotated') {
    return sorted.filter((image) => {
      const anns = annotationsByImage[image.id] ?? [];
      return anns.length === 0;
    });
  }

  if (scope === 'range') {
    const range = options?.range ?? { start: 1, end: sorted.length };
    const clamped = clampImageRange(range.start, range.end, sorted.length);
    return sorted.slice(clamped.start - 1, clamped.end);
  }

  return sorted;
}

export function filterRunnableImages(images: ImageFile[]): ImageFile[] {
  return images.filter((image) => image.file || image.url);
}
