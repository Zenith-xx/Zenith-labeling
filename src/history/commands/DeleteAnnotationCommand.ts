import type { Command } from '../command';
import type { Annotation } from '../../types';
import { estimateAnnotationSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 删除标注（undo 时恢复完整对象） */
export class DeleteAnnotationCommand implements Command {
  readonly name = 'DELETE_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotation: Annotation,
    private readonly wasSelected: boolean
  ) {}

  execute(): void {
    useAnnotationStore.getState().removeAnnotation(this.imageId, this.annotation.id);
  }

  undo(): void {
    useAnnotationStore.getState().addAnnotation(this.imageId, this.annotation);
    if (this.wasSelected) {
      useAnnotationStore.getState().setSelectedAnnotation(this.annotation.id);
    }
  }

  getSize(): number {
    return estimateAnnotationSize(this.annotation) + 8;
  }
}
