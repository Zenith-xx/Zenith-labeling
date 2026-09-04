/** IndexedDB 持久化层记录类型（与业务 store 解耦） */

export const LABELING_VUE3_DB_NAME = 'LabelingVue3DB';
/** v2：新增 folderHandles，持久化 FileSystemDirectoryHandle */
export const LABELING_VUE3_DB_VERSION = 2;

export const STORE_PROJECTS = 'projects';
export const STORE_IMAGES = 'images';
export const STORE_ANNOTATIONS = 'annotations';
export const STORE_LABELS = 'labels';
export const STORE_FOLDER_HANDLES = 'folderHandles';

export type StoreName =
  | typeof STORE_PROJECTS
  | typeof STORE_IMAGES
  | typeof STORE_ANNOTATIONS
  | typeof STORE_LABELS
  | typeof STORE_FOLDER_HANDLES;

/**
 * 项目文件夹句柄（Chrome/Edge File System Access API）。
 * handle 本身可存 IndexedDB；刷新后需再次 requestPermission。
 */
export interface FolderHandleRecord {
  projectId: string;
  handle: FileSystemDirectoryHandle;
  folderName: string;
  updatedAt: number;
}

/** 项目元信息 */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

/** 图片元信息（不含 File / blob，仅可序列化字段） */
export interface ImageRecord {
  id: string;
  projectId: string;
  filename: string;
  width: number;
  height: number;
  index: number;
}

/**
 * 单条标注持久化记录。
 * data 存放完整 Annotation 序列化对象（与业务类型对齐，由上层写入）。
 */
export interface AnnotationRecord {
  id: string;
  projectId: string;
  imageId: string;
  data: unknown;
}

/**
 * 单条标签持久化记录。
 * data 存放完整 Label 序列化对象。
 */
export interface LabelRecord {
  id: string;
  projectId: string;
  data: unknown;
}
