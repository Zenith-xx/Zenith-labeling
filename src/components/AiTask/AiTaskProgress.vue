<script setup lang="ts">
import { computed } from 'vue';
import { Button, Modal, Progress, Space, Tag, Typography, message } from 'ant-design-vue';
import { useAiTaskStore } from '@/features/aiTask';
import {
  cancelAiTask,
  continueAiTask,
  getTaskDisplayLabel,
  getTaskHistoryActions,
  isAiTaskRunningLocally,
  isTaskStalled,
  pauseAiTask,
  refreshAiTaskStatus,
  resumeAiTask,
} from '@/features/aiTask';
import type { AiTaskRecord } from '@/features/aiTask/types';
import './AiTaskProgress.css';

const { Text } = Typography;

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const aiTaskStore = useAiTaskStore();

const activeTask = computed(() => {
  const id = aiTaskStore.activeTaskId;
  if (!id) return undefined;
  return aiTaskStore.tasks.find((task) => task.id === id);
});

const historyActions = computed(() =>
  activeTask.value ? getTaskHistoryActions(activeTask.value) : null
);

const recovery = computed(() => historyActions.value?.recovery ?? {
  canContinue: false,
  canRefresh: false,
  canAbandon: false,
});

const showContinue = computed(() => historyActions.value?.showContinue ?? false);
const showRefreshStatus = computed(
  () => historyActions.value?.showRefreshStatus ?? false
);
const runningHint = computed(() => historyActions.value?.runningHint ?? null);

const isRunning = computed(() => activeTask.value?.status === 'running');
const isPaused = computed(() => activeTask.value?.status === 'paused');
const isActive = computed(() => isRunning.value || isPaused.value);
const isRunningLocally = computed(() =>
  activeTask.value ? isAiTaskRunningLocally(activeTask.value.id) : false
);

function getPercent(task: AiTaskRecord): number {
  if (task.progress.total <= 0) return 0;
  return Math.round((task.progress.completed / task.progress.total) * 100);
}

const percent = computed(() => (activeTask.value ? getPercent(activeTask.value) : 0));
const displayLabel = computed(() =>
  activeTask.value ? getTaskDisplayLabel(activeTask.value) : ''
);
const isStalled = computed(() =>
  activeTask.value ? isTaskStalled(activeTask.value) : false
);

function handlePause(): void {
  if (!activeTask.value) return;
  if (isRunning.value) {
    pauseAiTask(activeTask.value.id);
    return;
  }
  if (isPaused.value) {
    void resumeAiTask(activeTask.value.id).catch(() => undefined);
  }
}

function handleCancel(): void {
  if (!activeTask.value) return;
  Modal.confirm({
    title: '取消任务',
    content: '当前批次处理完成后将停止剩余标注，是否取消？',
    okText: '取消任务',
    okType: 'danger',
    cancelText: '继续',
    onOk: () => cancelAiTask(activeTask.value!.id),
  });
}

async function handleContinueTask(): Promise<void> {
  if (!activeTask.value) return;
  const result = await continueAiTask(activeTask.value.id);
  if (!result.started && result.message) {
    message.warning(result.message);
  }
}

async function handleRefreshStatus(): Promise<void> {
  if (!activeTask.value) return;
  await refreshAiTaskStatus(activeTask.value.id);
  message.info('已同步任务状态');
}
</script>

<template>
  <Modal
    v-if="activeTask"
    :open="open"
    title="AI 自动标注任务"
    :mask-closable="false"
    :width="460"
    class="ai-task-progress-modal"
    @cancel="emit('close')"
  >
    <div class="ai-task-progress-body">
      <div class="ai-task-progress-row">
        <Text type="secondary">模型</Text>
        <Text>{{ activeTask.modelName }}</Text>
      </div>

      <div class="ai-task-progress-head">
        <Text>进度</Text>
        <Space>
          <Tag v-if="activeTask" :color="isStalled ? 'warning' : 'processing'">
            {{ displayLabel }}
          </Tag>
          <Text strong class="ai-task-progress-count">
            {{ activeTask.progress.completed }} / {{ activeTask.progress.total }}
          </Text>
        </Space>
      </div>

      <Progress
        :percent="percent"
        :status="
          activeTask.status === 'failed' || activeTask.status === 'cancelled'
            ? 'exception'
            : isPaused
              ? 'normal'
              : 'active'
        "
      />

      <Space size="large" class="ai-task-progress-stats">
        <Text>成功: {{ activeTask.progress.success }}</Text>
        <Text>失败: {{ activeTask.progress.failed }}</Text>
        <Text>对象: {{ activeTask.progress.objects }}</Text>
      </Space>

      <Text type="secondary" class="ai-task-progress-current" :ellipsis="true">
        当前: {{ activeTask.progress.currentImageName ?? '准备中…' }}
      </Text>

      <Text
        v-if="runningHint && !isRunningLocally"
        type="secondary"
        class="ai-task-progress-hint"
      >
        {{ runningHint }}
      </Text>

      <Text v-if="activeTask.error" type="danger" class="ai-task-progress-error">
        {{ activeTask.error }}
      </Text>
    </div>

    <template #footer>
      <Button v-if="showContinue" type="primary" @click="handleContinueTask">
        继续任务
      </Button>
      <Button v-if="showRefreshStatus && !isRunningLocally" @click="handleRefreshStatus">
        查看状态
      </Button>
      <Button v-if="isActive && isRunningLocally" @click="handlePause">
        {{ isPaused ? '继续' : '暂停' }}
      </Button>
      <Button v-if="isActive && isRunningLocally" danger @click="handleCancel">取消</Button>
      <Button type="primary" ghost @click="emit('close')">关闭</Button>
    </template>
  </Modal>
</template>
