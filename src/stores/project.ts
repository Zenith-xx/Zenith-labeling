import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import { syncPersistedFolderHandle } from '../storage/folderHandleRepository';
import type { WritableProjectDirectoryHandle } from '../utils/filePicker';
import { generateId } from '../utils/id';

const AUTO_SAVE_TO_FOLDER_KEY = 'labeling-vue3:autoSaveToFolder';

function readAutoSaveToFolderPreference(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_TO_FOLDER_KEY);
    if (raw === 'false') return false;
    if (raw === 'true') return true;
  } catch {
    // ignore
  }
  return true;
}

interface ProjectStore {
  projectId: string | null;
  projectName: string;
  isDirty: boolean;
  lastSavedAt: number | null;
  /** 正在保存中（防重入） */
  isSaving: boolean;
  /** File System Access API 目录句柄（Chrome/Edge 打开文件夹后可用） */
  projectDirHandle: WritableProjectDirectoryHandle | null;
  /** 最近一次 LabelMe JSON 写入磁盘时间 */
  lastFolderSavedAt: number | null;
  /** 是否将 LabelMe JSON 自动写入 projectDirHandle */
  autoSaveToFolder: boolean;
  /** 最近一次文件夹写入错误（供状态栏展示） */
  folderSaveError: string | null;
  /** 已从 IndexedDB 恢复，等待用户重新选择图片文件夹 */
  isAwaitingFolderBind: boolean;
  /** 恢复后关联图片文件夹时的进度（扫描/匹配） */
  folderBindStatus: {
    phase: 'scanning' | 'matching';
    message: string;
    current?: number;
    total?: number;
  } | null;

  markDirty: () => void;
  markSaved: () => void;
  setSaving: (saving: boolean) => void;
  setProjectMeta: (id: string, name?: string) => void;
  resetProject: () => void;
  ensureProjectId: (name?: string) => string;
  setProjectDirHandle: (handle: WritableProjectDirectoryHandle | null) => void;
  setAutoSaveToFolder: (enabled: boolean) => void;
  toggleAutoSaveToFolder: () => void;
  markFolderSaved: () => void;
  setFolderSaveError: (message: string | null) => void;
  setAwaitingFolderBind: (awaiting: boolean) => void;
  setFolderBindStatus: (
    status: ProjectStore['folderBindStatus']
  ) => void;
}

function createProjectId(): string {
  return `proj_${generateId()}`;
}

const useProjectStoreVanilla = create<ProjectStore>((set, get) => ({
  projectId: null,
  projectName: 'Untitled',
  isDirty: false,
  lastSavedAt: null,
  isSaving: false,
  projectDirHandle: null,
  lastFolderSavedAt: null,
  autoSaveToFolder: readAutoSaveToFolderPreference(),
  folderSaveError: null,
  isAwaitingFolderBind: false,
  folderBindStatus: null,

  markDirty: () => set({ isDirty: true }),

  markSaved: () =>
    set({
      isDirty: false,
      lastSavedAt: Date.now(),
      isSaving: false,
    }),

  setSaving: (saving) => set({ isSaving: saving }),

  setProjectMeta: (id, name) => {
    set({
      projectId: id,
      projectName: name?.trim() || get().projectName || 'Untitled',
    });
    const handle = get().projectDirHandle;
    if (handle) syncPersistedFolderHandle(id, handle);
  },

  resetProject: () =>
    set({
      projectId: null,
      projectName: 'Untitled',
      isDirty: false,
      lastSavedAt: null,
      isSaving: false,
      projectDirHandle: null,
      lastFolderSavedAt: null,
      folderSaveError: null,
      isAwaitingFolderBind: false,
      folderBindStatus: null,
    }),

  ensureProjectId: (name) => {
    const current = get().projectId;
    if (current) {
      if (name?.trim()) set({ projectName: name.trim() });
      const handle = get().projectDirHandle;
      if (handle) syncPersistedFolderHandle(current, handle);
      return current;
    }
    const id = createProjectId();
    set({
      projectId: id,
      projectName: name?.trim() || 'Untitled',
    });
    const handle = get().projectDirHandle;
    if (handle) syncPersistedFolderHandle(id, handle);
    return id;
  },

  setProjectDirHandle: (handle) => {
    set({
      projectDirHandle: handle,
      folderSaveError: null,
      projectName: handle?.name?.trim() || get().projectName,
    });
    syncPersistedFolderHandle(get().projectId, handle);
  },

  setAutoSaveToFolder: (enabled) => {
    try {
      localStorage.setItem(AUTO_SAVE_TO_FOLDER_KEY, String(enabled));
    } catch {
      // ignore
    }
    set({ autoSaveToFolder: enabled });
  },

  toggleAutoSaveToFolder: () => {
    const next = !get().autoSaveToFolder;
    get().setAutoSaveToFolder(next);
  },

  markFolderSaved: () =>
    set({
      lastFolderSavedAt: Date.now(),
      folderSaveError: null,
    }),

  setFolderSaveError: (message) => set({ folderSaveError: message }),

  setAwaitingFolderBind: (awaiting) => set({ isAwaitingFolderBind: awaiting }),

  setFolderBindStatus: (status) => set({ folderBindStatus: status }),
}));

export const useProjectStore = bridgeVanillaStoreToPinia('project', useProjectStoreVanilla);
