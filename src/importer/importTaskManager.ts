import { scanDatasetFiles, countIndexedImages } from './datasetScanner';
import { datasetItemsToImageFiles, matchDatasetItems, countMatchedAnnotations } from './imageMatcher';
import { parseAnnotationBatch } from './annotationParser';
import { LabelRegistry } from './labelRegistry';
import { collectProjectFolderFiles, type ProjectDirectoryHandle } from './folderCollector';
import {
  DEFAULT_FILE_SORT_MODE,
  sortFilesByMode,
  type FileSortMode,
} from './fileOrder';
import { estimateReadingTotalUnits } from './importProgress';
import { yieldToMain } from './yieldToMain';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useImportStore } from '../store/useImportStore';
import { useProjectStore } from '../store/useProjectStore';
import { ensureImageLoaded } from '../utils/imageLoader';
import type { DatasetItem, ImportProgress } from './types';
import { IMPORT_IMAGE_BATCH_SIZE, IMPORT_PARSE_BATCH_SIZE } from './types';

function createProgress(partial: Partial<ImportProgress>): ImportProgress {
  return {
    totalFiles: 0,
    readFiles: 0,
    totalImages: 0,
    totalJson: 0,
    scanned: 0,
    parsed: 0,
    loadedAnnotations: 0,
    discoveredLabels: 0,
    newlyCreatedLabels: 0,
    completedUnits: 0,
    totalUnits: 1,
    phaseLabel: '准备导入',
    status: 'scanning',
    ...partial,
  };
}

function updateProgress(progress: ImportProgress): void {
  useImportStore.getState().setProgress({ ...progress });
}

export class ImportTaskManager {
  private cancelled = false;
  private progress: ImportProgress = createProgress({});
  private labelTransactionActive = false;

  getProgress(): ImportProgress {
    return { ...this.progress };
  }

  cancel(): void {
    this.cancelled = true;
    if (this.labelTransactionActive) {
      useHistoryStore.getState().cancelTransaction();
      this.labelTransactionActive = false;
    }
    if (this.progress.status !== 'completed' && this.progress.status !== 'error') {
      this.progress = {
        ...this.progress,
        status: 'cancelled',
      };
      updateProgress(this.progress);
    }
  }

  private isCancelled(): boolean {
    return this.cancelled;
  }

  async startImport(files: readonly File[]): Promise<ImportProgress> {
    this.cancelled = false;
    useProjectStore.getState().setProjectDirHandle(null);
    useImportStore.getState().show();
    this.progress = createProgress({
      status: 'scanning',
      phaseLabel: '分析数据集',
      totalFiles: files.length,
      readFiles: files.length,
      completedUnits: 0,
      totalUnits: Math.max(files.length, 1),
    });
    updateProgress(this.progress);
    return this.runImportPipeline(files);
  }

  async startImportFromDirectory(dirHandle: ProjectDirectoryHandle): Promise<ImportProgress> {
    this.cancelled = false;
    useProjectStore.getState().setProjectDirHandle(dirHandle);
    useImportStore.getState().show();
    this.progress = createProgress({
      status: 'reading',
      phaseLabel: '读取文件夹',
      completedUnits: 0,
      totalUnits: 1,
    });
    updateProgress(this.progress);

    try {
      await yieldToMain();

      const files = await collectProjectFolderFiles(dirHandle, {
        onProgress: ({ collected }) => {
          this.progress = {
            ...this.progress,
            readFiles: collected,
            completedUnits: collected,
            totalUnits: estimateReadingTotalUnits(collected),
            phaseLabel: '读取文件夹',
          };
          updateProgress(this.progress);
        },
        isCancelled: () => this.isCancelled(),
      });

      if (this.isCancelled()) {
        return this.progress;
      }

      if (files.length === 0) {
        throw new Error('文件夹中未找到文件');
      }

      return await this.runImportPipeline(files, true);
    } catch (err) {
      return this.failImport(err);
    }
  }

  private failImport(err: unknown): ImportProgress {
    if (this.labelTransactionActive) {
      useHistoryStore.getState().cancelTransaction();
      this.labelTransactionActive = false;
    }
    this.progress = {
      ...this.progress,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : '导入失败',
    };
    updateProgress(this.progress);
    useImportStore.getState().show();
    return this.progress;
  }

  private async runImportPipeline(
    files: readonly File[],
    fromReading = false,
    sortMode: FileSortMode = DEFAULT_FILE_SORT_MODE
  ): Promise<ImportProgress> {
    const orderedFiles = sortFilesByMode(files, sortMode);
    const fileCount = orderedFiles.length;

    try {
      if (fromReading) {
        this.progress = {
          ...this.progress,
          status: 'scanning',
          phaseLabel: '分析数据集',
          totalFiles: fileCount,
          readFiles: fileCount,
          completedUnits: fileCount,
          totalUnits: fileCount,
          scanned: 0,
        };
      } else {
        this.progress = {
          ...this.progress,
          totalFiles: fileCount,
          readFiles: fileCount,
        };
        await yieldToMain();
      }
      updateProgress(this.progress);

      const index = scanDatasetFiles(orderedFiles);
      const totalImages = countIndexedImages(index);

      if (totalImages === 0) {
        throw new Error('文件夹中未找到图片文件');
      }

      this.progress = {
        ...this.progress,
        totalImages,
        scanned: totalImages,
        status: 'matching',
        phaseLabel: '分析数据集',
        completedUnits: fileCount,
        totalUnits: fileCount,
      };
      updateProgress(this.progress);
      await yieldToMain();

      if (this.isCancelled()) {
        return this.progress;
      }

      const items = matchDatasetItems(index, sortMode);
      const parseTargets = items.filter(
        (item): item is DatasetItem & { annotationFile: File } =>
          Boolean(item.annotationFile)
      );
      const totalUnits = fileCount + items.length + parseTargets.length;

      this.progress = {
        ...this.progress,
        totalFiles: fileCount,
        totalImages: items.length,
        totalJson: parseTargets.length,
        scanned: 0,
        parsed: 0,
        loadedAnnotations: 0,
        discoveredLabels: 0,
        newlyCreatedLabels: 0,
        status: 'parsing',
        phaseLabel: '导入图片',
        completedUnits: fileCount,
        totalUnits,
      };
      updateProgress(this.progress);

      useAnnotationStore.getState().prepareDatasetImport();
      useProjectStore.getState().setAwaitingFolderBind(false);

      for (let i = 0; i < items.length; i += IMPORT_IMAGE_BATCH_SIZE) {
        if (this.isCancelled()) break;

        const batch = items.slice(i, i + IMPORT_IMAGE_BATCH_SIZE);
        const imageFiles = datasetItemsToImageFiles(batch);
        useAnnotationStore.getState().appendImages(imageFiles);

        if (typeof Image !== 'undefined' && i === 0 && imageFiles[0]) {
          void ensureImageLoaded(imageFiles[0]).then((loaded) => {
            useAnnotationStore.getState().updateImage(loaded.id, {
              url: loaded.url,
              width: loaded.width,
              height: loaded.height,
              loaded: true,
            });
          });
        }

        const imagesDone = Math.min(i + batch.length, items.length);
        this.progress = {
          ...this.progress,
          scanned: imagesDone,
          completedUnits: fileCount + imagesDone,
          phaseLabel: '导入图片',
        };
        updateProgress(this.progress);
        await yieldToMain();
      }

      if (this.isCancelled()) {
        return this.progress;
      }

      // 图片已挂载，可先操作；弹窗保留到 JSON 解析完成（进度到 100%）
      useAnnotationStore.getState().finishDatasetImport();
      this.progress = {
        ...this.progress,
        scanned: items.length,
        completedUnits: fileCount + items.length,
        phaseLabel: parseTargets.length > 0 ? '解析标注' : '导入完成',
        status: parseTargets.length > 0 ? 'parsing' : 'completed',
      };
      updateProgress(this.progress);

      if (parseTargets.length === 0) {
        return this.progress;
      }

      useAnnotationStore.getState().resetLabelsForImport();
      const registry = new LabelRegistry([]);
      const globalDiscovered = new Set<string>();
      let newlyCreatedLabels = 0;

      useHistoryStore.getState().beginTransaction('IMPORT_LABELS');
      this.labelTransactionActive = true;

      const labelsBefore = registry.byName.size;
      let parsedFiles = 0;
      let loadedAnnotations = 0;

      await parseAnnotationBatch(
        parseTargets.map((item) => ({
          imageId: item.id,
          annotationFile: item.annotationFile,
        })),
        registry,
        IMPORT_PARSE_BATCH_SIZE,
        () => this.isCancelled(),
        {
          useTransaction: true,
          poseConfig: useAnnotationStore.getState().poseConfig,
          onLabelsDiscovered: (names) => {
            for (const name of names) globalDiscovered.add(name);
          },
          onBatchComplete: (batch, parsedCount) => {
            if (this.isCancelled()) return;
            newlyCreatedLabels = registry.byName.size - labelsBefore;
            if (Object.keys(batch.annotationsByImage).length > 0) {
              useAnnotationStore
                .getState()
                .appendAnnotationsOnly(batch.annotationsByImage);
            }
            parsedFiles = parsedCount;
            loadedAnnotations += batch.annotationCount;
            this.progress = {
              ...this.progress,
              parsed: parsedFiles,
              loadedAnnotations,
              discoveredLabels: globalDiscovered.size,
              newlyCreatedLabels,
              completedUnits: fileCount + items.length + parsedFiles,
              phaseLabel: '解析标注',
              status: 'parsing',
            };
            updateProgress(this.progress);
          },
        }
      );

      newlyCreatedLabels = registry.byName.size - labelsBefore;

      if (this.isCancelled()) {
        return this.progress;
      }

      useHistoryStore.getState().commitTransaction();
      this.labelTransactionActive = false;
      // 导入不入撤销栈：撤销 IMPORT_LABELS 会删标签并连带清空同 label 的标注
      useHistoryStore.getState().clearHistory();
      useAnnotationStore.setState({ labels: registry.getAllLabels() });

      void import('../storage/autoSave').then((m) => {
        m.markAllImagesDirtyForFolderSave();
        m.notifyProjectDataChanged();
      });

      this.progress = {
        ...this.progress,
        scanned: items.length,
        parsed: parseTargets.length,
        loadedAnnotations,
        discoveredLabels: globalDiscovered.size,
        newlyCreatedLabels,
        completedUnits: totalUnits,
        totalUnits,
        phaseLabel: '导入完成',
        status: 'completed',
      };
      updateProgress(this.progress);

      return this.progress;
    } catch (err) {
      return this.failImport(err);
    }
  }
}

let activeManager: ImportTaskManager | null = null;

export function getActiveImportTaskManager(): ImportTaskManager | null {
  return activeManager;
}

export async function startDatasetImport(files: readonly File[]): Promise<ImportProgress> {
  if (activeManager) {
    activeManager.cancel();
  }
  activeManager = new ImportTaskManager();
  return activeManager.startImport(files);
}

export async function startDatasetImportFromDirectory(
  dirHandle: ProjectDirectoryHandle
): Promise<ImportProgress> {
  if (activeManager) {
    activeManager.cancel();
  }
  activeManager = new ImportTaskManager();
  return activeManager.startImportFromDirectory(dirHandle);
}

export function cancelDatasetImport(): void {
  activeManager?.cancel();
}

export function getMatchedJsonCount(files: readonly File[]): number {
  const index = scanDatasetFiles(sortFilesByMode(files, DEFAULT_FILE_SORT_MODE));
  const items = matchDatasetItems(index, DEFAULT_FILE_SORT_MODE);
  return countMatchedAnnotations(items);
}
