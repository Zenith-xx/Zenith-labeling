import type { AiTaskRecord } from './types';
import {
  applyServerTaskToLocal,
  serverTaskToAiTaskRecord,
} from './serverTaskMapper';
import type { ServerTask } from './serverTaskTypes';

/** 同一 serverTaskId 仅保留最新本地映射，其余标记 detached */
export function resolveDuplicateServerBindings(
  tasks: AiTaskRecord[]
): AiTaskRecord[] {
  const groups = new Map<string, AiTaskRecord[]>();
  for (const task of tasks) {
    if (!task.serverTaskId) continue;
    const list = groups.get(task.serverTaskId) ?? [];
    list.push(task);
    groups.set(task.serverTaskId, list);
  }

  const staleIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => b.updatedAt - a.updatedAt);
    for (let i = 1; i < sorted.length; i += 1) {
      staleIds.add(sorted[i].id);
    }
  }

  if (staleIds.size === 0) return tasks;

  return tasks.map((task) => {
    if (!staleIds.has(task.id)) return task;
    return {
      ...task,
      serverTaskId: null,
      serverDetached: true,
    };
  });
}

/** 合并服务端任务列表与本地缓存（服务端状态优先） */
export function mergeServerTasksWithLocal(
  localTasks: AiTaskRecord[],
  serverTasks: ServerTask[],
  currentDeviceId: string
): AiTaskRecord[] {
  const serverById = new Map(serverTasks.map((task) => [task.task_id, task]));
  const matchedServerIds = new Set<string>();

  const deviceLocal = localTasks.filter(
    (task) => !task.deviceId || task.deviceId === currentDeviceId
  );

  const merged = deviceLocal.map((local) => {
    if (!local.serverTaskId) {
      return local;
    }
    const server = serverById.get(local.serverTaskId);
    if (!server) {
      return local;
    }
    matchedServerIds.add(local.serverTaskId);
    return applyServerTaskToLocal(local, server);
  });

  const serverOnly = serverTasks
    .filter((server) => !matchedServerIds.has(server.task_id))
    .filter(
      (server) =>
        !deviceLocal.some((local) => local.serverTaskId === server.task_id)
    )
    .map((server) => serverTaskToAiTaskRecord(server));

  const combined = [...serverOnly, ...merged];
  return resolveDuplicateServerBindings(
    combined
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
  );
}

/** Device ID 变化时，清除与当前设备不匹配的服务端关联 */
export function detachTasksForDeviceChange(
  tasks: AiTaskRecord[],
  currentDeviceId: string
): AiTaskRecord[] {
  return tasks.map((task) => {
    if (task.deviceId && task.deviceId !== currentDeviceId) {
      return {
        ...task,
        serverTaskId: null,
        serverDetached: true,
        deviceId: currentDeviceId,
      };
    }
    if (!task.deviceId) {
      return { ...task, deviceId: currentDeviceId };
    }
    return task;
  });
}
