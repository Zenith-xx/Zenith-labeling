<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { ConfigProvider, theme as antdTheme } from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import AnnotationPage from '@/views/Annotation/index.vue';
import { getAntdThemeToken } from '@/constants/theme';
import { markEmbeddedDocument } from '@/utils/embedContext';
import { initEmbedThemeSync } from '@/utils/embedThemeSync';
import { initThemeSystemListener, useThemeStore } from '@/store/useThemeStore';

const themeStore = useThemeStore();

const antdConfig = computed(() => ({
  locale: zhCN,
  theme: {
    algorithm:
      themeStore.resolved === 'dark'
        ? antdTheme.darkAlgorithm
        : antdTheme.defaultAlgorithm,
    token: getAntdThemeToken(themeStore.resolved),
  },
}));

let removeThemeListener: (() => void) | undefined;
let removeEmbedThemeSync: (() => void) | undefined;

onMounted(() => {
  markEmbeddedDocument();
  removeThemeListener = initThemeSystemListener();
  removeEmbedThemeSync = initEmbedThemeSync();
});

onUnmounted(() => {
  removeThemeListener?.();
  removeEmbedThemeSync?.();
});
</script>

<template>
  <div class="app-root">
    <ConfigProvider v-bind="antdConfig">
      <AnnotationPage />
    </ConfigProvider>
  </div>
</template>

<style>
.app-root {
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.app-root > * {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
