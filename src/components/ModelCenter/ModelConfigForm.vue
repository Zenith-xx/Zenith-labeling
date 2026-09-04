<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Button, Form, Input, InputNumber, Select } from 'ant-design-vue';
import type { AiModel, AiModelUpdateInput } from '@/features/modelCenter/types';

const props = defineProps<{
  model: AiModel;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [updates: AiModelUpdateInput];
}>();

const formModel = reactive<AiModelUpdateInput>({
  display_name: '',
  description: '',
  version: '',
  confidence: 0.25,
  iou: 0.45,
  imgSize: 640,
  device: 'auto',
  classes: [],
});

watch(
  () => props.model,
  (model) => {
    formModel.display_name = model.name;
    formModel.description = model.description;
    formModel.version = model.version;
    formModel.confidence = model.defaultConfig.confidence;
    formModel.iou = model.defaultConfig.iou;
    formModel.imgSize = model.inputSize;
    formModel.device = model.defaultConfig.device;
    formModel.classes = [...model.classes];
  },
  { immediate: true }
);

function handleFinish(): void {
  emit('save', { ...formModel });
}
</script>

<template>
  <Form
    layout="vertical"
    class="model-config-form"
    :model="formModel"
    @finish="handleFinish"
  >
    <Form.Item label="显示名称" name="display_name" :rules="[{ required: true }]">
      <Input v-model:value="formModel.display_name" />
    </Form.Item>
    <Form.Item label="描述" name="description">
      <Input.TextArea v-model:value="formModel.description" :rows="2" />
    </Form.Item>
    <Form.Item label="版本" name="version">
      <Input v-model:value="formModel.version" placeholder="例如 v1.0.0" />
    </Form.Item>
    <Form.Item label="类别（每行一个）" name="classes">
      <Select
        v-model:value="formModel.classes"
        mode="tags"
        :token-separators="[',']"
        placeholder="输入类别名"
      />
    </Form.Item>
    <Form.Item label="置信度" name="confidence">
      <InputNumber
        v-model:value="formModel.confidence"
        :min="0"
        :max="1"
        :step="0.05"
        style="width: 100%"
      />
    </Form.Item>
    <Form.Item label="IOU" name="iou">
      <InputNumber
        v-model:value="formModel.iou"
        :min="0"
        :max="1"
        :step="0.05"
        style="width: 100%"
      />
    </Form.Item>
    <Form.Item label="输入尺寸" name="imgSize">
      <InputNumber
        v-model:value="formModel.imgSize"
        :min="32"
        :max="4096"
        :step="32"
        style="width: 100%"
      />
    </Form.Item>
    <Form.Item label="设备" name="device">
      <Select
        v-model:value="formModel.device"
        :options="[
          { label: '自动', value: 'auto' },
          { label: 'CUDA', value: 'cuda' },
          { label: 'CPU', value: 'cpu' },
        ]"
      />
    </Form.Item>
    <Button type="primary" html-type="submit" :loading="saving" block>
      保存配置
    </Button>
  </Form>
</template>
