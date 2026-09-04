<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Modal,
  Radio,
  InputNumber,
  Checkbox,
  Typography,
  Select,
  message,
} from 'ant-design-vue';
import { useModelStore } from '@/store/useModelStore';
import { TASK_LABELS } from '@/features/modelCenter/types';
import {
  resolveInferenceContext,
  toAiTaskModelSnapshot,
  validateInferenceContext,
  useInferenceStore,
} from '@/features/ai';
import { useAiTaskStore } from '@/features/aiTask';
import { runAiTask } from '@/features/aiTask/taskRunner';
import {
  clampImageRange,
  filterRunnableImages,
  resolveTaskImageIds,
} from '@/features/aiTask/imageScope';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { DEFAULT_AI_TASK_CONCURRENCY, type AiTaskImageScope } from '@/features/aiTask/types-core';
import './AiTaskModal.css';

const { Text } = Typography;

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const modelStore = useModelStore();
const inferenceStore = useInferenceStore();
const aiTaskStore = useAiTaskStore();
const annotationStore = useAnnotationStore();

const imageScope = ref<AiTaskImageScope>('all');
const imageRangeStart = ref(1);
const imageRangeEnd = ref(1);
const concurrency = ref(DEFAULT_AI_TASK_CONCURRENCY);
const replace = ref(true);
const submitting = ref(false);

const totalImageCount = computed(() => annotationStore.imageList.length);

function resetRangeToList() {
  const total = totalImageCount.value;
  imageRangeStart.value = total > 0 ? 1 : 1;
  imageRangeEnd.value = total > 0 ? total : 1;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    resetRangeToList();
    void inferenceStore.initSession().catch(() => undefined);
    void modelStore.ensureModels().catch(() => undefined);
  }
);

watch(totalImageCount, (total) => {
  if (total <= 0) {
    imageRangeStart.value = 1;
    imageRangeEnd.value = 1;
    return;
  }
  const clamped = clampImageRange(
    imageRangeStart.value,
    imageRangeEnd.value,
    total
  );
  imageRangeStart.value = clamped.start;
  imageRangeEnd.value = clamped.end;
});

function onRangeStartChange(value: number | string | null): void {
  const total = totalImageCount.value;
  const start = typeof value === 'number' ? value : 1;
  const clamped = clampImageRange(start, imageRangeEnd.value, total);
  imageRangeStart.value = clamped.start;
  imageRangeEnd.value = clamped.end;
}

function onRangeEndChange(value: number | string | null): void {
  const total = totalImageCount.value;
  const end = typeof value === 'number' ? value : total;
  const clamped = clampImageRange(imageRangeStart.value, end, total);
  imageRangeStart.value = clamped.start;
  imageRangeEnd.value = clamped.end;
}

const resolveScopeOptions = computed(() => {
  if (imageScope.value !== 'range') return undefined;
  return {
    range: {
      start: imageRangeStart.value,
      end: imageRangeEnd.value,
    },
  };
});

const previewCount = computed(() =>
  filterRunnableImages(
    resolveTaskImageIds(imageScope.value, resolveScopeOptions.value)
  ).length
);

const selectedModel = computed(() =>
  modelStore.models.find((model) => model.id === inferenceStore.sessionModelId)
);

const modelOptions = computed(() =>
  modelStore.models
    .filter((model) => model.status === 'ready')
    .map((model) => ({
      label: `${model.name} [${TASK_LABELS[model.task]}]`,
      value: model.id,
    }))
);

async function handleStart(): Promise<void> {
  if (!inferenceStore.sessionModelId) {
    message.warning('请选择 AI 模型');
    return;
  }
  if (previewCount.value === 0) {
    message.warning('当前范围内没有可推理的图片');
    return;
  }

  submitting.value = true;
  try {
    const context = resolveInferenceContext(inferenceStore.getSessionState());
    validateInferenceContext(context);
    const modelSnapshot = toAiTaskModelSnapshot(context);
    const task = aiTaskStore.createTask({
      modelSnapshot,
      imageScope: imageScope.value,
      imageRange:
        imageScope.value === 'range'
          ? { start: imageRangeStart.value, end: imageRangeEnd.value }
          : undefined,
      concurrency: concurrency.value,
      replaceExisting: replace.value,
    });
    if (!task) {
      message.warning('创建任务失败');
      return;
    }
    emit('close');
    aiTaskStore.setProgressOpen(true);
    void runAiTask(task.id)
      .then((result) => {
        const summary = `完成 ${result.processed} 张，成功 ${result.success} 张，共 ${result.objects} 个对象`;
        if (result.cancelled) {
          message.warning(`任务已取消：${summary}`);
        } else {
          message.success(`批量标注完成：${summary}`);
        }
      })
      .catch((err) => {
        message.error(err instanceof Error ? err.message : '批量标注失败');
      });
  } catch (err) {
    message.error(err instanceof Error ? err.message : '创建任务失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="AI 批量标注"
    ok-text="开始任务"
    cancel-text="取消"
    :confirm-loading="submitting"
    :width="480"
    destroy-on-close
    class="ai-task-modal"
    @cancel="emit('close')"
    @ok="handleStart"
  >
    <div class="ai-task-modal-body">
      <div class="ai-task-field">
        <Text class="ai-task-label">AI 模型</Text>
        <Select
          class="ai-task-model-select"
          placeholder="选择模型"
          :value="inferenceStore.sessionModelId || undefined"
          :options="modelOptions"
          :loading="modelStore.loading"
          show-search
          option-filter-prop="label"
          @change="(id: string) => inferenceStore.switchModel(id)"
        />
        <Text v-if="selectedModel" type="secondary">
          {{ selectedModel.classes.join(', ') || '未识别类别' }} · {{ selectedModel.inputSize }}px
        </Text>
      </div>

      <div class="ai-task-field">
        <Text class="ai-task-label">图片范围</Text>
        <Radio.Group
          class="ai-task-scope-group"
          :value="imageScope"
          @change="(e) => (imageScope = e.target.value)"
        >
          <Radio value="current">当前图片</Radio>
          <Radio value="all">全部图片</Radio>
          <Radio value="unannotated">未标注图片</Radio>
          <Radio value="range">指定范围</Radio>
        </Radio.Group>
        <div v-if="imageScope === 'range'" class="ai-task-range-row">
          <span class="ai-task-range-label">从第</span>
          <InputNumber
            class="ai-task-range-input"
            size="middle"
            :min="1"
            :max="totalImageCount || 1"
            :precision="0"
            :value="imageRangeStart"
            @change="onRangeStartChange"
          />
          <span class="ai-task-range-label">张到第</span>
          <InputNumber
            class="ai-task-range-input"
            size="middle"
            :min="1"
            :max="totalImageCount || 1"
            :precision="0"
            :value="imageRangeEnd"
            @change="onRangeEndChange"
          />
          <span class="ai-task-range-label">张</span>
          <Text type="secondary" class="ai-task-range-total">
            （共 {{ totalImageCount }} 张）
          </Text>
        </div>
        <Text type="secondary" class="ai-task-scope-hint">
          将处理 {{ previewCount }} 张图片
        </Text>
      </div>

      <div class="ai-task-params-grid">
        <div class="ai-task-field-inline">
          <Text class="ai-task-label">置信度</Text>
          <InputNumber
            class="ai-task-param-input"
            :min="0"
            :max="1"
            :step="0.05"
            :value="inferenceStore.config.confidence"
            @change="(v) => inferenceStore.setConfidence(typeof v === 'number' ? v : 0.25)"
          />
        </div>
        <div class="ai-task-field-inline">
          <Text class="ai-task-label">IOU</Text>
          <InputNumber
            class="ai-task-param-input"
            :min="0"
            :max="1"
            :step="0.05"
            :value="inferenceStore.config.iou"
            @change="(v) => inferenceStore.setIou(typeof v === 'number' ? v : 0.45)"
          />
        </div>
        <div class="ai-task-field-inline">
          <Text class="ai-task-label">输入尺寸</Text>
          <InputNumber
            class="ai-task-param-input"
            :min="32"
            :max="4096"
            :step="32"
            :value="inferenceStore.config.imgSize"
            @change="(v) => inferenceStore.setImgSize(typeof v === 'number' ? v : 640)"
          />
        </div>
        <div class="ai-task-field-inline">
          <Text class="ai-task-label">并发数</Text>
          <InputNumber
            class="ai-task-param-input"
            :min="1"
            :max="8"
            :value="concurrency"
            @change="(v) => (concurrency = typeof v === 'number' ? v : DEFAULT_AI_TASK_CONCURRENCY)"
          />
        </div>
      </div>

      <div class="ai-task-checkbox-row">
        <Checkbox :checked="replace" @change="(e) => (replace = e.target.checked)">
          替换已有标注
        </Checkbox>
      </div>
      <Text type="secondary" class="ai-task-snapshot-hint">
        任务将保存当前参数快照；后续修改模型默认配置不会影响已创建任务。
      </Text>
    </div>
  </Modal>
</template>
