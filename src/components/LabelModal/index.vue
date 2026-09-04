<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Modal, Input, Button } from 'ant-design-vue';
import { CheckOutlined, UndoOutlined } from '@ant-design/icons-vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { formatGroupIdInputValue } from '@/utils/annotationDisplay';
import type { Annotation, AnnotationShapeType, Label } from '@/types';
import VirtualList from '@/components/VirtualList/index.vue';
import './index.css';

defineProps<{
  shapeType?: AnnotationShapeType;
}>();

const MODAL_ROW_HEIGHT = 24;

const annotationStore = useAnnotationStore();

const labelText = ref('');
const description = ref('');
const highlightName = ref<string | null>(null);
const scrollToIndex = ref<number | null>(null);
const inputRef = ref<{ input: HTMLInputElement | null } | null>(null);

const displayLabels = computed(() => annotationStore.labels);

function resetForm(): void {
  labelText.value = '';
  description.value = '';
  highlightName.value = null;
  scrollToIndex.value = null;
  annotationStore.setPendingGroupIdInput('');
}

function initFormForCreate(): void {
  const initial = annotationStore.lastUsedLabelName.trim();
  labelText.value = initial;
  description.value = '';
  highlightName.value = initial || null;
}

function getEditingAnnotation(): Annotation | undefined {
  const state = useAnnotationStore.getState();
  const editingId = state.editingAnnotationId;
  const imageId = state.currentImage?.id;
  if (!editingId || !imageId) return undefined;
  return (state.annotationsByImage[imageId] ?? []).find((ann) => ann.id === editingId);
}

function initFormForEdit(): void {
  const ann = getEditingAnnotation();
  const label = ann ? useAnnotationStore.getState().getLabelById(ann.labelId) : undefined;
  const name = label?.name ?? '';
  labelText.value = name;
  description.value = label?.description ?? '';
  highlightName.value = name || null;
  annotationStore.setPendingGroupIdInput(formatGroupIdInputValue(ann?.groupId));
}

function focusInput(): void {
  requestAnimationFrame(() => {
    const el = inputRef.value?.input;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    if (len > 0) {
      el.setSelectionRange(0, len);
    }
  });
}

watch(
  () => [annotationStore.labelModalOpen, annotationStore.editingAnnotationId] as const,
  ([open, editingId]) => {
    if (!open) return;
    if (editingId) {
      initFormForEdit();
    } else {
      initFormForCreate();
    }
    nextTick(focusInput);
  }
);

watch([highlightName, displayLabels], ([name]) => {
  if (!name) {
    scrollToIndex.value = null;
    return;
  }
  const idx = displayLabels.value.findIndex((l) => l.name === name);
  scrollToIndex.value = idx >= 0 ? idx : null;
});

function handleConfirm(): void {
  const trimmed = labelText.value.trim();
  if (!trimmed) return;
  annotationStore.confirmLabelByText(trimmed, description.value);
  resetForm();
}

function handleCancel(): void {
  annotationStore.cancelLabelModal();
  resetForm();
}

function handleLabelClick(name: string): void {
  labelText.value = name;
  highlightName.value = name;
  const label = annotationStore.labels.find((l) => l.name === name);
  description.value = label?.description ?? '';
  inputRef.value?.input?.focus();
}

function handleLabelDoubleClick(name: string): void {
  labelText.value = name;
  annotationStore.confirmLabelByText(name, description.value);
  resetForm();
}

function handleInputKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleConfirm();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (displayLabels.value.length === 0) return;
    event.preventDefault();
    const currentIdx = displayLabels.value.findIndex((l) => l.name === highlightName.value);
    let nextIdx = 0;
    if (event.key === 'ArrowDown') {
      nextIdx = currentIdx < displayLabels.value.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : displayLabels.value.length - 1;
    }
    const next = displayLabels.value[nextIdx];
    labelText.value = next.name;
    highlightName.value = next.name;
    description.value = next.description ?? '';
  }
}

function getLabelKey(label: Label): string {
  return label.id;
}

function handleLabelTextChange(value: string): void {
  labelText.value = value;
  highlightName.value = value.trim() || null;
}

function handleDescriptionChange(value: string): void {
  description.value = value;
}
</script>

<template>
  <Modal
    :title="annotationStore.editingAnnotationId ? '修改' : '选择标签'"
    :open="annotationStore.labelModalOpen"
    :width="360"
    :footer="null"
    :mask="false"
    destroy-on-close
    class="label-modal"
    @cancel="handleCancel"
    @after-close="resetForm"
  >
    <div class="label-modal-body">
      <div class="label-modal-tag-row">
        <Input
          ref="inputRef"
          class="label-modal-input label-modal-tag-input"
          placeholder="输入对象标签"
          :value="labelText"
          :maxlength="50"
          @update:value="handleLabelTextChange"
          @keydown="handleInputKeyDown"
        />
        <Input
          class="label-modal-input label-modal-group-input"
          placeholder="编号"
          :value="annotationStore.pendingGroupIdInput"
          inputmode="numeric"
          @update:value="annotationStore.setPendingGroupIdInput"
        />
      </div>

      <Input.TextArea
        class="label-modal-description"
        placeholder="标签描述"
        :value="description"
        :rows="2"
        :maxlength="200"
        @update:value="handleDescriptionChange"
      />

      <div class="label-modal-actions">
        <Button
          class="label-modal-confirm-btn"
          :disabled="!labelText.trim()"
          @click="handleConfirm"
        >
          <template #icon><CheckOutlined /></template>
          确认
        </Button>
        <Button class="label-modal-cancel-btn" @click="handleCancel">
          <template #icon><UndoOutlined /></template>
          取消
        </Button>
      </div>

      <VirtualList
        class="label-modal-list"
        :items="displayLabels"
        :item-height="MODAL_ROW_HEIGHT"
        :get-item-key="getLabelKey"
        :scroll-to-index="scrollToIndex"
      >
        <template #default="{ item: label }">
          <div
            class="label-modal-item"
            :class="{ active: highlightName === label.name }"
            @click="handleLabelClick(label.name)"
            @dblclick="handleLabelDoubleClick(label.name)"
          >
            <span class="label-modal-name">{{ label.name }}</span>
          </div>
        </template>
        <template #empty>
          <div class="label-modal-empty">暂无标签，输入名称后确认将新建</div>
        </template>
      </VirtualList>
    </div>
  </Modal>
</template>
