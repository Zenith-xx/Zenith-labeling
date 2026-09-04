import type { Annotation, ImageFile, Label } from '../types';
import type { AnnotationRecord, LabelRecord } from '../types/storage';
import { normalizeGroupId } from '../utils/annotationDisplay';
import { generateId } from '../utils/id';
import { scanDatasetFiles, getFileBasename } from '../importer/datasetScanner';
import {
  collectProjectFolderFiles,
  type PickedProjectFolder,
  type ProjectDirectoryHandle,
} from '../importer/folderCollector';
import { sortFilesByMode, compareImageFiles, DEFAULT_FILE_SORT_MODE } from '../importer/fileOrder';
import { IMPORT_IMAGE_BATCH_SIZE } from '../importer/types';
import { yieldToMain } from '../importer/yieldToMain';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  loadProject,
  type LoadedProject,
  type PersistedAnnotationData,
} from './projectRepository';
import { cancelAutoSave } from './autoSave';
import { setLastProjectId } from './lastProject';
import { loadProjectFolderHandle } from './folderHandleRepository';
import {
  ensureDirectoryWritePermission,
  type WritableProjectDirectoryHandle,
} from '../utils/filePicker';

export interface RestoreSummary {
  projectId: string;
  projectName: string;
  imageCount: number;
  labelCount: number;
  annotationCount: number;
  updatedAt: number;
}

export interface BindFolderResult {
  matched: number;
  missing: number;
  added: number;
  total: number;
}

function labelFromRecord(record: LabelRecord): Label {
  return record.data as Label;
}

function annotationFromRecord(record: AnnotationRecord): Annotation {
  const data = record.data as PersistedAnnotationData;
  return {
    id: data.id,
    labelId: data.labelId,
    shapeType: data.shapeType,
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    points: data.points ? [...data.points] : undefined,
    angle: data.angle,
    keypoints: data.keypoints ? [...data.keypoints] : undefined,
    hidden: data.hidden,
    groupId: normalizeGroupId(data.groupId),
  };
}

export function convertLoadedProject(loaded: LoadedProject): {
  images: ImageFile[];
  labels: Label[];
  annotationsByImage: Record<string, Annotation[]>;
} {
  const labels = loaded.labels.map(labelFromRecord);
  const annotationsByImage: Record<string, Annotation[]> = {};

  for (const record of loaded.annotations) {
    const ann = annotationFromRecord(record);
    if (!annotationsByImage[record.imageId]) {
      annotationsByImage[record.imageId] = [];
    }
    annotationsByImage[record.imageId].push(ann);
  }

  const images: ImageFile[] = loaded.images.map((img) => ({
    id: img.id,
    name: img.filename,
    url: '',
    width: img.width,
    height: img.height,
    loaded: false,
  }));

  return { images, labels, annotationsByImage };
}

export function projectNeedsFolderBind(imageList: ImageFile[] | undefined | null): boolean {
  if (!imageList || imageList.length === 0) return false;
  return imageList.some((img) => !img.file);
}

export async function restorePersistedProject(
  projectId: string
): Promise<RestoreSummary> {
  const loaded = await loadProject(projectId);
  if (!loaded) {
    throw new Error('未找到可恢复的项目');
  }

  const { images, labels, annotationsByImage } = convertLoadedProject(loaded);

  cancelAutoSave();
  useAnnotationStore.getState().loadProject({ images, labels, annotationsByImage });
  useProjectStore.getState().setProjectMeta(loaded.project.id, loaded.project.name);
  useProjectStore.getState().markSaved();
  useProjectStore.getState().setAwaitingFolderBind(true);
  setLastProjectId(projectId);

  return {
    projectId: loaded.project.id,
    projectName: loaded.project.name,
    imageCount: images.length,
    labelCount: labels.length,
    annotationCount: loaded.annotations.length,
    updatedAt: loaded.project.updatedAt,
  };
}

function reportBindProgress(done: number, total: number) {
  useProjectStore.getState().setFolderBindStatus({
    phase: 'matching',
    message: '正在关联图片…',
    current: done,
    total,
  });
}

export async function bindFolderFilesToProject(
  files: readonly File[]
): Promise<BindFolderResult> {
  const store = useAnnotationStore.getState();
  const index = scanDatasetFiles(sortFilesByMode(files, DEFAULT_FILE_SORT_MODE));
  const patches: Record<
    string,
    { name?: string; file?: File; url?: string; loaded?: boolean }
  > = {};
  let matched = 0;

  for (const img of store.imageList) {
    const key = getFileBasename(img.name).toLowerCase();
    const file = index.images.get(key);
    if (!file) continue;

    matched += 1;
    patches[img.id] = {
      name: file.name,
      file,
      url: '',
      loaded: false,
    };
    index.images.delete(key);
  }

  const totalBindUnits = matched + index.images.size;
  let doneUnits = 0;

  if (totalBindUnits > 0) {
    reportBindProgress(0, totalBindUnits);
    await yieldToMain();
  }

  const priorityId =
    store.currentImage?.id ?? store.imageList[0]?.id ?? null;

  if (priorityId && patches[priorityId]) {
    store.updateImage(priorityId, patches[priorityId]);
    delete patches[priorityId];
    doneUnits += 1;
    reportBindProgress(doneUnits, totalBindUnits);
    await yieldToMain();
  }

  const patchEntries = Object.entries(patches);
  for (let i = 0; i < patchEntries.length; i += IMPORT_IMAGE_BATCH_SIZE) {
    const chunk = Object.fromEntries(
      patchEntries.slice(i, i + IMPORT_IMAGE_BATCH_SIZE)
    );
    useAnnotationStore.getState().batchUpdateImages(chunk);
    doneUnits += Object.keys(chunk).length;
    reportBindProgress(doneUnits, totalBindUnits);
    await yieldToMain();
  }

  const extraFiles = Array.from(index.images.values()).sort(compareImageFiles);
  for (let i = 0; i < extraFiles.length; i += IMPORT_IMAGE_BATCH_SIZE) {
    const batch = extraFiles.slice(i, i + IMPORT_IMAGE_BATCH_SIZE);
    const newImages: ImageFile[] = batch.map((file) => ({
      id: generateId(),
      name: file.name,
      url: '',
      width: 0,
      height: 0,
      file,
      loaded: false,
    }));
    useAnnotationStore.getState().appendImages(newImages);
    doneUnits += batch.length;
    reportBindProgress(doneUnits, totalBindUnits);
    await yieldToMain();
  }

  const missing = useAnnotationStore
    .getState()
    .imageList.filter((img) => !img.file).length;
  useProjectStore.getState().setAwaitingFolderBind(missing > 0);

  useAnnotationStore.getState().sortImageListByPath();

  return {
    matched,
    missing,
    added: extraFiles.length,
    total: useAnnotationStore.getState().imageList.length,
  };
}

export async function bindRestoredProjectFolder(
  picked: PickedProjectFolder
): Promise<BindFolderResult> {
  const { setFolderBindStatus } = useProjectStore.getState();

  setFolderBindStatus({
    phase: 'scanning',
    message: '正在扫描文件夹…',
    current: 0,
  });

  try {
    const files =
      picked.kind === 'files'
        ? picked.files
        : await collectProjectFolderFiles(picked.dirHandle, {
            onProgress: ({ collected }) => {
              setFolderBindStatus({
                phase: 'scanning',
                message: '正在扫描文件夹…',
                current: collected,
              });
            },
          });

    if (files.length === 0) {
      throw new Error('文件夹中未找到文件');
    }

    if (picked.kind === 'directory') {
      useProjectStore.getState().setProjectDirHandle(picked.dirHandle);
    } else {
      useProjectStore.getState().setProjectDirHandle(null);
    }

    return await bindFolderFilesToProject(files);
  } finally {
    setFolderBindStatus(null);
  }
}

/**
 * 用 IndexedDB 里保存的目录句柄自动重新关联图片。
 * 必须在用户手势回调中调用（requestPermission 需要手势）。
 * 返回 null 表示无法自动关联，应回退到手动选文件夹。
 */
export async function tryRebindStoredFolder(
  projectId: string
): Promise<BindFolderResult | null> {
  const record = await loadProjectFolderHandle(projectId);
  if (!record?.handle) return null;

  const handle = record.handle as WritableProjectDirectoryHandle;
  const granted = await ensureDirectoryWritePermission(handle);
  if (!granted) return null;

  try {
    return await bindRestoredProjectFolder({
      kind: 'directory',
      dirHandle: handle as ProjectDirectoryHandle,
    });
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[tryRebindStoredFolder] bind failed', err);
    }
    return null;
  }
}
