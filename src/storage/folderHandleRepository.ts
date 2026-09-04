/**
 * 持久化 FileSystemDirectoryHandle（IndexedDB）。
 * 刷新后可取出句柄，在用户手势下 requestPermission，避免重新选文件夹。
 */
import type { FolderHandleRecord } from '../types/storage';
import {
  STORE_FOLDER_HANDLES,
  clear,
  deleteRecord,
  get,
  put,
} from './indexedDB';

export type { FolderHandleRecord };

export async function saveProjectFolderHandle(
  projectId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  if (!projectId || !handle) return;
  const record: FolderHandleRecord = {
    projectId,
    handle,
    folderName: handle.name || '',
    updatedAt: Date.now(),
  };
  await put(STORE_FOLDER_HANDLES, record);
}

export async function loadProjectFolderHandle(
  projectId: string
): Promise<FolderHandleRecord | undefined> {
  if (!projectId) return undefined;
  return get<FolderHandleRecord>(STORE_FOLDER_HANDLES, projectId);
}

export async function deleteProjectFolderHandle(
  projectId: string
): Promise<void> {
  if (!projectId) return;
  await deleteRecord(STORE_FOLDER_HANDLES, projectId);
}

export async function clearAllFolderHandles(): Promise<void> {
  await clear(STORE_FOLDER_HANDLES);
}

/**
 * 将当前内存中的目录句柄与 projectId 同步到 IndexedDB。
 * handle 为 null 时删除该项目的持久化句柄。
 */
export function syncPersistedFolderHandle(
  projectId: string | null | undefined,
  handle: FileSystemDirectoryHandle | null
): void {
  if (!projectId) return;
  void (handle
    ? saveProjectFolderHandle(projectId, handle).catch((err) => {
        if (import.meta.env?.DEV) {
          console.warn('[folderHandle] save failed', err);
        }
      })
    : deleteProjectFolderHandle(projectId).catch((err) => {
        if (import.meta.env?.DEV) {
          console.warn('[folderHandle] delete failed', err);
        }
      }));
}
