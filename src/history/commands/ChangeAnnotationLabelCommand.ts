import type { Command } from '../command';
import { FIXED_LIGHT_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 修改标注绑定的标签 ID */
export class ChangeAnnotationLabelCommand implements Command {
  readonly name = 'CHANGE_ANNOTATION_LABEL';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private readonly beforeLabelId: string,
    private readonly afterLabelId: string
  ) {}

  execute(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      labelId: this.afterLabelId,
    });
    useAnnotationStore.getState().setSelectedAnnotation(this.annotationId);
  }

  undo(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      labelId: this.beforeLabelId,
    });
    useAnnotationStore.getState().setSelectedAnnotation(this.annotationId);
  }

  getSize(): number {
    return (
      FIXED_LIGHT_COMMAND_SIZE +
      this.beforeLabelId.length * 2 +
      this.afterLabelId.length * 2
    );
  }
}
