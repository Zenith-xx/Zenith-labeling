import type { Command } from '../command';
import { estimateAnnotationSize } from '../commandSize';
import type { Annotation } from '../../types';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 粘贴 / 快速复制：批量新增标注，一次 Undo 撤销 */
export class PasteAnnotationsCommand implements Command {
  readonly name = 'PASTE_ANNOTATIONS';

  constructor(
    private readonly imageId: string,
    private readonly annotations: Annotation[],
    private readonly primaryId: string
  ) {}

  execute(): void {
    const store = useAnnotationStore.getState();
    for (const ann of this.annotations) {
      store.addAnnotation(this.imageId, ann);
    }
    store.setSelectedAnnotation(this.primaryId);
  }

  undo(): void {
    const store = useAnnotationStore.getState();
    for (const ann of this.annotations) {
      store.removeAnnotation(this.imageId, ann.id);
    }
    if (store.selectedAnnotation === this.primaryId) {
      store.setSelectedAnnotation(null);
    }
  }

  getSize(): number {
    return this.annotations.reduce(
      (sum, ann) => sum + estimateAnnotationSize(ann),
      128
    );
  }
}
