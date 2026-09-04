import { canUseFileSystemAccessApi } from './embedContext';

export function getBasename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function isUserCancel(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return (
    err instanceof Error &&
    (err.message === '已取消' ||
      err.message === '未选择文件夹' ||
      err.message === '未选择文件')
  );
}

export { isUserCancel };

export function pickSingleJsonFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      resolve(file);
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

export function pickSingleYamlFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,text/yaml,application/x-yaml';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      resolve(file);
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickWritableYamlFile(): Promise<FileSystemFileHandle> {
  if ('showOpenFilePicker' in window && canUseFileSystemAccessApi()) {
    const [handle] = await (
      window as Window & {
        showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker({
      types: [
        {
          description: 'YAML 配置文件',
          accept: { 'application/x-yaml': ['.yaml', '.yml'] },
        },
      ],
      multiple: false,
    });
    return handle;
  }

  throw new Error('当前浏览器不支持写入文件，请使用 Chrome 或 Edge');
}

export function pickSingleTxtFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      resolve(file);
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickLabelsFolderFiles(): Promise<File[]> {
  if ('showDirectoryPicker' in window && canUseFileSystemAccessApi()) {
    const dirHandle = await (
      window as Window & {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker();

    const files: File[] = [];
    const iterable = dirHandle as FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [, handle] of iterable.entries()) {
      if (handle.kind === 'file' && handle.name.toLowerCase().endsWith('.txt')) {
        files.push(await (handle as FileSystemFileHandle).getFile());
      }
    }
    return files;
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.txt,text/plain';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    input.onchange = () => {
      const selected = input.files
        ? Array.from(input.files).filter((f) => f.name.toLowerCase().endsWith('.txt'))
        : [];
      input.remove();
      if (selected.length === 0) {
        reject(new Error('文件夹中未找到 txt 标签文件'));
        return;
      }
      resolve(selected);
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemFileHandle>;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export type WritableProjectDirectoryHandle = WritableDirectoryHandle;

export async function pickWritableTxtFile(): Promise<FileSystemFileHandle> {
  if ('showOpenFilePicker' in window && canUseFileSystemAccessApi()) {
    const [handle] = await (
      window as Window & {
        showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker({
      types: [{ description: '文本文件', accept: { 'text/plain': ['.txt'] } }],
      multiple: false,
    });
    return handle;
  }

  throw new Error('当前浏览器不支持写入文件，请使用 Chrome 或 Edge');
}

export async function pickXmlFolderFiles(): Promise<File[]> {
  if ('showDirectoryPicker' in window && canUseFileSystemAccessApi()) {
    const dirHandle = await (
      window as Window & {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker();

    const files: File[] = [];
    const iterable = dirHandle as FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [, handle] of iterable.entries()) {
      if (handle.kind === 'file' && handle.name.toLowerCase().endsWith('.xml')) {
        files.push(await (handle as FileSystemFileHandle).getFile());
      }
    }
    return files;
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,text/xml,application/xml';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    input.onchange = () => {
      const selected = input.files
        ? Array.from(input.files).filter((f) => f.name.toLowerCase().endsWith('.xml'))
        : [];
      input.remove();
      if (selected.length === 0) {
        reject(new Error('文件夹中未找到 xml 标注文件'));
        return;
      }
      resolve(selected);
    };

    input.oncancel = () => {
      input.remove();
      reject(new Error('已取消'));
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickWritableLabelsFolder(): Promise<WritableDirectoryHandle> {
  if ('showDirectoryPicker' in window && canUseFileSystemAccessApi()) {
    return (window as Window & {
      showDirectoryPicker: (options?: { mode?: string }) => Promise<WritableDirectoryHandle>;
    }).showDirectoryPicker({ mode: 'readwrite' });
  }

  throw new Error('当前浏览器不支持写入文件夹，请使用 Chrome 或 Edge');
}

export async function writeTextToFile(
  handle: FileSystemFileHandle,
  content: string
): Promise<void> {
  const writableHandle = handle as FileSystemFileHandle & {
    queryPermission: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  const opts = { mode: 'readwrite' as const };
  if ((await writableHandle.queryPermission(opts)) !== 'granted') {
    if ((await writableHandle.requestPermission(opts)) !== 'granted') {
      throw new Error('需要写入权限才能覆盖文件');
    }
  }
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function ensureDirectoryWritePermission(
  dir: WritableProjectDirectoryHandle
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (dir.queryPermission) {
    if ((await dir.queryPermission(opts)) === 'granted') return true;
  }
  if (dir.requestPermission) {
    return (await dir.requestPermission(opts)) === 'granted';
  }
  return true;
}

export async function writeTextToDirectory(
  dir: WritableDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  await writeTextToFile(fileHandle, content);
}
