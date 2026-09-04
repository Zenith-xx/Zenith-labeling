<script setup lang="ts">
import { ref, watch } from 'vue';
import { Drawer, Spin, Tabs } from 'ant-design-vue';
import { useModelStore } from '@/store/useModelStore';
import ModelConfigForm from './ModelConfigForm.vue';
import ModelTest from './ModelTest.vue';

const props = defineProps<{
  modelId: string | null;
  open: boolean;
  initialTab?: 'config' | 'test';
}>();

const emit = defineEmits<{
  close: [];
}>();

const modelStore = useModelStore();
const saving = ref(false);
const activeTab = ref('config');

watch(
  () => [props.open, props.modelId] as const,
  ([open, modelId]) => {
    if (!open || !modelId) return;
    void modelStore.loadModelDetail(modelId);
    activeTab.value = props.initialTab ?? 'config';
  }
);

async function handleSave(updates: Parameters<typeof modelStore.saveModelConfig>[1]): Promise<void> {
  if (!modelStore.detailModel) return;
  saving.value = true;
  try {
    await modelStore.saveModelConfig(modelStore.detailModel.id, updates);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :title="modelStore.detailModel?.name ?? '模型详情'"
    :open="open"
    :width="480"
    destroy-on-close
    @close="emit('close')"
  >
    <Spin v-if="modelStore.detailLoading && !modelStore.detailModel" />
    <Tabs v-else-if="modelStore.detailModel" v-model:active-key="activeTab">
      <Tabs.TabPane key="config" tab="配置">
        <ModelConfigForm
          :model="modelStore.detailModel"
          :saving="saving"
          @save="handleSave"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="test" tab="测试">
        <ModelTest :model="modelStore.detailModel" />
      </Tabs.TabPane>
    </Tabs>
  </Drawer>
</template>
