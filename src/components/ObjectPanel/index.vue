<script setup lang="ts">
import { computed } from 'vue';
import { Checkbox } from 'ant-design-vue';
import VirtualList from '@/components/VirtualList/index.vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import {
  DeleteAnnotationCommand,
  HideAnnotationCommand,
  ShowAnnotationCommand,
} from '@/history';
import { themeColors } from '@/constants/theme';
import { labelColorWithListOpacity } from '@/utils/shapeStyle';
import { formatObjectPanelLabel } from '@/utils/annotationDisplay';
import type { Annotation } from '@/types';
import './index.css';

const OBJECT_ROW_HEIGHT = 36;

interface ObjectRow {
  key: string;
  annotationId: string;
  labelId: string;
  shapeType: Annotation['shapeType'];
  x: number;
  y: number;
  width: number;
  height: number;
  points?: number[];
  hidden?: boolean;
  labelName: string;
  labelColor: string;
  groupId?: number;
}

const annotationStore = useAnnotationStore();
const historyStore = useHistoryStore();

const annotations = computed(() => {
  if (!annotationStore.currentImage) return [] as Annotation[];
  return (
    annotationStore.annotationsByImage[annotationStore.currentImage.id] ?? []
  );
});

const labelsById = computed(
  () => new Map(annotationStore.labels.map((label) => [label.id, label]))
);

const displayRows = computed((): ObjectRow[] => {
  const byId = labelsById.value;
  const rows: ObjectRow[] = [];

  for (const ann of annotations.value) {
    const label = byId.get(ann.labelId);
    const labelName = label?.name ?? '未知';
    const labelColor = label?.color ?? themeColors.primary;

    rows.push({
      key: ann.id,
      annotationId: ann.id,
      labelId: ann.labelId,
      shapeType: ann.shapeType,
      x: ann.x,
      y: ann.y,
      width: ann.width,
      height: ann.height,
      points: ann.points,
      hidden: ann.hidden,
      labelName,
      labelColor,
      groupId: ann.groupId,
    });
  }

  return rows;
});

const selectedIndex = computed(() => {
  if (!annotationStore.selectedAnnotation) return null;
  const idx = displayRows.value.findIndex(
    (row) => row.annotationId === annotationStore.selectedAnnotation
  );
  return idx >= 0 ? idx : null;
});

function isActive(annotationId: string): boolean {
  return annotationStore.selectedAnnotationIds.includes(annotationId);
}

function selectAnnotation(annotationId: string): void {
  annotationStore.setSelectedAnnotation(annotationId);
  annotationStore.setSelectedKeypointIndex(null);
}

function openEdit(annotationId: string, event: MouseEvent): void {
  event.stopPropagation();
  annotationStore.setSelectedAnnotation(annotationId);
  annotationStore.openEditLabelModal(annotationId);
}

function toggleVisibility(item: ObjectRow, checked: boolean): void {
  const currentImage = annotationStore.currentImage;
  if (!currentImage) return;

  if (checked) {
    historyStore.executeCommand(
      new ShowAnnotationCommand(
        currentImage.id,
        item.annotationId,
        annotationStore.captureViewSnapshot()
      )
    );
  } else {
    historyStore.executeCommand(
      new HideAnnotationCommand(
        currentImage.id,
        item.annotationId,
        annotationStore.selectedAnnotation === item.annotationId
      )
    );
  }
}

function deleteAnnotation(item: ObjectRow, event: MouseEvent): void {
  event.stopPropagation();
  const currentImage = annotationStore.currentImage;
  if (!currentImage) return;

  historyStore.executeCommand(
    new DeleteAnnotationCommand(
      currentImage.id,
      {
        id: item.annotationId,
        labelId: item.labelId,
        shapeType: item.shapeType,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        points: item.points,
        hidden: item.hidden,
        groupId: item.groupId,
      },
      annotationStore.selectedAnnotation === item.annotationId
    )
  );
}
</script>

<template>
  <div class="object-panel sidebar-card">
    <div class="panel-header">
      对象
      <span class="object-count">{{ annotations.length }}</span>
    </div>

    <VirtualList
      class="object-list"
      :items="displayRows"
      :item-height="OBJECT_ROW_HEIGHT"
      :scroll-to-index="selectedIndex"
      :get-item-key="(item: ObjectRow) => item.key"
    >
      <template #empty>
        <div class="object-empty">暂无标注对象</div>
      </template>
      <template #item="{ item }">
        <div
          class="object-item panel-select-item"
          :class="{
            active: isActive(item.annotationId),
            hidden: item.hidden,
          }"
          :style="
            isActive(item.annotationId)
              ? undefined
              : { backgroundColor: labelColorWithListOpacity(item.labelColor) }
          "
          @click="selectAnnotation(item.annotationId)"
          @dblclick="openEdit(item.annotationId, $event)"
        >
          <Checkbox
            :checked="!item.hidden"
            class="panel-checkbox object-checkbox"
            @click.stop
            @change="(e) => toggleVisibility(item, e.target.checked)"
          />
          <span class="object-label">
            {{ formatObjectPanelLabel(item.labelName, item.groupId) }}
          </span>
          <button class="object-delete" @click="deleteAnnotation(item, $event)">
            ×
          </button>
        </div>
      </template>
    </VirtualList>
  </div>
</template>
