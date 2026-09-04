<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from 'ant-design-vue';
import { EditOutlined, SettingOutlined } from '@ant-design/icons-vue';
import VirtualList from '@/components/VirtualList/index.vue';
import LabelSettingsModal from './LabelSettingsModal.vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { labelColorWithListOpacity } from '@/utils/shapeStyle';
import type { Annotation, Label } from '@/types';
import './index.css';

const EMPTY_ANNOTATIONS: Annotation[] = [];
const LABEL_ROW_HEIGHT = 40;

const annotationStore = useAnnotationStore();

const settingsOpen = ref(false);
const settingsInitialLabelId = ref<string | null>(null);

const currentAnnotations = computed(() => {
  const id = annotationStore.currentImage?.id;
  if (!id) return EMPTY_ANNOTATIONS;
  return annotationStore.annotationsByImage[id] ?? EMPTY_ANNOTATIONS;
});

const labelCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const ann of currentAnnotations.value) {
    counts[ann.labelId] = (counts[ann.labelId] ?? 0) + 1;
  }
  return counts;
});

function openSettings(labelId: string | null = null): void {
  settingsInitialLabelId.value = labelId;
  settingsOpen.value = true;
}

function handleEdit(event: MouseEvent, label: Label): void {
  event.stopPropagation();
  openSettings(label.id);
}

function handleCloseSettings(): void {
  settingsOpen.value = false;
  settingsInitialLabelId.value = null;
}
</script>

<template>
  <div class="label-manager sidebar-card">
    <div class="panel-header">
      <span>标签管理</span>
      <Button
        type="text"
        size="small"
        class="label-manager-settings-btn"
        title="标签设置"
        @click="openSettings()"
      >
        <template #icon>
          <SettingOutlined />
        </template>
      </Button>
    </div>

    <VirtualList
      class="label-manager-list"
      :items="annotationStore.labels"
      :item-height="LABEL_ROW_HEIGHT"
      :get-item-key="(label: Label) => label.id"
    >
      <template #empty>
        <div class="label-manager-empty">暂无标签，点击右上角设置添加</div>
      </template>
      <template #item="{ item: label }">
        <div
          class="label-manager-item"
          :style="{ backgroundColor: labelColorWithListOpacity(label.color) }"
        >
          <span class="label-manager-name">
            {{ label.name }}
            <span class="label-manager-count">
              ({{ labelCounts[label.id] ?? 0 }})
            </span>
          </span>
          <div class="label-manager-actions">
            <button
              class="label-manager-action-btn"
              title="编辑"
              @click="handleEdit($event, label)"
            >
              <EditOutlined />
            </button>
          </div>
        </div>
      </template>
    </VirtualList>

    <LabelSettingsModal
      :open="settingsOpen"
      :initial-label-id="settingsInitialLabelId"
      @close="handleCloseSettings"
    />
  </div>
</template>
