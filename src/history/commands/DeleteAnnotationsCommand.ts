import type { Command } from '../command';
import type { Annotation } from '../../types';
import { estimateAnnotationSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 批量删除标注（一次 Undo 恢复） */
export class DeleteAnnotationsCommand implements Command {
  readonly name = 'DELETE_ANNOTATIONS';

  constructor(
    private readonly imageId: string,
    private readonly annotations: Annotation[],
    private readonly selectedIds: string[]
  ) {}

  execute(): void {
    const store = useAnnotationStore.getState();
    for (const ann of this.annotations) {
      store.removeAnnotation(this.imageId, ann.id);
    }
    store.clearSelection();
  }

  undo(): void {
    const store = useAnnotationStore.getState();
    for (const ann of this.annotations) {
      store.addAnnotation(this.imageId, ann);
    }
    if (this.selectedIds.length > 0) {
      store.setSelectedAnnotations(this.selectedIds);
    }
  }

  getSize(): number {
    return this.annotations.reduce(
      (sum, ann) => sum + estimateAnnotationSize(ann),
      128
    );
  }
}
