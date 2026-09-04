<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAiStore } from '@/store/useAiStore';
import { useImportStore } from '@/store/useImportStore';
import './index.css';

const toolNames: Record<string, string> = {
  select: '编辑方框',
  rectangle: '矩形框',
  polygon: '多边形',
  obb: '旋转框',
  point: '关键点',
};

function formatFolderSaveStatus(
  projectDirHandle: FileSystemDirectoryHandle | null,
  autoSaveToFolder: boolean,
  folderSaveError: string | null
): string {
  if (!projectDirHandle) {
    return '本地 JSON：未连接（请用 Chrome/Edge 打开文件夹）';
  }
  if (!autoSaveToFolder) {
    return `本地 JSON：已关闭（${projectDirHandle.name}）`;
  }
  if (folderSaveError) {
    return `本地 JSON：失败（${folderSaveError}）`;
  }
  return `本地 JSON：自动保存 → ${projectDirHandle.name}`;
}

const annotationStore = useAnnotationStore();
const projectStore = useProjectStore();
const aiStore = useAiStore();
const importStore = useImportStore();

const imageSize = computed(() =>
  annotationStore.currentImage
    ? `${annotationStore.currentImage.width} × ${annotationStore.currentImage.height}`
    : null
);

const folderSaveStatus = computed(() =>
  formatFolderSaveStatus(
    projectStore.projectDirHandle,
    projectStore.autoSaveToFolder,
    projectStore.folderSaveError
  )
);

const indexedDbStatus = computed(() => {
  const folderBindStatus = projectStore.folderBindStatus;
  if (folderBindStatus) {
    return (
      folderBindStatus.message +
      (folderBindStatus.total != null && folderBindStatus.total > 0
        ? ` ${folderBindStatus.current ?? 0}/${folderBindStatus.total}`
        : folderBindStatus.current != null && folderBindStatus.current > 0
          ? ` ${folderBindStatus.current}`
          : '')
    );
  }
  if (projectStore.isAwaitingFolderBind) {
    return 'IndexedDB：已恢复，等待选择图片文件夹';
  }
  if (projectStore.lastSavedAt) {
    return `IndexedDB：已保存 ${new Date(projectStore.lastSavedAt).toLocaleString()}`;
  }
  return 'IndexedDB：未保存';
});

const annotationImportStatus = computed(() => {
  const importProgress = importStore.progress;
  if (
    importProgress?.status === 'parsing' &&
    importProgress.totalJson > 0 &&
    importProgress.scanned >= importProgress.totalImages
  ) {
    return `标注加载 ${importProgress.parsed}/${importProgress.totalJson}`;
  }
  return null;
});
</script>

<template>
  <div class="statusbar">
    <span class="status-item">
      <span class="status-label">工具:</span>
      {{ toolNames[annotationStore.currentTool] ?? annotationStore.currentTool }}
      <template v-if="aiStore.predicting"> · AI 推理中</template>
    </span>
    <span class="status-divider">|</span>
    <span class="status-item">
      <span class="status-label">缩放:</span>
      {{ Math.round(annotationStore.zoom * 100) }}%
      <span class="status-hint"> (Ctrl+滚轮)</span>
    </span>
    <span class="status-divider">|</span>
    <span class="status-item">
      <span class="status-label">坐标:</span>
      ({{ annotationStore.mousePosition.x }}, {{ annotationStore.mousePosition.y }})
    </span>
    <span class="status-divider">|</span>
    <span class="status-item">
      <span class="status-label">图片:</span>
      {{ imageSize ?? '未加载' }}
    </span>
    <template v-if="annotationImportStatus">
      <span class="status-divider">|</span>
      <span class="status-item">
        <span class="status-label">导入:</span>
        {{ annotationImportStatus }}
      </span>
    </template>
    <span class="status-divider">|</span>
    <span
      class="status-item"
      :class="{ 'status-item-error': projectStore.folderSaveError }"
    >
      <span class="status-label">保存:</span>
      {{ projectStore.isSaving ? '写入中…' : folderSaveStatus }}
    </span>
    <span class="status-divider">|</span>
    <span class="status-item">
      <span class="status-label">快照:</span>
      {{ indexedDbStatus }}
    </span>
  </div>
</template>
