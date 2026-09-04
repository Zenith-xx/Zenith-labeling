import { useHistoryStore } from '../../store/useHistoryStore';
import type { Label } from '../../types';
import { getNextLabelColor } from '../../constants/labelColors';
import { generateId } from '../../utils/id';
import {
  AddAnnotationCommand,
  BatchCommand,
  ClearAnnotationsCommand,
  CreateLabelCommand,
} from '../../history';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import { useProjectStore } from '../../store/useProjectStore';
import type { RemoteShape } from './types';
import { remoteShapesToAnnotations } from './shapeConverter';

function resolveLabelId(labelName: string, labelNameToId: Map<string, string>): string {
  const key = labelName.trim().toLowerCase();
  const existing = labelNameToId.get(key);
  if (existing) return existing;
  const labels = useAnnotationStore.getState().labels;
  const found = labels.find((l) => l.name.toLowerCase() === key);
  if (found) {
    labelNameToId.set(key, found.id);
    return found.id;
  }
  const newLabel: Label = {
    id: generateId(),
    name: labelName.trim(),
    color: getNextLabelColor(labels.length),
  };
  labelNameToId.set(key, newLabel.id);
  useHistoryStore.getState().executeCommand(new CreateLabelCommand(newLabel));
  return newLabel.id;
}

/** 将 AI 推理结果写入当前图片（支持撤销） */
export function applyAutoLabelResult(
  imageId: string,
  shapes: RemoteShape[],
  replace: boolean
): number {
  const store = useAnnotationStore.getState();
  const converted = remoteShapesToAnnotations(shapes);
  const labelNameToId = new Map<string, string>();
  const annotations = converted.map(({ annotation, labelName }) => ({
    ...annotation,
    labelId: resolveLabelId(labelName, labelNameToId),
  }));

  const existing = store.annotationsByImage[imageId] ?? [];
  const wasSelected = store.selectedAnnotation;

  if (annotations.length === 0) {
    if (replace && existing.length > 0) {
      useHistoryStore.getState().executeCommand(
        new ClearAnnotationsCommand(imageId, [...existing], wasSelected)
      );
      useProjectStore.getState().markDirty();
    }
    return 0;
  }

  const commands = [];

  if (replace && existing.length > 0) {
    commands.push(
      new ClearAnnotationsCommand(imageId, [...existing], wasSelected)
    );
  }

  for (const ann of annotations) {
    commands.push(new AddAnnotationCommand(imageId, ann));
  }

  useHistoryStore.getState().executeCommand(
    new BatchCommand(commands, 'AUTO_LABEL')
  );
  useProjectStore.getState().markDirty();
  return annotations.length;
}
