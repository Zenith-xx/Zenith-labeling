import type { Command } from '../command';
import { FIXED_LIGHT_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 修改标注编号（groupId） */
export class ChangeAnnotationGroupIdCommand implements Command {
  readonly name = 'CHANGE_ANNOTATION_GROUP_ID';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private readonly before: number | undefined,
    private readonly after: number | undefined
  ) {}

  execute(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      groupId: this.after,
    });
    useAnnotationStore.getState().setSelectedAnnotation(this.annotationId);
  }

  undo(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      groupId: this.before,
    });
    useAnnotationStore.getState().setSelectedAnnotation(this.annotationId);
  }

  getSize(): number {
    return FIXED_LIGHT_COMMAND_SIZE;
  }
}
