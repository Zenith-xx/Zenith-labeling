<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Checkbox, InputNumber, Select, Tooltip, message } from 'ant-design-vue';
import { Play, Settings, X, Loader2, ListChecks } from 'lucide-vue-next';
import { useAiStore } from '@/store/useAiStore';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useModelStore } from '@/store/useModelStore';
import { useInferenceStore } from '@/store/useInferenceStore';
import { hasRunningAiTask } from '@/features/aiTask';
import { TASK_LABELS } from '@/features/modelCenter/types';
import { runAutoLabelOnCurrentImage } from '@/services/autoLabel';
import AiModelSettingsModal from '@/components/AiModelSettingsModal/index.vue';
import AiTaskModal from '@/components/AiTask/AiTaskModal.vue';
import AiTaskHistory from '@/components/AiTask/AiTaskHistory.vue';
import { useAiTaskStore } from '@/features/aiTask';
import './index.css';

const aiStore = useAiStore();
const annotationStore = useAnnotationStore();
const modelStore = useModelStore();
const inferenceStore = useInferenceStore();
const aiTaskStore = useAiTaskStore();

const settingsOpen = ref(false);
const batchModalOpen = ref(false);

watch(
  () => aiStore.panelOpen,
  (open) => {
    if (!open) return;
    void inferenceStore.initSession().catch(() => undefined);
  }
);

const modelOptions = computed(() =>
  modelStore.models
    .filter((model) => model.status === 'ready')
    .map((model) => ({
      value: model.id,
      label: `${model.name} [${model.taskLabel ?? TASK_LABELS[model.task]}]`,
    }))
);

const selectedModel = computed(() =>
  modelStore.models.find((model) => model.id === inferenceStore.sessionModelId)
);

const batchRunning = computed(() => hasRunningAiTask());

const canRun = computed(
  () =>
    Boolean(annotationStore.currentImage?.file || annotationStore.currentImage?.url) &&
    Boolean(inferenceStore.sessionModelId) &&
    Boolean(selectedModel.value?.loaded)
);

const canRunAll = computed(
  () =>
    annotationStore.imageList.length > 0 &&
    Boolean(inferenceStore.sessionModelId) &&
    Boolean(selectedModel.value?.loaded)
);

async function handleRun(): Promise<void> {
  try {
    const count = await runAutoLabelOnCurrentImage();
    if (count > 0) {
      message.success(`AI 标注完成：导入 ${count} 个对象`);
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'AI 标注失败');
  }
}

function handleOpenBatch(): void {
  if (annotationStore.imageList.length === 0) {
    message.warning('请先导入图片');
    return;
  }
  batchModalOpen.value = true;
}

function openProgress(): void {
  aiTaskStore.setProgressOpen(true);
}
</script>

<template>
  <template v-if="aiStore.panelOpen">
    <div class="auto-label-panel sidebar-card">
      <div class="panel-header auto-label-header">
        <span>AI 自动标注</span>
        <div class="auto-label-header-actions">
          <Tooltip title="服务器设置">
            <button
              type="button"
              class="auto-label-icon-btn"
              @click="settingsOpen = true"
            >
              <Settings :size="14" />
            </button>
          </Tooltip>
          <button
            type="button"
            class="auto-label-icon-btn"
            aria-label="关闭"
            @click="aiStore.setPanelOpen(false)"
          >
            <X :size="14" />
          </button>
        </div>
      </div>

      <div class="auto-label-body">
        <div class="auto-label-field">
          <label class="auto-label-label">当前模型</label>
          <Select
            size="small"
            class="auto-label-select-full"
            :placeholder="modelStore.models.length > 0 ? '选择模型' : '暂无模型，请前往模型中心'"
            :value="inferenceStore.sessionModelId || undefined"
            :options="modelOptions"
            :loading="modelStore.loading"
            show-search
            option-filter-prop="label"
            @change="(id: string) => inferenceStore.switchModel(id)"
          />

          <p
            v-if="selectedModel && !selectedModel.loaded && selectedModel.loadError"
            class="auto-label-model-error"
          >
            {{ selectedModel.loadError }}
          </p>

          <p v-if="selectedModel && selectedModel.classes.length > 0" class="auto-label-model-classes">
            类别：{{ selectedModel.classes.slice(0, 6).join(', ') }}
            {{ selectedModel.classes.length > 6 ? '…' : '' }}
          </p>

          <p
            v-if="selectedModel && selectedModel.exportFormats && selectedModel.exportFormats.length > 0"
            class="auto-label-model-formats"
          >
            可导出：{{ selectedModel.exportFormats.map((f) => f.toUpperCase()).join(' / ') }}
          </p>
        </div>

        <div class="auto-label-params">
          <div class="auto-label-param">
            <span class="auto-label-label">置信度</span>
            <InputNumber
              size="small"
              :min="0"
              :max="1"
              :step="0.05"
              :value="inferenceStore.config.confidence"
              @change="(v) => inferenceStore.setConfidence(typeof v === 'number' ? v : 0.25)"
            />
          </div>
          <div class="auto-label-param">
            <span class="auto-label-label">IOU</span>
            <InputNumber
              size="small"
              :min="0"
              :max="1"
              :step="0.05"
              :value="inferenceStore.config.iou"
              @change="(v) => inferenceStore.setIou(typeof v === 'number' ? v : 0.45)"
            />
          </div>
          <div class="auto-label-param">
            <span class="auto-label-label">输入尺寸</span>
            <InputNumber
              size="small"
              :min="32"
              :max="4096"
              :step="32"
              :value="inferenceStore.config.imgSize"
              @change="(v) => inferenceStore.setImgSize(typeof v === 'number' ? v : 640)"
            />
          </div>
        </div>

        <Checkbox
          :checked="aiStore.replaceExisting"
          class="auto-label-checkbox"
          @change="(e) => aiStore.setReplaceExisting(e.target.checked)"
        >
          替换已有标注
        </Checkbox>

        <div class="auto-label-run-actions">
          <Button
            type="primary"
            block
            :disabled="!canRun || aiStore.predicting"
            class="auto-label-run-btn"
            @click="handleRun"
          >
            <template #icon>
              <Loader2
                v-if="aiStore.predicting && !batchRunning"
                :size="16"
                class="spin"
              />
              <Play v-else :size="16" />
            </template>
            {{ aiStore.predicting && !batchRunning ? '推理中…' : '运行 (当前图)' }}
          </Button>
          <Button
            block
            :disabled="!canRunAll || aiStore.predicting"
            class="auto-label-run-btn"
            @click="handleOpenBatch"
          >
            <template #icon>
              <ListChecks :size="16" />
            </template>
            AI 批量标注 ({{ annotationStore.imageList.length }})
          </Button>
          <Button block class="auto-label-run-btn" @click="modelStore.setCenterOpen(true)">
            打开模型中心
          </Button>
        </div>

        <AiTaskHistory @open-progress="openProgress" />
      </div>
    </div>

    <AiTaskModal :open="batchModalOpen" @close="batchModalOpen = false" />

    <AiModelSettingsModal :open="settingsOpen" @close="settingsOpen = false" />
  </template>
</template>
