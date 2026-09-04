/**
 * Project Repository：业务快照 ↔ IndexedDB。
 * 组件禁止直接调 IndexedDB，一律经本模块。
 */
import type { Annotation, Label } from '../types';
import type {
  AnnotationRecord,
  ImageRecord,
  LabelRecord,
  ProjectRecord,
} from '../types/storage';
import {
  STORE_ANNOTATIONS,
  STORE_IMAGES,
  STORE_LABELS,
  STORE_PROJECTS,
  clear,
  deleteMany,
  deleteRecord,
  get,
  getAll,
  openDatabase,
  put,
  putMany,
} from './indexedDB';
import {
  clearAllFolderHandles,
  deleteProjectFolderHandle,
} from './folderHandleRepository';

const WRITE_CHUNK = 400;

export interface PersistedAnnotationData {
  id: string;
  labelId: string;
  shapeType: Annotation['shapeType'];
  x: number;
  y: number;
  width: number;
  height: number;
  points?: number[];
  angle?: number;
  keypoints?: number[];
  hidden?: boolean;
  groupId?: number;
}

export interface PersistedLabelData {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface ProjectImageInput {
  id: string;
  filename: string;
  width: number;
  height: number;
  index: number;
}

/** 可序列化项目快照（禁止 File / Blob URL / HTMLImageElement / Konva） */
export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  images: ProjectImageInput[];
  labels: Label[];
  annotationsByImage: Record<string, Annotation[]>;
}

export interface LoadedProject {
  project: ProjectRecord;
  images: ImageRecord[];
  labels: LabelRecord[];
  annotations: AnnotationRecord[];
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function serializeAnnotation(ann: Annotation): PersistedAnnotationData {
  const data: PersistedAnnotationData = {
    id: ann.id,
    labelId: ann.labelId,
    shapeType: ann.shapeType,
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
  };
  if (ann.points) data.points = [...ann.points];
  if (ann.angle !== undefined) data.angle = ann.angle;
  if (ann.keypoints) data.keypoints = [...ann.keypoints];
  if (ann.hidden) data.hidden = true;
  if (ann.groupId != null) data.groupId = ann.groupId;
  return data;
}

function serializeLabel(label: Label): PersistedLabelData {
  const data: PersistedLabelData = {
    id: label.id,
    name: label.name,
    color: label.color,
  };
  if (label.description) data.description = label.description;
  return data;
}

async function putManyChunked<T extends object>(
  storeName: Parameters<typeof putMany>[0],
  values: T[],
  chunkSize = WRITE_CHUNK
): Promise<void> {
  if (values.length === 0) return;
  for (let i = 0; i < values.length; i += chunkSize) {
    await putMany(storeName, values.slice(i, i + chunkSize));
    if (i + chunkSize < values.length) {
      await yieldToMain();
    }
  }
}

async function replaceStoreForProject(
  storeName:
    | typeof STORE_IMAGES
    | typeof STORE_LABELS
    | typeof STORE_ANNOTATIONS,
  projectId: string,
  nextRecords: object[]
): Promise<void> {
  const existing = await getAll<{ id: string }>(
    storeName,
    'byProjectId',
    projectId
  );
  if (existing.length > 0) {
    const keys = existing.map((r) => r.id);
    for (let i = 0; i < keys.length; i += WRITE_CHUNK) {
      await deleteMany(storeName, keys.slice(i, i + WRITE_CHUNK));
      if (i + WRITE_CHUNK < keys.length) await yieldToMain();
    }
  }
  await putManyChunked(storeName, nextRecords);
}

export async function saveImages(
  projectId: string,
  images: ProjectImageInput[]
): Promise<void> {
  await openDatabase();
  const records: ImageRecord[] = images.map((img) => ({
    id: img.id,
    projectId,
    filename: img.filename,
    width: img.width,
    height: img.height,
    index: img.index,
  }));
  await replaceStoreForProject(STORE_IMAGES, projectId, records);
}

export async function saveLabels(
  projectId: string,
  labels: Label[]
): Promise<void> {
  await openDatabase();
  const records: LabelRecord[] = labels.map((label) => ({
    id: label.id,
    projectId,
    data: serializeLabel(label),
  }));
  await replaceStoreForProject(STORE_LABELS, projectId, records);
}

export async function saveAnnotations(
  projectId: string,
  annotationsByImage: Record<string, Annotation[]>
): Promise<void> {
  await openDatabase();
  const records: AnnotationRecord[] = [];
  for (const [imageId, anns] of Object.entries(annotationsByImage)) {
    for (const ann of anns) {
      records.push({
        id: ann.id,
        projectId,
        imageId,
        data: serializeAnnotation(ann),
      });
    }
  }
  await replaceStoreForProject(STORE_ANNOTATIONS, projectId, records);
}

/**
 * 全量保存项目快照到 IndexedDB（async，分块写入，不阻塞 UI）。
 */
export async function saveProject(
  snapshot: ProjectSnapshot
): Promise<ProjectRecord> {
  await openDatabase();

  const { projectId, projectName, images, labels, annotationsByImage } =
    snapshot;
  const now = Date.now();
  const prev = await get<ProjectRecord>(STORE_PROJECTS, projectId);
  const project: ProjectRecord = {
    id: projectId,
    name: projectName.trim() || 'Untitled',
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    version: (prev?.version ?? 0) + 1,
  };

  await put(STORE_PROJECTS, project);
  await saveImages(projectId, images);
  await saveLabels(projectId, labels);
  await saveAnnotations(projectId, annotationsByImage);

  return project;
}

/** 从 IndexedDB 读取项目（不做 UI hydrate） */
export async function loadProject(
  projectId: string
): Promise<LoadedProject | null> {
  await openDatabase();
  const project = await get<ProjectRecord>(STORE_PROJECTS, projectId);
  if (!project) return null;

  const [images, labels, annotations] = await Promise.all([
    getAll<ImageRecord>(STORE_IMAGES, 'byProjectId', projectId),
    getAll<LabelRecord>(STORE_LABELS, 'byProjectId', projectId),
    getAll<AnnotationRecord>(STORE_ANNOTATIONS, 'byProjectId', projectId),
  ]);

  images.sort((a, b) => a.index - b.index);

  return { project, images, labels, annotations };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  await openDatabase();
  const projects = await getAll<ProjectRecord>(STORE_PROJECTS);
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(projectId: string): Promise<void> {
  await openDatabase();
  await replaceStoreForProject(STORE_IMAGES, projectId, []);
  await replaceStoreForProject(STORE_LABELS, projectId, []);
  await replaceStoreForProject(STORE_ANNOTATIONS, projectId, []);
  await deleteRecord(STORE_PROJECTS, projectId);
  await deleteProjectFolderHandle(projectId);
}

export async function clearAllPersistedData(): Promise<void> {
  await openDatabase();
  await clear(STORE_ANNOTATIONS);
  await clear(STORE_LABELS);
  await clear(STORE_IMAGES);
  await clear(STORE_PROJECTS);
  await clearAllFolderHandles();
}
