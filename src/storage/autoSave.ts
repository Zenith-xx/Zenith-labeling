/**
 * Debounce 自动保存：
 * - IndexedDB（全项目快照）
 * - LabelMe JSON 写入打开的项目文件夹（Chrome/Edge + readwrite 目录句柄）
 */
import type { Annotation } from '../types';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { useProjectStore } from '../store/useProjectStore';
import { saveProject, type ProjectSnapshot } from './projectRepository';
import {
  annotationsToLabelMeJson,
  getLabelMeJsonFilename,
} from '../utils/labelMeExport';
import {
  ensureDirectoryWritePermission,
  writeTextToDirectory,
} from '../utils/filePicker';
import { setLastProjectId } from './lastProject';

const AUTOSAVE_DELAY_MS = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let pendingAfterSave = false;
const dirtyImageIds = new Set<string>();

export function getAutoSaveDelayMs(): number {
  return AUTOSAVE_DELAY_MS;
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function normalizeImageIds(imageIds?: string | string[]): string[] {
  if (imageIds === undefined) {
    const current = useAnnotationStore.getState().currentImage?.id;
    return current ? [current] : [];
  }
  return Array.isArray(imageIds) ? imageIds : [imageIds];
}

function markDirtyImages(imageIds?: string | string[]): void {
  for (const id of normalizeImageIds(imageIds)) {
    dirtyImageIds.add(id);
  }
}

/** 导入完成等批量变更：标记全部图片待写 LabelMe JSON */
export function markAllImagesDirtyForFolderSave(): void {
  const { imageList } = useAnnotationStore.getState();
  for (const img of imageList) {
    dirtyImageIds.add(img.id);
  }
}

function buildSnapshotFromStores(): ProjectSnapshot {
  const project = useProjectStore.getState();
  const projectId = project.ensureProjectId();
  const ann = useAnnotationStore.getState();

  return {
    projectId,
    projectName: project.projectName,
    images: ann.imageList.map((img, index) => ({
      id: img.id,
      filename: img.name,
      width: img.width,
      height: img.height,
      index,
    })),
    labels: ann.labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      description: l.description,
    })),
    annotationsByImage: ann.annotationsByImage as Record<string, Annotation[]>,
  };
}

async function writeDirtyLabelMeFiles(): Promise<void> {
  const project = useProjectStore.getState();
  if (!project.autoSaveToFolder || !project.projectDirHandle) return;

  const ids = [...dirtyImageIds];
  if (ids.length === 0) return;

  const dirHandle = project.projectDirHandle;
  const granted = await ensureDirectoryWritePermission(dirHandle);
  if (!granted) {
    project.setFolderSaveError('需要文件夹写入权限才能自动保存 LabelMe JSON');
    return;
  }

  const store = useAnnotationStore.getState();
  const writtenIds: string[] = [];

  try {
    for (const imageId of ids) {
      const image = store.imageList.find((img) => img.id === imageId);
      if (!image) {
        dirtyImageIds.delete(imageId);
        continue;
      }

      const annotations = store.annotationsByImage[imageId] ?? [];
      const width = image.width > 0 ? image.width : 1;
      const height = image.height > 0 ? image.height : 1;
      const content = annotationsToLabelMeJson(
        annotations,
        store.labels,
        image.name,
        width,
        height,
        store.poseConfig
      );
      const filename = getLabelMeJsonFilename(image.name);
      await writeTextToDirectory(dirHandle, filename, content);
      writtenIds.push(imageId);
    }

    for (const id of writtenIds) {
      dirtyImageIds.delete(id);
    }
    project.markFolderSaved();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '写入 LabelMe JSON 失败';
    project.setFolderSaveError(message);
    console.error('[autoSave] labelMe folder save failed', err);
  }
}

async function runSave(): Promise<void> {
  const project = useProjectStore.getState();
  const shouldSaveIndexedDb = project.isDirty;

  if (shouldSaveIndexedDb) {
    project.setSaving(true);
    try {
      const snapshot = buildSnapshotFromStores();
      await saveProject(snapshot);
      useProjectStore.getState().setProjectMeta(snapshot.projectId, snapshot.projectName);
      setLastProjectId(snapshot.projectId);

      if (pendingAfterSave) {
        pendingAfterSave = false;
        useProjectStore.getState().markDirty();
        useProjectStore.getState().setSaving(false);
        scheduleAutoSave();
        return;
      }
      useProjectStore.getState().markSaved();
    } catch (err) {
      useProjectStore.getState().setSaving(false);
      console.error('[autoSave] saveProject failed', err);
    }
  }

  await writeDirtyLabelMeFiles();
}

/** 调度一次自动保存（合并 500ms 内多次调用） */
export function scheduleAutoSave(): void {
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    saveQueue = saveQueue.then(runSave).catch((err) => {
      console.error('[autoSave] queue error', err);
    });
  }, AUTOSAVE_DELAY_MS);
}

/**
 * 标注 / 标签等数据变更入口：
 * markDirty + 触发 debounce 保存。
 * 禁止在 mousemove 中调用。
 */
export function notifyProjectDataChanged(imageIds?: string | string[]): void {
  markDirtyImages(imageIds);

  const state = useProjectStore.getState();
  if (state.isSaving) {
    pendingAfterSave = true;
  }
  state.ensureProjectId();
  state.markDirty();
  scheduleAutoSave();
}

export function cancelAutoSave(): void {
  clearTimer();
  pendingAfterSave = false;
  dirtyImageIds.clear();
}

export function flushAutoSave(): Promise<void> {
  clearTimer();
  saveQueue = saveQueue.then(runSave);
  return saveQueue;
}
