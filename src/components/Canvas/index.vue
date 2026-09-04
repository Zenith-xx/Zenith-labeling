<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useProjectStore } from '@/store/useProjectStore';
import LabelModal from '@/components/LabelModal/index.vue';
import LabelShortcutPrompt from '@/components/LabelShortcutPrompt/index.vue';
import { CanvasController } from './canvasController';

const stageHostRef = ref<HTMLDivElement | null>(null);
const controllerRef = shallowRef<CanvasController | null>(null);
const imageLoading = ref(false);

onMounted(() => {
  const stageHost = stageHostRef.value;
  const layoutRoot = stageHost?.parentElement;
  if (!stageHost || !layoutRoot) return;

  const controller = new CanvasController(
    stageHost,
    layoutRoot,
    (loading) => {
      imageLoading.value = loading;
    }
  );
  controllerRef.value = controller;
});

onBeforeUnmount(() => {
  controllerRef.value?.destroy();
  controllerRef.value = null;
});

const annotationStore = useAnnotationStore();
const projectStore = useProjectStore();
</script>

<template>
  <div class="canvas-area">
    <div ref="stageHostRef" class="canvas-stage-host" />

    <div
      v-if="imageLoading"
      class="canvas-loading"
      :class="{ 'canvas-loading--dim': annotationStore.currentImage }"
    >
      <span class="canvas-loading-text">加载图片中…</span>
    </div>

    <div
      v-if="!annotationStore.currentImage"
      class="canvas-empty"
    >
      <p class="canvas-empty-text">未打开图片</p>
      <p class="canvas-empty-hint">请通过导入或打开文件夹加载图片</p>
    </div>

    <div
      v-if="projectStore.folderBindStatus"
      class="canvas-loading"
      :class="{ 'canvas-loading--dim': annotationStore.currentImage }"
    >
      <span class="canvas-loading-text">
        {{ projectStore.folderBindStatus.message }}
        <template v-if="projectStore.folderBindStatus.total != null && projectStore.folderBindStatus.total > 0">
          （{{ projectStore.folderBindStatus.current ?? 0 }}/{{ projectStore.folderBindStatus.total }}）
        </template>
        <template v-else-if="projectStore.folderBindStatus.current != null && projectStore.folderBindStatus.current > 0">
          （{{ projectStore.folderBindStatus.current }}）
        </template>
      </span>
    </div>

    <LabelShortcutPrompt />
    <LabelModal :shape-type="annotationStore.pendingAnnotation?.shapeType" />
  </div>
</template>

<style scoped src="./index.css"></style>
