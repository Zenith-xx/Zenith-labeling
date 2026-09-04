<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { Modal, Progress, Button } from 'ant-design-vue';
import { useImportStore } from '@/store/useImportStore';
import {
  cancelDatasetImport,
  getImportProgressDetail,
  getUnifiedImportPercent,
} from '@/importer';
import './index.css';

const importStore = useImportStore();

const progress = computed(() => importStore.progress);
const percent = computed(() =>
  progress.value ? getUnifiedImportPercent(progress.value) : 0
);
const isDone = computed(() => progress.value?.status === 'completed');
const detail = computed(() =>
  progress.value ? getImportProgressDetail(progress.value) : ''
);
const isError = computed(() => progress.value?.status === 'error');
const isCancelled = computed(() => progress.value?.status === 'cancelled');
const canCancel = computed(() => {
  const status = progress.value?.status;
  return (
    status === 'reading' ||
    status === 'scanning' ||
    status === 'matching' ||
    status === 'parsing'
  );
});

let hideTimer: ReturnType<typeof setTimeout> | null = null;

watch([isDone, percent], ([done, value]) => {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!done || value < 100) return;
  hideTimer = setTimeout(() => {
    importStore.hide();
    hideTimer = null;
  }, 1000);
});

onBeforeUnmount(() => {
  if (hideTimer) clearTimeout(hideTimer);
});

function handleCancel(): void {
  if (canCancel.value) {
    cancelDatasetImport();
  } else {
    importStore.hide();
  }
}
</script>

<template>
  <Modal
    v-if="progress"
    :open="importStore.visible"
    :title="isDone ? '数据集导入完成' : '正在导入数据集'"
    :closable="!canCancel"
    :mask-closable="false"
    :width="480"
    centered
    class="import-progress-modal"
    @cancel="handleCancel"
  >
    <div class="import-progress-body">
      <Progress
        :percent="percent"
        :status="isError ? 'exception' : isDone ? 'success' : 'active'"
      />
      <p v-if="!isDone" class="import-progress-detail">{{ detail }}</p>

      <div v-if="isDone" class="import-progress-summary">
        <p>图片：{{ progress.scanned }}</p>
        <p>标注：{{ progress.loadedAnnotations }}</p>
        <p>发现新标签：{{ progress.discoveredLabels }}</p>
        <p>新增标签：{{ progress.newlyCreatedLabels }}</p>
      </div>

      <p v-if="isError" class="import-progress-message import-progress-error">
        {{ progress.errorMessage ?? '导入失败' }}
      </p>
      <p v-if="isCancelled" class="import-progress-message">导入已取消</p>
    </div>

    <template #footer>
      <Button v-if="canCancel" danger @click="cancelDatasetImport">取消导入</Button>
      <Button v-else type="primary" @click="importStore.hide()">关闭</Button>
    </template>
  </Modal>
</template>
