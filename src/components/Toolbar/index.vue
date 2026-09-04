<script setup lang="ts">
import { ref, computed } from 'vue';
import { Tooltip, Popconfirm, message } from 'ant-design-vue';
import {
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Move,
  Square,
  Pentagon,
  Diamond,
  CircleDot,
  X,
  Trash2,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  HardDrive,
} from 'lucide-vue-next';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAiStore } from '@/store/useAiStore';
import {
  pickProjectFolder,
  startDatasetImport,
  startDatasetImportFromDirectory,
} from '@/importer';
import { bindRestoredProjectFolder, projectNeedsFolderBind } from '@/storage/projectRestore';
import { isUserCancel } from '@/utils/filePicker';
import { DeleteAnnotationsCommand } from '@/history';
import type { ToolType } from '@/types';
import './index.css';

interface ToolItem {
  id: ToolType | 'deleteSelected';
  label: string;
  action?: 'clear' | 'deleteSelected';
}

const props = defineProps<{
  onPickFolderAfterRestore?: () => Promise<void>;
}>();

const tools: ToolItem[] = [
  { id: 'select', label: '编辑方框 / 移动图片 (悬停选中，Ctrl+悬停多选)' },
  { id: 'rectangle', label: '矩形框 (R)' },
  { id: 'obb', label: '旋转框 (B)' },
  { id: 'polygon', label: '多边形 (P)' },
  { id: 'point', label: '关键点 (O)' },
  { id: 'deleteSelected', label: '删除选中方框 (Delete)', action: 'deleteSelected' },
  { id: 'delete', label: '清空当前图片标注', action: 'clear' },
];

const annotationStore = useAnnotationStore();
const historyStore = useHistoryStore();
const projectStore = useProjectStore();
const aiStore = useAiStore();

const loading = ref(false);

const needsFolderBind = computed(() => projectNeedsFolderBind(annotationStore.imageList));

const canGoPrevious = computed(() => annotationStore.currentImageIndex > 0);

const canGoNext = computed(
  () =>
    annotationStore.imageList.length > 0 &&
    annotationStore.currentImageIndex >= 0 &&
    annotationStore.currentImageIndex < annotationStore.imageList.length - 1
);

const canUseShapeTools = computed(
  () => annotationStore.currentImage != null && Boolean(annotationStore.currentImage.file)
);

const canUseAnnotationActions = computed(
  () => canUseShapeTools.value && annotationStore.labels.length > 0
);

const isLabelPickerActive = computed(
  () => annotationStore.waitingForLabel || annotationStore.labelModalOpen
);

const annotationActionBlockedTooltip = computed(() => {
  if (!annotationStore.currentImage) {
    return needsFolderBind.value ? '请先选择图片文件夹' : '请先上传图片';
  }
  if (!annotationStore.currentImage.file) {
    return '当前图片文件未关联，请重新打开文件夹';
  }
  if (annotationStore.labels.length === 0) {
    return '请先上传标签';
  }
  return null;
});

const showLabelsTooltip = computed(
  () =>
    annotationActionBlockedTooltip.value ??
    (annotationStore.showLabels ? '隐藏标签 (Ctrl+L)' : '显示标签 (Ctrl+L)')
);

const folderAutoSaveTooltip = computed(() => {
  if (!projectStore.projectDirHandle) {
    return '请打开文件夹以启用自动保存';
  }
  return projectStore.autoSaveToFolder
    ? '自动保存：开（写入图片目录 .json）'
    : '自动保存：关';
});

const openFolderTooltip = computed(() =>
  needsFolderBind.value ? '选择图片文件夹（恢复项目）' : '打开文件夹'
);

function isShapeTool(id: ToolItem['id']): boolean {
  return id === 'rectangle' || id === 'polygon' || id === 'obb' || id === 'point';
}

function toolTooltip(tool: ToolItem): string {
  if (isShapeTool(tool.id) && !canUseShapeTools.value) {
    return annotationActionBlockedTooltip.value ?? '请先上传图片';
  }
  return tool.label;
}

function deleteSelectedTooltip(tool: ToolItem): string {
  if (annotationActionBlockedTooltip.value) {
    return annotationActionBlockedTooltip.value;
  }
  if (annotationStore.selectedAnnotationIds.length > 0) {
    return `${tool.label} (${annotationStore.selectedAnnotationIds.length})`;
  }
  return tool.label;
}

async function handleOpenFolder(): Promise<void> {
  if (loading.value || isLabelPickerActive.value) return;
  loading.value = true;
  try {
    if (needsFolderBind.value) {
      if (props.onPickFolderAfterRestore) {
        await props.onPickFolderAfterRestore();
      } else {
        const picked = await pickProjectFolder();
        const result = await bindRestoredProjectFolder(picked);
        message.success(
          `已关联 ${result.matched} 张图片` +
            (result.added > 0 ? `，新增 ${result.added} 张` : '') +
            (result.missing > 0 ? `（${result.missing} 张待匹配）` : '')
        );
      }
      return;
    }

    const picked = await pickProjectFolder();
    loading.value = false;

    const importPromise =
      picked.kind === 'files'
        ? startDatasetImport(picked.files)
        : startDatasetImportFromDirectory(picked.dirHandle);

    void importPromise.then((result) => {
      if (result.status === 'cancelled') return;
      if (result.status === 'error') {
        message.error(result.errorMessage ?? '加载文件夹失败');
        return;
      }
      message.success(
        `数据集导入完成：${result.scanned} 张图片、${result.loadedAnnotations} 条标注` +
          (result.discoveredLabels > 0
            ? `；发现 ${result.discoveredLabels} 个标签，新增 ${result.newlyCreatedLabels} 个`
            : '')
      );
    });
  } catch (err) {
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : '加载文件夹失败');
  } finally {
    loading.value = false;
  }
}

function handleDeleteSelected(): void {
  if (isLabelPickerActive.value) return;
  const { currentImage, labels, annotationsByImage } = useAnnotationStore.getState();
  if (!currentImage) {
    message.warning('请先选择图片');
    return;
  }
  if (labels.length === 0) {
    message.warning('请先上传标签');
    return;
  }
  if (annotationStore.selectedAnnotationIds.length === 0) {
    message.warning('请先选中要删除的方框');
    return;
  }
  const anns = annotationsByImage[currentImage.id] ?? [];
  const toDelete = anns.filter((ann) =>
    annotationStore.selectedAnnotationIds.includes(ann.id)
  );
  if (toDelete.length === 0) {
    message.warning('未找到选中的标注');
    return;
  }
  historyStore.executeCommand(
    new DeleteAnnotationsCommand(currentImage.id, toDelete, [
      ...annotationStore.selectedAnnotationIds,
    ])
  );
  message.success(`已删除 ${toDelete.length} 个标注`);
}

function handleClear(): void {
  if (isLabelPickerActive.value) return;
  const { currentImage, labels } = useAnnotationStore.getState();
  if (!currentImage) {
    message.warning('请先选择图片');
    return;
  }
  if (labels.length === 0) {
    message.warning('请先上传标签');
    return;
  }
  annotationStore.clearCurrentImageAnnotations();
  message.success('已清空当前图片标注');
}

function setCurrentTool(tool: ToolType): void {
  if (isLabelPickerActive.value) return;
  annotationStore.setCurrentTool(tool);
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-tools" :class="{ 'is-locked': isLabelPickerActive }">
      <Tooltip :title="openFolderTooltip" placement="right">
        <button
          class="toolbar-btn"
          :class="{ active: needsFolderBind || projectStore.isAwaitingFolderBind }"
          tabindex="-1"
          :disabled="loading || isLabelPickerActive"
          @click="handleOpenFolder"
        >
          <FolderOpen :size="20" />
        </button>
      </Tooltip>
      <Tooltip title="上一张 (A)" placement="right">
        <button
          class="toolbar-btn"
          tabindex="-1"
          :disabled="!canGoPrevious || isLabelPickerActive"
          @click="annotationStore.goToPreviousImage"
        >
          <ChevronLeft :size="20" />
        </button>
      </Tooltip>
      <Tooltip title="下一张 (D)" placement="right">
        <button
          class="toolbar-btn"
          tabindex="-1"
          :disabled="!canGoNext || isLabelPickerActive"
          @click="annotationStore.goToNextImage"
        >
          <ChevronRight :size="20" />
        </button>
      </Tooltip>
      <Tooltip title="撤销 Ctrl+Z" placement="right">
        <button
          class="toolbar-btn"
          tabindex="-1"
          :disabled="!historyStore.canUndo || isLabelPickerActive"
          @click="historyStore.undo"
        >
          <Undo2 :size="20" />
        </button>
      </Tooltip>
      <Tooltip title="重做 Ctrl+Y" placement="right">
        <button
          class="toolbar-btn"
          tabindex="-1"
          :disabled="!historyStore.canRedo || isLabelPickerActive"
          @click="historyStore.redo"
        >
          <Redo2 :size="20" />
        </button>
      </Tooltip>
      <Tooltip :title="showLabelsTooltip" placement="right">
        <button
          class="toolbar-btn"
          :class="{ active: annotationStore.showLabels && canUseAnnotationActions }"
          tabindex="-1"
          :disabled="!canUseAnnotationActions || isLabelPickerActive"
          @click="annotationStore.toggleShowLabels"
        >
          <Eye v-if="annotationStore.showLabels" :size="20" />
          <EyeOff v-else :size="20" />
        </button>
      </Tooltip>
      <Tooltip :title="folderAutoSaveTooltip" placement="right">
        <button
          class="toolbar-btn"
          :class="{ active: projectStore.autoSaveToFolder && projectStore.projectDirHandle }"
          tabindex="-1"
          :disabled="!projectStore.projectDirHandle || isLabelPickerActive"
          @click="projectStore.toggleAutoSaveToFolder"
        >
          <HardDrive :size="20" />
        </button>
      </Tooltip>
      <Tooltip title="AI 自动标注" placement="right">
        <button
          class="toolbar-btn"
          :class="{ active: aiStore.panelOpen }"
          tabindex="-1"
          :disabled="isLabelPickerActive"
          @click="aiStore.togglePanel"
        >
          <span class="toolbar-ai-label">AI</span>
        </button>
      </Tooltip>
      <template v-for="tool in tools" :key="tool.id">
        <Popconfirm
          v-if="tool.action === 'clear'"
          title="确定清空当前图片标注？"
          description="仅删除标注对象，标签类别将保留"
          ok-text="确定"
          cancel-text="取消"
          placement="right"
          :disabled="!canUseAnnotationActions || isLabelPickerActive"
          @confirm="handleClear"
        >
          <Tooltip
            :title="annotationActionBlockedTooltip ?? tool.label"
            placement="right"
          >
            <button
              class="toolbar-btn toolbar-btn-danger"
              tabindex="-1"
              :disabled="!canUseAnnotationActions || isLabelPickerActive"
            >
              <Trash2 :size="20" />
            </button>
          </Tooltip>
        </Popconfirm>
        <Tooltip
          v-else-if="tool.action === 'deleteSelected'"
          :title="deleteSelectedTooltip(tool)"
          placement="right"
        >
          <button
            class="toolbar-btn toolbar-btn-danger"
            tabindex="-1"
            :disabled="
              !canUseAnnotationActions ||
              annotationStore.selectedAnnotationIds.length === 0 ||
              isLabelPickerActive
            "
            @click="handleDeleteSelected"
          >
            <X :size="20" />
          </button>
        </Tooltip>
        <Tooltip v-else :title="toolTooltip(tool)" placement="right">
          <button
            class="toolbar-btn"
            :class="{ active: annotationStore.currentTool === tool.id }"
            tabindex="-1"
            :disabled="
              (isShapeTool(tool.id) && !canUseShapeTools) || isLabelPickerActive
            "
            @click="setCurrentTool(tool.id as ToolType)"
          >
            <Move v-if="tool.id === 'select'" :size="20" />
            <Square v-else-if="tool.id === 'rectangle'" :size="20" />
            <Diamond v-else-if="tool.id === 'obb'" :size="20" />
            <Pentagon v-else-if="tool.id === 'polygon'" :size="20" />
            <CircleDot v-else-if="tool.id === 'point'" :size="20" />
          </button>
        </Tooltip>
      </template>
    </div>
  </div>
</template>
