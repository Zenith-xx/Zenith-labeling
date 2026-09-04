<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Button, List, Modal, Tag, Typography, message } from 'ant-design-vue';
import { useAiTaskStore } from '@/features/aiTask';
import {
  abandonAiTask,
  continueAiTask,
  getTaskDisplayKind,
  getTaskDisplayLabel,
  getTaskHistoryActions,
  refreshAiTaskStatus,
} from '@/features/aiTask';
import type { AiTaskRecord } from '@/features/aiTask/types';
import './AiTaskHistory.css';

const { Text } = Typography;

const emit = defineEmits<{
  openProgress: [taskId: string];
}>();

const aiTaskStore = useAiTaskStore();

const STATUS_COLOR: Record<
  ReturnType<typeof getTaskDisplayKind>,
  string
> = {
  pending: 'default',
  running: 'processing',
  stalled: 'warning',
  paused: 'warning',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

onMounted(() => {
  void aiTaskStore.fetchTasks();
});

onUnmounted(() => {
  aiTaskStore.stopPolling();
});

function viewTask(taskId: string): void {
  aiTaskStore.setActiveTask(taskId);
  aiTaskStore.setProgressOpen(true);
  emit('openProgress', taskId);
}

async function handleClearFinished(): Promise<void> {
  await aiTaskStore.clearFinishedTasks();
}

function historyActions(task: AiTaskRecord) {
  return getTaskHistoryActions(task);
}

function displayLabel(task: AiTaskRecord): string {
  return getTaskDisplayLabel(task);
}

function displayColor(task: AiTaskRecord): string {
  return STATUS_COLOR[getTaskDisplayKind(task)];
}

async function handleContinue(taskId: string): Promise<void> {
  const result = await continueAiTask(taskId);
  if (!result.started && result.message) {
    message.warning(result.message);
    return;
  }
  if (result.started) {
    viewTask(taskId);
  }
}

async function handleRefreshStatus(taskId: string): Promise<void> {
  await refreshAiTaskStatus(taskId);
  message.info('已同步任务状态');
}

function handleAbandon(taskId: string): void {
  Modal.confirm({
    title: '放弃任务',
    content: '放弃后将取消服务端任务，已完成的标注结果会保留。',
    okText: '放弃',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      abandonAiTask(taskId);
      message.success('任务已放弃');
    },
  });
}
</script>

<template>
  <Text v-if="aiTaskStore.syncError" type="warning" class="ai-task-sync-error">
    任务同步失败，将自动重试
  </Text>
  <Text v-if="aiTaskStore.tasks.length === 0" type="secondary">暂无任务记录</Text>
  <div v-else class="ai-task-history">
    <div class="ai-task-history-header">
      <Text strong>任务历史</Text>
      <Button size="small" type="link" @click="handleClearFinished">
        清理已完成
      </Button>
    </div>
    <List size="small" :data-source="aiTaskStore.tasks" :loading="aiTaskStore.loading">
      <template #renderItem="{ item: task }">
        <List.Item class="ai-task-history-item">
          <div class="ai-task-history-item-body">
            <div class="ai-task-history-title">
              <Tag :color="displayColor(task)">{{ displayLabel(task) }}</Tag>
              <Text class="ai-task-history-model">{{ task.modelName }}</Text>
            </div>
            <div class="ai-task-history-desc">
              <span>{{ task.progress.completed }}/{{ task.progress.total }}</span>
              <span class="ai-task-history-sep">·</span>
              <span>成功 {{ task.progress.success }}</span>
              <span class="ai-task-history-sep">·</span>
              <span>失败 {{ task.progress.failed }}</span>
              <Text v-if="task.error" type="danger" class="ai-task-history-error">
                · {{ task.error }}
              </Text>
            </div>
            <Text
              v-if="historyActions(task).runningHint"
              type="secondary"
              class="ai-task-history-running-hint"
            >
              {{ historyActions(task).runningHint }}
            </Text>
            <div class="ai-task-history-actions">
              <Button
                v-if="historyActions(task).showContinue"
                type="primary"
                size="small"
                class="ai-task-history-continue"
                @click="handleContinue(task.id)"
              >
                继续任务
              </Button>
              <Button
                v-if="historyActions(task).showRefreshStatus"
                type="link"
                size="small"
                @click="handleRefreshStatus(task.id)"
              >
                查看状态
              </Button>
              <Button
                v-if="historyActions(task).recovery.canAbandon"
                type="link"
                size="small"
                danger
                @click="handleAbandon(task.id)"
              >
                放弃
              </Button>
              <Button type="link" size="small" @click="viewTask(task.id)">查看</Button>
            </div>
          </div>
        </List.Item>
      </template>
    </List>
  </div>
</template>
