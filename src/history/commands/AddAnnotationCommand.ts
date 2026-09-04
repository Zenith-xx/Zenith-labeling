import type { Command } from '../command';
import type { Annotation } from '../../types';
import { estimateAnnotationSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 新增标注 */
export class AddAnnotationCommand implements Command {
  readonly name = 'ADD_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotation: Annotation
  ) {}

  execute(): void {
    useAnnotationStore.getState().addAnnotation(this.imageId, this.annotation);
    useAnnotationStore.getState().setSelectedAnnotation(this.annotation.id);
  }

  undo(): void {
    useAnnotationStore.getState().removeAnnotation(this.imageId, this.annotation.id);
  }

  getSize(): number {
    return estimateAnnotationSize(this.annotation);
  }
}
