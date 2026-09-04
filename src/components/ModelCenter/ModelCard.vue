<script setup lang="ts">
import { Button, Card, Space, Tag, Typography } from 'ant-design-vue';
import type { AiModel } from '@/features/modelCenter/types';
import { TASK_LABELS } from '@/features/modelCenter/types';
import './ModelCard.css';

const { Text, Paragraph } = Typography;

defineProps<{
  model: AiModel;
  selected?: boolean;
}>();

const emit = defineEmits<{
  select: [];
  test: [];
  edit: [];
  delete: [];
  setDefault: [];
}>();

const STATUS_COLOR = {
  ready: 'success',
  loading: 'processing',
  error: 'error',
} as const;
</script>

<template>
  <Card
    :class="['model-card', { selected }]"
    size="small"
    @click="emit('select')"
  >
    <template #title>
      <div class="model-card-title">
        <span>{{ model.name }}</span>
        <Tag v-if="model.isDefault" color="blue">默认</Tag>
      </div>
    </template>
    <template #extra>
      <Tag :color="STATUS_COLOR[model.status]">{{ model.status }}</Tag>
    </template>

    <div class="model-card-body">
      <Paragraph class="model-card-line">
        <Text type="secondary">文件：</Text>
        {{ model.fileName }}
      </Paragraph>
      <Paragraph class="model-card-line">
        <Text type="secondary">格式：</Text>
        {{ model.format.toUpperCase() }}
        <Text type="secondary"> · 任务：</Text>
        {{ TASK_LABELS[model.task] }}
      </Paragraph>
      <Paragraph class="model-card-line" :ellipsis="{ rows: 1 }">
        <Text type="secondary">类别：</Text>
        {{ model.classes.length > 0 ? model.classes.join(', ') : '未识别' }}
      </Paragraph>
      <Paragraph class="model-card-line">
        <Text type="secondary">输入尺寸：</Text>
        {{ model.inputSize }}
        <Text type="secondary"> · 默认参数：</Text>
        conf {{ model.defaultConfig.confidence }} / iou {{ model.defaultConfig.iou }}
      </Paragraph>
      <Paragraph class="model-card-line">
        <Text type="secondary">设备：</Text>
        {{ model.defaultConfig.device.toUpperCase() }}
      </Paragraph>
      <Paragraph v-if="model.loadError" class="model-card-error" type="danger">
        {{ model.loadError }}
      </Paragraph>
    </div>

    <Space wrap class="model-card-actions" @click.stop>
      <Button size="small" @click="emit('test')">测试</Button>
      <Button size="small" @click="emit('edit')">编辑</Button>
      <Button v-if="!model.isDefault" size="small" @click="emit('setDefault')">
        设为默认
      </Button>
      <Button size="small" danger @click="emit('delete')">删除</Button>
    </Space>
  </Card>
</template>
