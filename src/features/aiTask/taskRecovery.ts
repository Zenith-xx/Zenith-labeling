import { getDeviceId } from '../../utils/deviceId';
import { fetchModelList } from '../modelCenter/modelApi';
import { resolveLabelingServerUrl } from '../../services/autoLabel/resolveServerUrl';
import { useAiStore } from '@/store/useAiStore';
import {
  isActiveAiTaskStatus,
  isTerminalAiTaskStatus,
} from './serverTaskMapper';
import type { AiTaskRecord, AiTaskStatus } from './types';

export interface TaskRecoveryCheck {
  canContinue: boolean;
  canRefresh: boolean;
  canAbandon: boolean;
  message?: string;
}

export function isRecoverableTaskStatus(status: AiTaskStatus): boolean {
  return status === 'pending' || status === 'paused';
}

export function getCompletedOffset(
  task: AiTaskRecord,
  workerItemCount: number
): number {
  const completed = Math.max(0, task.progress.completed);
  return Math.min(completed, workerItemCount);
}

export function getRemainingImageCount(task: AiTaskRecord): number {
  const total = task.imageIds.length;
  const completed = getCompletedOffset(task, total);
  return Math.max(0, total - completed);
}

/**
 * 刷新后 Server 仍为 running，但本地 worker 已丢失、仍有剩余图片时可恢复。
 * 不含「本地正在执行 / 批次在飞」判断（由 taskRunner / History 层补充）。
 */
export function isRefreshOrphanedRunningTask(task: AiTaskRecord): boolean {
  if (task.serverDetached) return false;

  const deviceId = getDeviceId();
  if (task.deviceId && task.deviceId !== deviceId) return false;

  if (task.status !== 'running') return false;
  if (isTerminalAiTaskStatus(task.status)) return false;
  if (task.imageIds.length === 0) return false;
  if (getRemainingImageCount(task) <= 0) return false;

  return true;
}

export function evaluateTaskRecovery(task: AiTaskRecord | undefined): TaskRecoveryCheck {
  if (!task) {
    return { canContinue: false, canRefresh: false, canAbandon: false, message: '任务不存在' };
  }

  if (task.serverDetached) {
    return {
      canContinue: false,
      canRefresh: false,
      canAbandon: false,
      message: '任务已与当前设备解绑',
    };
  }

  const deviceId = getDeviceId();
  if (task.deviceId && task.deviceId !== deviceId) {
    return {
      canContinue: false,
      canRefresh: false,
      canAbandon: false,
      message: '任务不属于当前设备',
    };
  }

  if (isTerminalAiTaskStatus(task.status)) {
    return { canContinue: false, canRefresh: false, canAbandon: false };
  }

  if (task.status === 'running') {
    return {
      canContinue: false,
      canRefresh: true,
      canAbandon: true,
      message: '任务可能仍在服务端执行，请查看状态',
    };
  }

  if (isRecoverableTaskStatus(task.status)) {
    if (task.imageIds.length === 0) {
      return {
        canContinue: false,
        canRefresh: true,
        canAbandon: true,
        message: '本地缺少图片列表，无法继续',
      };
    }
    if (getRemainingImageCount(task) <= 0) {
      return {
        canContinue: false,
        canRefresh: true,
        canAbandon: true,
        message: '没有剩余图片需要处理',
      };
    }
    return { canContinue: true, canRefresh: true, canAbandon: true };
  }

  return { canContinue: false, canRefresh: false, canAbandon: isActiveAiTaskStatus(task.status) };
}

export async function validateTaskModelAvailable(task: AiTaskRecord): Promise<boolean> {
  const modelId = task.modelSnapshot?.model?.id || task.modelId;
  if (!modelId) return false;

  try {
    const ai = useAiStore.getState();
    const serverUrl = await resolveLabelingServerUrl(
      ai.serverUrl,
      Math.min(ai.timeoutSec, 10)
    );
    const { models } = await fetchModelList({
      serverUrl,
      timeoutSec: ai.timeoutSec,
    });
    return models.some((model) => model.id === modelId);
  } catch {
    return false;
  }
}
