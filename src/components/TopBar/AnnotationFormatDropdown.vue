<script setup lang="ts">
import { computed, onUnmounted, useId } from 'vue';
import { Tag } from 'lucide-vue-next';
import type { FormatMenuGroup, FormatMenuItem } from './formatMenuTypes';
import type { MenuOpenChange } from './menuOpen';
import './YoloFormatDropdown.css';

const CLOSE_DELAY_MS = 120;

const props = withDefaults(
  defineProps<{
    groups: FormatMenuGroup[];
    openId: string | null;
    onOpenChange: MenuOpenChange;
    menuId?: string;
    minWidth?: number;
  }>(),
  {
    minWidth: 200,
  }
);

const emit = defineEmits<{
  select: [id: string];
}>();

const generatedId = useId();
const id = computed(() => props.menuId ?? generatedId);
const isOpen = computed(() => props.openId === id.value);

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function open(): void {
  clearCloseTimer();
  props.onOpenChange(id.value);
}

function scheduleClose(): void {
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    props.onOpenChange((prev) => (prev === id.value ? null : prev));
  }, CLOSE_DELAY_MS);
}

function handleSelect(item: FormatMenuItem): void {
  if (item.disabled) return;
  props.onOpenChange(null);
  emit('select', item.id);
}

onUnmounted(() => clearCloseTimer());
</script>

<template>
  <div
    class="yolo-format-dropdown"
    :class="{ 'is-open': isOpen }"
    @mouseenter="open"
    @mouseleave="scheduleClose"
  >
    <div class="yolo-format-trigger">
      <slot />
    </div>
    <div
      class="yolo-format-menu"
      role="menu"
      :aria-hidden="!isOpen"
      :style="{ minWidth: `${minWidth}px` }"
    >
      <div v-for="(group, groupIndex) in groups" :key="groupIndex">
        <div v-if="groupIndex > 0" class="yolo-format-divider" />
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          role="menuitem"
          tabindex="-1"
          class="yolo-format-item"
          :class="{ disabled: item.disabled }"
          :disabled="item.disabled"
          @mousedown.prevent
          @click="handleSelect(item)"
        >
          <span class="yolo-format-icon">
            <Tag :size="12" />
          </span>
          <span class="yolo-format-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
