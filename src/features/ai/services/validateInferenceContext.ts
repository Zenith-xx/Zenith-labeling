import type { AiModelTask } from '../../modelCenter/types';
import { TASK_LABELS } from '../../modelCenter/types';
import { useModelStore } from '../../modelCenter/modelStore';
import { useAnnotationStore } from '../../../store/useAnnotationStore';
import type { AnnotationShapeType, YoloFormat } from '../../../types';
import type { InferenceContext } from './types';

const ANNOTATION_MODE_LABELS: Record<YoloFormat, string> = {
  hbb: 'HBB',
  obb: 'OBB',
  seg: 'Seg',
  pose: 'Pose',
};

export interface ValidateInferenceContextOptions {
  /**
   * 是否校验 ModelStore 中的模型资产。
   * 任务快照执行时可设为 false（模型可能已从中心删除但服务端仍可用）。
   */
  strictModel?: boolean;
}

export function mapModelTaskToAnnotationMode(task: AiModelTask): YoloFormat {
  switch (task) {
    case 'detect':
      return 'hbb';
    case 'obb':
      return 'obb';
    case 'seg':
      return 'seg';
    case 'pose':
      return 'pose';
    default:
      return 'hbb';
  }
}

/**
 * 根据当前项目标注数据推断标注模式。
 * 空项目默认 HBB。
 */
export function resolveCurrentAnnotationMode(): YoloFormat {
  const { annotationsByImage } = useAnnotationStore.getState();
  const counts: Partial<Record<AnnotationShapeType, number>> = {};

  for (const annotations of Object.values(annotationsByImage)) {
    for (const annotation of annotations) {
      counts[annotation.shapeType] = (counts[annotation.shapeType] ?? 0) + 1;
    }
  }

  if ((counts.pose ?? 0) > 0) return 'pose';
  if ((counts.polygon ?? 0) > 0) return 'seg';
  if ((counts['rotated-rectangle'] ?? 0) > 0) return 'obb';
  return 'hbb';
}

/**
 * 运行推理前校验模型状态与任务类型匹配。
 */
export function validateInferenceContext(
  context: InferenceContext,
  options: ValidateInferenceContextOptions = {}
): void {
  const strictModel = options.strictModel ?? true;

  if (strictModel) {
    const model = useModelStore.getState().getModelById(context.modelId);
    if (!model) {
      throw new Error(`模型不存在: ${context.modelName || context.modelId}`);
    }
    if (model.status !== 'ready' || !model.loaded) {
      throw new Error(model.loadError ?? `模型 ${model.name} 未就绪`);
    }
  }

  const currentMode = resolveCurrentAnnotationMode();
  const modelMode = mapModelTaskToAnnotationMode(context.task);
  if (currentMode !== modelMode) {
    throw new Error(
      `模型类型与当前标注模式不一致（模型：${TASK_LABELS[context.task]}，当前：${ANNOTATION_MODE_LABELS[currentMode]}）`
    );
  }
}
