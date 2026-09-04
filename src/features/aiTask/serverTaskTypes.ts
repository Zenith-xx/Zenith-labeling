/** Labeling-Server TaskResponse（与 api/tasks.py 一致） */
export interface ServerTask {
  task_id: string;
  device_id: string;
  model_name: string;
  status: ServerTaskStatus;
  total: number;
  completed: number;
  success: number;
  failed: number;
  progress: number;
  created_at: number;
  updated_at: number;
  error: string | null;
  confidence: number | null;
  iou: number | null;
}

export type ServerTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ServerTaskListResponse {
  tasks: ServerTask[];
}
