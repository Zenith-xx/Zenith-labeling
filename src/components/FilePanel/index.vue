<script setup lang="ts">
import { computed, ref } from 'vue';
import { Checkbox, Input } from 'ant-design-vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import VirtualList from '@/components/VirtualList/index.vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { measureMaxTextWidth } from '@/utils/measureTextWidth';
import type { ImageFile } from '@/types';
import './index.css';

const FILE_ITEM_HEIGHT = 34;
const FILE_ROW_EXTRA_WIDTH = 46;

const annotationStore = useAnnotationStore();
const search = ref('');

const filteredList = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return annotationStore.imageList;
  return annotationStore.imageList.filter((file) =>
    file.name.toLowerCase().includes(keyword)
  );
});

const isSearching = computed(() => search.value.trim().length > 0);

const filteredScrollIndex = computed(() => {
  const currentImage = annotationStore.currentImage;
  if (!currentImage) return undefined;
  const index = filteredList.value.findIndex((file) => file.id === currentImage.id);
  return index >= 0 ? index : undefined;
});

const listContentWidth = computed(() => {
  if (filteredList.value.length === 0) return undefined;
  const maxTextWidth = measureMaxTextWidth(filteredList.value.map((f) => f.name));
  return Math.ceil(maxTextWidth) + FILE_ROW_EXTRA_WIDTH;
});

const listScrollIndex = computed(() => {
  if (isSearching.value) return filteredScrollIndex.value;
  const index = annotationStore.currentImageIndex;
  return index >= 0 ? index : undefined;
});

const currentIndex = computed(() =>
  annotationStore.currentImageIndex >= 0
    ? annotationStore.currentImageIndex + 1
    : 0
);

function selectFile(file: ImageFile): void {
  annotationStore.setCurrentImage(file);
}
</script>

<template>
  <div class="file-panel sidebar-card">
    <div class="panel-header">
      <span>文件</span>
      <span v-if="annotationStore.imageList.length > 0" class="file-count">
        {{
          isSearching
            ? `${filteredList.length}/${annotationStore.imageList.length}`
            : `${currentIndex}/${annotationStore.imageList.length}`
        }}
      </span>
    </div>

    <div class="file-search">
      <Input
        allow-clear
        size="small"
        placeholder="搜索文件名"
        v-model:value="search"
        class="file-search-input"
      >
        <template #prefix>
          <SearchOutlined class="file-search-icon" />
        </template>
      </Input>
    </div>

    <VirtualList
      class="file-list"
      :items="filteredList"
      :item-height="FILE_ITEM_HEIGHT"
      :scroll-to-index="listScrollIndex"
      horizontal-scroll
      :content-min-width="listContentWidth"
      :get-item-key="(file: ImageFile) => file.id"
    >
      <template #empty>
        <div class="file-empty">
          {{ isSearching ? '未找到匹配文件' : '暂无图片文件' }}
        </div>
      </template>
      <template #item="{ item: file }">
        <div
          class="file-item panel-select-item"
          :class="{ active: annotationStore.currentImage?.id === file.id }"
          @click="selectFile(file)"
        >
          <Checkbox
            :checked="annotationStore.annotatedImageIds[file.id] === true"
            disabled
            class="panel-checkbox file-checkbox"
            @click.stop
          />
          <span class="file-name">{{ file.name }}</span>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
