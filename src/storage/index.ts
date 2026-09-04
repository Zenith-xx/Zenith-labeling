export {
  openDatabase,
  closeDatabase,
  deleteDatabase,
  put,
  putMany,
  get,
  deleteRecord,
  deleteMany,
  deleteKey,
  clear,
  getAll,
  count,
  idb,
  LABELING_VUE3_DB_NAME,
  LABELING_VUE3_DB_VERSION,
  STORE_PROJECTS,
  STORE_IMAGES,
  STORE_ANNOTATIONS,
  STORE_LABELS,
  STORE_FOLDER_HANDLES,
} from './indexedDB';

export type { StoreName } from './indexedDB';

export type {
  ProjectRecord,
  ImageRecord,
  AnnotationRecord,
  LabelRecord,
  FolderHandleRecord,
} from '../types/storage';

export {
  saveProject,
  loadProject,
  saveAnnotations,
  saveLabels,
  saveImages,
  listProjects,
  deleteProject,
  clearAllPersistedData,
} from './projectRepository';

export type {
  LoadedProject,
  PersistedAnnotationData,
  PersistedLabelData,
} from './projectRepository';

export {
  notifyProjectDataChanged,
  scheduleAutoSave,
  flushAutoSave,
  cancelAutoSave,
  getAutoSaveDelayMs,
  markAllImagesDirtyForFolderSave,
} from './autoSave';

export {
  getLastProjectId,
  setLastProjectId,
  shouldOfferRestore,
  setDismissedRestore,
} from './lastProject';

export {
  restorePersistedProject,
  bindRestoredProjectFolder,
  bindFolderFilesToProject,
  convertLoadedProject,
  projectNeedsFolderBind,
  tryRebindStoredFolder,
} from './projectRestore';

export type { RestoreSummary, BindFolderResult } from './projectRestore';

export {
  saveProjectFolderHandle,
  loadProjectFolderHandle,
  deleteProjectFolderHandle,
  clearAllFolderHandles,
  syncPersistedFolderHandle,
} from './folderHandleRepository';
