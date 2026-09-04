<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Button, List, Space, Typography, Upload } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { testModelWithImage } from '@/features/modelCenter/modelApi';
import { useAiStore } from '@/store/useAiStore';
import type { AiModel, AiModelTestResult } from '@/features/modelCenter/types';
import './ModelTest.css';

const { Text, Title } = Typography;

const props = defineProps<{
  model: AiModel;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const testing = ref(false);
const previewUrl = ref<string | null>(null);
const result = ref<AiModelTestResult | null>(null);
const error = ref<string | null>(null);

function drawResult(imageUrl: string, testResult: AiModelTestResult): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.lineWidth = 2;
    ctx.font = '14px sans-serif';
    for (const shape of testResult.shapes) {
      if (shape.shape_type === 'rectangle' && shape.points.length >= 2) {
        const [x1, y1] = shape.points[0];
        const [x2, y2] = shape.points[1];
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);
        ctx.strokeStyle = '#ff4d4f';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#ff4d4f';
        ctx.fillText(`${shape.label} ${shape.score.toFixed(2)}`, x, Math.max(14, y - 4));
      }
    }
  };
  img.src = imageUrl;
}

async function handleTest(file: File): Promise<void> {
  testing.value = true;
  error.value = null;
  const url = URL.createObjectURL(file);
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = url;
  try {
    const ai = useAiStore.getState();
    const serverUrl = await ai.ensureServerConnection();
    const testResult = await testModelWithImage({
      serverUrl,
      timeoutSec: ai.timeoutSec,
      modelId: props.model.id,
      imageFile: file,
      confidence: props.model.defaultConfig.confidence,
      iou: props.model.defaultConfig.iou,
    });
    result.value = testResult;
    drawResult(url, testResult);
  } catch (err) {
    result.value = null;
    error.value = err instanceof Error ? err.message : '测试失败';
  } finally {
    testing.value = false;
  }
}

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  void handleTest(file as File);
  return false;
};

const detectionItems = computed(() => {
  if (!result.value) return [];
  if (result.value.shapes.length > 0) {
    return result.value.shapes.map((shape, index) => ({
      key: `${shape.label}-${index}`,
      label: `${shape.label} ${shape.score.toFixed(2)}`,
    }));
  }
  return result.value.detections.map((item, index) => ({
    key: `${item.label}-${index}`,
    label: `${item.label} ${item.confidence.toFixed(2)}`,
  }));
});

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <div class="model-test">
    <Upload accept="image/*" :show-upload-list="false" :before-upload="beforeUpload">
      <Button :loading="testing" type="primary">上传测试图片</Button>
    </Upload>

    <Text v-if="error" type="danger" class="model-test-error">{{ error }}</Text>

    <Space v-if="result" direction="vertical" class="model-test-result" :size="8">
      <Text>耗时：{{ result.latencyMs }} ms</Text>
      <Text>设备：{{ result.device.toUpperCase() }}</Text>
      <Title :level="5" style="margin: 0">检测结果</Title>
      <List
        v-if="detectionItems.length > 0"
        size="small"
        :data-source="detectionItems"
      >
        <template #renderItem="{ item }">
          <List.Item>{{ item.label }}</List.Item>
        </template>
      </List>
      <Text v-else type="secondary">未检测到目标</Text>
    </Space>

    <div class="model-test-canvas-wrap">
      <canvas ref="canvasRef" class="model-test-canvas" />
      <Text v-if="!previewUrl" type="secondary">上传图片后显示检测结果</Text>
    </div>
  </div>
</template>
