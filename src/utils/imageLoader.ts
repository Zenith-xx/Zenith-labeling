import type { ImageFile } from '../types';

const MAX_CACHED_URLS = 32;
const MAX_ELEMENT_CACHE = 24;

/** imageId → blob URL */
const urlCache = new Map<string, string>();
/** 最近使用顺序，用于 LRU 淘汰 */
const urlCacheOrder: string[] = [];

/** 已解码的 HTMLImageElement 缓存，避免切换时黑屏 */
const elementCache = new Map<string, { element: HTMLImageElement; url: string }>();
const elementCacheOrder: string[] = [];

function touchElementCache(id: string) {
  const idx = elementCacheOrder.indexOf(id);
  if (idx >= 0) elementCacheOrder.splice(idx, 1);
  elementCacheOrder.push(id);
}

function evictElementCache() {
  while (elementCacheOrder.length > MAX_ELEMENT_CACHE) {
    const oldest = elementCacheOrder[0];
    if (!oldest) break;
    elementCache.delete(oldest);
    elementCacheOrder.shift();
  }
}

function decodeUrlToElement(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return Promise.resolve(img);
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
  });
}

function touchCache(id: string) {
  const idx = urlCacheOrder.indexOf(id);
  if (idx >= 0) urlCacheOrder.splice(idx, 1);
  urlCacheOrder.push(id);
}

function revokeCachedUrl(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  const idx = urlCacheOrder.indexOf(id);
  if (idx >= 0) urlCacheOrder.splice(idx, 1);
  elementCache.delete(id);
  const elIdx = elementCacheOrder.indexOf(id);
  if (elIdx >= 0) elementCacheOrder.splice(elIdx, 1);
}

/** 当前查看及邻近图片，LRU 淘汰时跳过 */
const pinnedIds = new Set<string>();

export function setPinnedImageIds(ids: string[]) {
  pinnedIds.clear();
  for (const id of ids) pinnedIds.add(id);
}

function evictOldestCache() {
  while (urlCacheOrder.length > MAX_CACHED_URLS) {
    const evictable = urlCacheOrder.find((id) => !pinnedIds.has(id));
    if (!evictable) break;
    revokeCachedUrl(evictable);
  }
}

export function releaseAllImageUrls() {
  pinnedIds.clear();
  for (const id of [...urlCacheOrder]) {
    revokeCachedUrl(id);
  }
}

export function releaseImageUrl(imageId: string) {
  revokeCachedUrl(imageId);
}

function decodeImageFile(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法加载图片: ${file.name}`));
    };
    img.src = url;
  });
}

export function isImageLoaded(image: ImageFile): boolean {
  if (!image.loaded || image.width <= 0 || image.height <= 0) return false;
  // LRU 淘汰后 store 里可能仍留着已失效的 blob URL
  return urlCache.has(image.id);
}

export function getCachedImageUrl(imageId: string): string | undefined {
  return urlCache.get(imageId);
}

/**
 * 解码单张图片并缓存 blob URL（LRU 限制内存）。
 * 已加载则直接返回。
 */
export async function ensureImageLoaded(image: ImageFile): Promise<ImageFile> {
  const cachedUrl = urlCache.get(image.id);
  if (
    cachedUrl &&
    image.width > 0 &&
    image.height > 0 &&
    isImageLoaded(image)
  ) {
    touchCache(image.id);
    return { ...image, url: cachedUrl, loaded: true };
  }

  if (!image.file) {
    throw new Error(`图片资源缺失: ${image.name}`);
  }

  // 重新解码前清理 store 中可能已失效的旧 URL
  if (image.url?.startsWith('blob:') && image.url !== cachedUrl) {
    try {
      URL.revokeObjectURL(image.url);
    } catch {
      // ignore
    }
  }

  const { url, width, height } = await decodeImageFile(image.file);
  urlCache.set(image.id, url);
  touchCache(image.id);
  evictOldestCache();

  return {
    ...image,
    url,
    width,
    height,
    loaded: true,
  };
}

export function getCachedImageElement(imageId: string): HTMLImageElement | null {
  const entry = elementCache.get(imageId);
  if (entry?.element.complete) return entry.element;
  return null;
}

/**
 * 从元素缓存或 blob URL 缓存同步解析图片（切换已浏览图片时避免异步解码闪 loading）。
 */
export function tryResolveImageElementFromCache(
  image: ImageFile
): { image: ImageFile; element: HTMLImageElement } | null {
  const cachedEntry = elementCache.get(image.id);
  if (
    cachedEntry?.element.complete &&
    cachedEntry.element.naturalWidth > 0 &&
    cachedEntry.element.naturalHeight > 0
  ) {
    touchElementCache(image.id);
    const width =
      image.width > 0 ? image.width : cachedEntry.element.naturalWidth;
    const height =
      image.height > 0 ? image.height : cachedEntry.element.naturalHeight;
    return {
      image: {
        ...image,
        url: cachedEntry.url,
        width,
        height,
        loaded: true,
      },
      element: cachedEntry.element,
    };
  }

  const cachedUrl = urlCache.get(image.id);
  if (!cachedUrl) return null;

  const img = new Image();
  img.src = cachedUrl;
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return null;
  }

  elementCache.set(image.id, { element: img, url: cachedUrl });
  touchElementCache(image.id);

  const width = image.width > 0 ? image.width : img.naturalWidth;
  const height = image.height > 0 ? image.height : img.naturalHeight;
  return {
    image: { ...image, url: cachedUrl, width, height, loaded: true },
    element: img,
  };
}

/**
 * 加载并返回可绘制的 HTMLImageElement（带元素缓存，切换图片时无黑屏）。
 */
export async function loadImageElement(
  image: ImageFile
): Promise<{ image: ImageFile; element: HTMLImageElement }> {
  const loaded = await ensureImageLoaded(image);
  const cached = elementCache.get(loaded.id);
  if (cached && cached.url === loaded.url && cached.element.complete) {
    touchElementCache(loaded.id);
    return { image: loaded, element: cached.element };
  }

  const element = await decodeUrlToElement(loaded.url);
  elementCache.set(loaded.id, { element, url: loaded.url });
  touchElementCache(loaded.id);
  evictElementCache();

  return { image: loaded, element };
}

/**
 * 后台批量预加载图片尺寸（低优先级），用于 YOLO 导入/导出。
 */
export async function preloadImageMetadata(
  images: ImageFile[],
  options: {
    concurrency?: number;
    onProgress?: (loaded: number, total: number) => void;
    shouldContinue?: () => boolean;
  } = {}
): Promise<Map<string, Pick<ImageFile, 'url' | 'width' | 'height' | 'loaded'>>> {
  const { concurrency = 6, onProgress, shouldContinue } = options;
  const results = new Map<string, Pick<ImageFile, 'url' | 'width' | 'height' | 'loaded'>>();
  const pending = images.filter((img) => !isImageLoaded(img));
  const total = pending.length;
  let loaded = 0;

  if (total === 0) {
    onProgress?.(0, 0);
    return results;
  }

  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      if (shouldContinue && !shouldContinue()) return;
      const index = cursor++;
      const image = pending[index];
      try {
        const loadedImage = await ensureImageLoaded(image);
        results.set(loadedImage.id, {
          url: loadedImage.url,
          width: loadedImage.width,
          height: loadedImage.height,
          loaded: true,
        });
      } catch {
        // 跳过无法解码的图片
      }
      loaded += 1;
      onProgress?.(loaded, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
