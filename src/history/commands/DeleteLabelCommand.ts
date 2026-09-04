import type { Command } from '../command';
import type { Annotation, Label } from '../../types';
import {
  estimateAnnotationSize,
  estimateLabelSize,
} from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

export interface LabelDeleteSnapshot {
  labels: Label[];
  annotations: { imageId: string; annotation: Annotation }[];
  selectedAnnotation: string | null;
}

/** 删除标签并移除关联标注；Undo 恢复标签与标注引用 */
export class DeleteLabelCommand implements Command {
  readonly name = 'DELETE_LABEL';

  constructor(private readonly snapshot: LabelDeleteSnapshot) {}

  static capture(ids: string[]): LabelDeleteSnapshot | null {
    const store = useAnnotationStore.getState();
    const idSet = new Set(ids);
    const labels = store.labels.filter((l) => idSet.has(l.id));
    if (labels.length === 0) return null;

    const annotations: { imageId: string; annotation: Annotation }[] = [];
    for (const [imageId, anns] of Object.entries(store.annotationsByImage)) {
      for (const ann of anns) {
        if (idSet.has(ann.labelId)) {
          annotations.push({
            imageId,
            annotation: { ...ann, points: ann.points ? [...ann.points] : undefined },
          });
        }
      }
    }

    const selected = store.selectedAnnotation;
    const selectedRemoved =
      selected != null &&
      annotations.some((entry) => entry.annotation.id === selected);

    return {
      labels: labels.map((l) => ({ ...l })),
      annotations,
      selectedAnnotation: selectedRemoved ? null : selected,
    };
  }

  execute(): void {
    const ids = this.snapshot.labels.map((l) => l.id);
    useAnnotationStore.getState().removeLabelsWithoutHistory(ids);
  }

  undo(): void {
    const store = useAnnotationStore.getState();
    for (const label of this.snapshot.labels) {
      store.addLabel(label);
    }
    for (const { imageId, annotation } of this.snapshot.annotations) {
      store.addAnnotation(imageId, annotation);
    }
    if (this.snapshot.selectedAnnotation) {
      store.setSelectedAnnotation(this.snapshot.selectedAnnotation);
    }
  }

  getSize(): number {
    return (
      128 +
      this.snapshot.labels.reduce((sum, l) => sum + estimateLabelSize(l), 0) +
      this.snapshot.annotations.reduce(
        (sum, entry) => sum + estimateAnnotationSize(entry.annotation),
        0
      )
    );
  }
}
