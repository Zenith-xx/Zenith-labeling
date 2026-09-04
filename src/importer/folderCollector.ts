import {
  canUseFileSystemAccessApi,
  isFileSystemAccessBlockedError,
} from '../utils/embedContext';
import { yieldToMain } from './yieldToMain';
import {
  compareNaturalPath,
  DEFAULT_FILE_SORT_MODE,
  sortFilesByMode,
  tagFileScanOrder,
  tagFileWithRelativePath,
} from './fileOrder';
import {
  IMPORT_FILE_CONCURRENCY,
  IMPORT_READ_YIELD_EVERY,
} from './types';

export type ProjectDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export type PickedProjectFolder =
  | { kind: 'files'; files: File[] }
  | { kind: 'directory'; dirHandle: ProjectDirectoryHandle };

export interface CollectFolderProgress {
  collected: number;
}

export interface CollectFolderOptions {
  onProgress?: (progress: CollectFolderProgress) => void;
  isCancelled?: () => boolean;
  yieldEvery?: number;
  concurrency?: number;
}

/** 与 datasetScanner 对齐：仅收集图片与 JSON，跳过无关文件的 getFile */
const DATASET_FILE_RE = /\.(jpe?g|png|bmp|webp|json)$/i;

function isDatasetFileName(name: string): boolean {
  return DATASET_FILE_RE.test(name);
}

/** 有限并发执行异步任务，结果顺序与输入一致 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldCancel?: () => boolean
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker(): Promise<void> {
    while (true) {
      if (shouldCancel?.()) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

/** 仅打开文件夹选择器，不读取文件内容（readwrite 供 LabelMe 自动保存） */
export async function pickProjectFolder(): Promise<PickedProjectFolder> {
  if ('showDirectoryPicker' in window && canUseFileSystemAccessApi()) {
    try {
      const dirHandle = await (
        window as Window & {
          showDirectoryPicker: (options?: {
            mode?: string;
          }) => Promise<ProjectDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: 'readwrite' });
      return { kind: 'directory', dirHandle };
    } catch (err) {
      if (!isFileSystemAccessBlockedError(err)) throw err;
    }
  }

  const files = await pickFolderViaInput();
  return { kind: 'files', files };
}

function pickFolderViaInput(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    input.onchange = () => {
      const selected = input.files ? Array.from(input.files) : [];
      input.remove();
      if (selected.length === 0) {
        reject(new Error('未选择文件夹'));
        return;
      }
      selected.forEach((file, index) => tagFileScanOrder(file, index));
      resolve(sortFilesByMode(selected, 'folder'));
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function readDirectoryEntries(
  dir: ProjectDirectoryHandle
): Promise<[string, FileSystemHandle][]> {
  const entries: [string, FileSystemHandle][] = [];
  for await (const entry of dir) {
    entries.push(entry);
  }
  entries.sort(([a], [b]) => compareNaturalPath(a, b));
  return entries;
}

interface PendingFileHandle {
  handle: FileSystemFileHandle;
  relativePath: string;
}

/** 递归读取目录内图片/JSON File（并发 getFile + 分批 yield） */
export async function collectProjectFolderFiles(
  dirHandle: ProjectDirectoryHandle,
  options?: CollectFolderOptions
): Promise<File[]> {
  const files: File[] = [];
  let collected = 0;
  const yieldEvery = options?.yieldEvery ?? IMPORT_READ_YIELD_EVERY;
  const concurrency = options?.concurrency ?? IMPORT_FILE_CONCURRENCY;
  let sinceYield = 0;

  const report = () => {
    options?.onProgress?.({ collected });
  };

  const flushHandles = async (pending: PendingFileHandle[]): Promise<void> => {
    if (pending.length === 0) return;

    const batchFiles = await mapPool(
      pending,
      concurrency,
      async ({ handle, relativePath }) => {
        const file = tagFileWithRelativePath(await handle.getFile(), relativePath);
        return file;
      },
      options?.isCancelled
    );

    if (options?.isCancelled?.()) return;

    for (const file of batchFiles) {
      if (!file) continue;
      tagFileScanOrder(file, collected);
      files.push(file);
      collected += 1;
      sinceYield += 1;
      if (sinceYield >= yieldEvery) {
        report();
        await yieldToMain();
        sinceYield = 0;
      }
    }
  };

  async function walk(dir: ProjectDirectoryHandle, prefix = ''): Promise<void> {
    const pending: PendingFileHandle[] = [];

    for (const [name, handle] of await readDirectoryEntries(dir)) {
      if (options?.isCancelled?.()) return;

      const relativePath = prefix ? `${prefix}/${name}` : name;

      if (handle.kind === 'file') {
        if (!isDatasetFileName(name)) continue;
        pending.push({
          handle: handle as FileSystemFileHandle,
          relativePath,
        });
        // 攒一批再并发，避免一次性创建过多 Promise
        if (pending.length >= concurrency * 4) {
          await flushHandles(pending.splice(0, pending.length));
        }
      } else if (handle.kind === 'directory') {
        // 先冲掉当前目录已攒的文件，再进子目录，保持较稳定的扫描顺序
        await flushHandles(pending.splice(0, pending.length));
        await walk(handle as ProjectDirectoryHandle, relativePath);
      }
    }

    await flushHandles(pending);
  }

  await walk(dirHandle);
  report();
  return sortFilesByMode(files, DEFAULT_FILE_SORT_MODE);
}
