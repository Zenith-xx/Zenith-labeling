<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  formatShortcutKey,
  getShortcutDigitForPageIndex,
  getShortcutStartIndex,
  getShortcutTotalPages,
  getVisibleShortcutLabels,
  logShortcutLabelDebug,
  parseShortcutDigit,
} from '@/utils/labelShortcut';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import './index.css';

const annotationStore = useAnnotationStore();
const promptRef = ref<HTMLDivElement | null>(null);

const totalPages = computed(() => getShortcutTotalPages(annotationStore.labels.length));
const visibleLabels = computed(() =>
  getVisibleShortcutLabels(annotationStore.labels, annotationStore.shortcutPage)
);
const startIndex = computed(() => getShortcutStartIndex(annotationStore.shortcutPage));

watch(
  () =>
    [
      annotationStore.waitingForLabel,
      annotationStore.labels.length,
      annotationStore.shortcutPage,
    ] as const,
  ([waiting]) => {
    if (!waiting) return;
    logShortcutLabelDebug(
      'LabelShortcutPrompt',
      annotationStore.labels.length,
      annotationStore.shortcutPage
    );
    nextTick(() => {
      promptRef.value?.focus();
    });
  }
);

function handlePromptKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    handleCancel();
    return;
  }

  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement &&
    active.classList.contains('label-shortcut-group-input')
  ) {
    return;
  }

  const digit = parseShortcutDigit(event.key);
  if (digit !== null) {
    event.preventDefault();
    event.stopPropagation();
    annotationStore.confirmPendingWithShortcutDigit(digit);
  }
}

function handleSelectLabel(digit: number): void {
  annotationStore.confirmPendingWithShortcutDigit(digit);
}

function handleGroupInputKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    handleCancel();
    (event.currentTarget as HTMLElement).blur();
  }
}

function handleCancel(): void {
  annotationStore.cancelWaitingForLabel();
  (document.activeElement as HTMLElement | null)?.blur();
}

function handleOpenLabelModal(): void {
  annotationStore.openLabelModalFromWaiting();
}
</script>

<template>
  <template v-if="annotationStore.waitingForLabel">
    <div class="label-shortcut-backdrop" @mousedown.stop />

    <div
      ref="promptRef"
      class="label-shortcut-prompt"
      role="dialog"
      aria-label="标签"
      tabindex="-1"
      @keydown="handlePromptKeyDown"
    >
      <p class="label-shortcut-title">
        标签 {{ annotationStore.shortcutPage + 1 }}/{{ totalPages }}
      </p>
      <p class="label-shortcut-meta">共 {{ annotationStore.labels.length }} 个标签</p>

      <label class="label-shortcut-group-field">
        <span class="label-shortcut-group-label">编号</span>
        <input
          class="label-shortcut-group-input"
          type="text"
          inputmode="numeric"
          placeholder="可选"
          :value="annotationStore.pendingGroupIdInput"
          @input="
            annotationStore.setPendingGroupIdInput(
              ($event.target as HTMLInputElement).value
            )
          "
          @keydown="handleGroupInputKeyDown"
        />
      </label>

      <ul v-if="visibleLabels.length > 0" class="label-shortcut-list">
        <li
          v-for="(label, index) in visibleLabels"
          :key="label.id"
          class="label-shortcut-item"
          :title="`选择「${label.name}」`"
          @mousedown.prevent="handleSelectLabel(getShortcutDigitForPageIndex(index))"
        >
          <span class="label-shortcut-key">
            {{ formatShortcutKey(getShortcutDigitForPageIndex(index)) }}
          </span>
          <span class="label-shortcut-name">{{ label.name }}</span>
        </li>
      </ul>
      <p v-else class="label-shortcut-empty">暂无标签</p>

      <p v-if="totalPages > 1" class="label-shortcut-hint">
        滚轮切换更多标签（{{ startIndex + 1 }}–{{
          Math.min(startIndex + visibleLabels.length, annotationStore.labels.length)
        }}）
      </p>

      <div class="label-shortcut-actions">
        <button
          type="button"
          class="label-shortcut-cancel-btn"
          @mousedown.prevent
          @click="handleCancel"
        >
          取消
        </button>
        <button
          type="button"
          class="label-shortcut-open-modal"
          @mousedown.prevent
          @click="handleOpenLabelModal"
        >
          标签选择添加…
        </button>
      </div>
    </div>
  </template>
</template>
