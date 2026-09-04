<script setup lang="ts">
import { computed, onUnmounted } from 'vue';
import { Check, ChevronDown, Monitor, Moon, Palette, Sun } from 'lucide-vue-next';
import { useThemeStore, type ThemeMode } from '@/store/useThemeStore';
import type { MenuOpenChange } from '@/components/TopBar/menuOpen';
import './index.css';

const OPTIONS: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: '浅色', icon: Sun },
  { key: 'dark', label: '深色', icon: Moon },
  { key: 'system', label: '跟随系统', icon: Monitor },
];

const THEME_MENU_ID = 'theme-menu';
const CLOSE_DELAY_MS = 120;

const props = defineProps<{
  openId: string | null;
  onOpenChange: MenuOpenChange;
}>();

const themeStore = useThemeStore();
const isOpen = computed(() => props.openId === THEME_MENU_ID);

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function open(): void {
  clearCloseTimer();
  props.onOpenChange(THEME_MENU_ID);
}

function scheduleClose(): void {
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    props.onOpenChange((prev) => (prev === THEME_MENU_ID ? null : prev));
  }, CLOSE_DELAY_MS);
}

function selectMode(mode: ThemeMode): void {
  themeStore.setMode(mode);
  props.onOpenChange(null);
}

onUnmounted(() => clearCloseTimer());
</script>

<template>
  <div
    class="theme-switcher"
    :class="{ 'is-open': isOpen }"
    @mouseenter="open"
    @mouseleave="scheduleClose"
  >
    <button
      type="button"
      class="theme-switcher-btn"
      title="主题"
      tabindex="-1"
      @mousedown.prevent
    >
      <Palette :size="14" />
      <span>主题</span>
      <ChevronDown class="theme-switcher-caret" :size="10" />
    </button>
    <div class="theme-switcher-menu" role="menu" :aria-hidden="!isOpen">
      <button
        v-for="opt in OPTIONS"
        :key="opt.key"
        type="button"
        role="menuitem"
        tabindex="-1"
        class="theme-switcher-option"
        :class="{ active: themeStore.mode === opt.key }"
        @mousedown.prevent
        @click="selectMode(opt.key)"
      >
        <component :is="opt.icon" :size="14" />
        <span>{{ opt.label }}</span>
        <Check
          v-if="themeStore.mode === opt.key"
          class="theme-switcher-check"
          :size="12"
        />
      </button>
    </div>
  </div>
</template>
