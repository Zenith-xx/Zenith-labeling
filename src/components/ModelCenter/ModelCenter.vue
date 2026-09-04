<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Button,
  Col,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { Upload as UploadIcon } from 'lucide-vue-next';
import { useModelStore } from '@/store/useModelStore';
import type { AiModel } from '@/features/modelCenter/types';
import ModelCard from './ModelCard.vue';
import ModelDetail from './ModelDetail.vue';
import './ModelCenter.css';

const { Title, Text } = Typography;

const modelStore = useModelStore();

const detailOpen = ref(false);
const detailModelId = ref<string | null>(null);
const detailTab = ref<'config' | 'test'>('config');
const selectedId = ref<string | null>(null);

watch(
  () => modelStore.centerOpen,
  (open) => {
    if (!open) return;
    void modelStore.ensureModels();
  }
);

const filteredModels = computed(() => {
  const keyword = modelStore.search.trim().toLowerCase();
  return modelStore.models
    .filter((model) => {
      if (modelStore.taskFilter !== 'all' && model.task !== modelStore.taskFilter) {
        return false;
      }
      if (modelStore.formatFilter !== 'all' && model.format !== modelStore.formatFilter) {
        return false;
      }
      if (!keyword) return true;
      return (
        model.name.toLowerCase().includes(keyword) ||
        model.fileName.toLowerCase().includes(keyword) ||
        model.classes.some((c) => c.toLowerCase().includes(keyword))
      );
    })
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
});

function openDetail(model: AiModel, tab: 'config' | 'test' = 'config'): void {
  detailModelId.value = model.id;
  detailTab.value = tab;
  detailOpen.value = true;
}

async function handleUpload(file: File): Promise<void> {
  try {
    await modelStore.uploadModel(file, false);
    message.success(`模型 ${file.name} 上传成功`);
    await modelStore.refreshModels();
  } catch (err) {
    if (err instanceof Error && err.message.includes('已存在')) {
      Modal.confirm({
        title: '覆盖模型',
        content: `模型 ${file.name} 已存在，是否覆盖？`,
        okText: '覆盖',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          await modelStore.uploadModel(file, true);
          message.success('模型已覆盖');
          await modelStore.refreshModels();
        },
      });
      return;
    }
    message.error(err instanceof Error ? err.message : '上传失败');
  }
}

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  void handleUpload(file as File);
  return false;
};

function confirmDelete(model: AiModel): void {
  Modal.confirm({
    title: '删除模型',
    content: `确定删除模型「${model.name}」？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await modelStore.removeModel(model.id);
      message.success('模型已删除');
    },
  });
}

async function handleSetDefault(model: AiModel): Promise<void> {
  await modelStore.makeDefault(model.id);
  message.success('已设为默认模型');
}
</script>

<template>
  <Modal
    :open="modelStore.centerOpen"
    :footer="null"
    :width="1080"
    class="model-center-modal"
    :title="null"
    @cancel="modelStore.setCenterOpen(false)"
  >
    <div class="model-center">
      <div class="model-center-header">
        <div>
          <Title :level="4" style="margin: 0">AI 模型中心</Title>
          <Text type="secondary">管理模型文件、推理配置与测试</Text>
        </div>
        <Space>
          <Button :loading="modelStore.loading" @click="modelStore.refreshModels()">
            刷新
          </Button>
          <Upload accept=".pt,.pth,.onnx" :show-upload-list="false" :before-upload="beforeUpload">
            <Button type="primary" :loading="modelStore.uploading">
              <template #icon>
                <UploadIcon :size="16" />
              </template>
              上传模型
            </Button>
          </Upload>
        </Space>
      </div>

      <div class="model-center-filters">
        <Input
          allow-clear
          placeholder="搜索模型名称、文件名、类别"
          :value="modelStore.search"
          style="width: 280px"
          @update:value="modelStore.setSearch"
        />
        <Select
          :value="modelStore.taskFilter"
          style="width: 140px"
          :options="[
            { label: '全部任务', value: 'all' },
            { label: 'Detect', value: 'detect' },
            { label: 'OBB', value: 'obb' },
            { label: 'Seg', value: 'seg' },
            { label: 'Pose', value: 'pose' },
          ]"
          @change="(v) => modelStore.setTaskFilter(v as string)"
        />
        <Select
          :value="modelStore.formatFilter"
          style="width: 120px"
          :options="[
            { label: '全部格式', value: 'all' },
            { label: 'PT', value: 'pt' },
            { label: 'ONNX', value: 'onnx' },
          ]"
          @change="(v) => modelStore.setFormatFilter(v as string)"
        />
      </div>

      <div v-if="modelStore.loading && modelStore.models.length === 0" class="model-center-loading">
        <Spin />
      </div>
      <Empty
        v-else-if="filteredModels.length === 0"
        description="暂无模型，请上传 .pt / .onnx 文件"
      />
      <Row v-else :gutter="[12, 12]" class="model-center-grid">
        <Col v-for="model in filteredModels" :key="model.id" :xs="24" :md="12" :xl="8">
          <ModelCard
            :model="model"
            :selected="selectedId === model.id"
            @select="selectedId = model.id"
            @test="openDetail(model, 'test')"
            @edit="openDetail(model, 'config')"
            @delete="confirmDelete(model)"
            @set-default="handleSetDefault(model)"
          />
        </Col>
      </Row>
    </div>
  </Modal>

  <ModelDetail
    :model-id="detailModelId"
    :open="detailOpen"
    :initial-tab="detailTab"
    @close="detailOpen = false"
  />
</template>
