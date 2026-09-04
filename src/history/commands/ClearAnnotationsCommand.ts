import type { Command } from '../command';
import type { Annotation } from '../../types';
import { estimateAnnotationSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

const CLEAR_OVERHEAD = 160;

/** 清空单张图片的全部标注，一次 Undo 恢复整图 */
export class ClearAnnotationsCommand implements Command {
  readonly name = 'CLEAR_ANNOTATIONS';

  constructor(
    private readonly imageId: string,
    private readonly annotations: Annotation[],
    private readonly wasSelected: string | null
  ) {}

  execute(): void {
    useAnnotationStore.getState().replaceImageAnnotations(this.imageId, []);
    useAnnotationStore.getState().setSelectedAnnotation(null);
  }

  undo(): void {
    useAnnotationStore
      .getState()
      .replaceImageAnnotations(this.imageId, this.annotations);
    if (
      this.wasSelected &&
      this.annotations.some((a) => a.id === this.wasSelected)
    ) {
      useAnnotationStore.getState().setSelectedAnnotation(this.wasSelected);
    }
  }

  getSize(): number {
    return (
      CLEAR_OVERHEAD +
      this.annotations.reduce((sum, a) => sum + estimateAnnotationSize(a), 0)
    );
  }
}
