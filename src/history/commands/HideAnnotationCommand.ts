import type { Command } from '../command';
import { FIXED_LIGHT_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 隐藏标注（进入主 History 栈，Ctrl+Z 可撤销） */
export class HideAnnotationCommand implements Command {
  readonly name = 'HIDE_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private readonly wasSelected: boolean
  ) {}

  execute(): void {
    useAnnotationStore
      .getState()
      .setAnnotationHidden(this.imageId, this.annotationId, true);
  }

  undo(): void {
    useAnnotationStore
      .getState()
      .setAnnotationHidden(this.imageId, this.annotationId, false);
    if (this.wasSelected) {
      useAnnotationStore.getState().setSelectedAnnotation(this.annotationId);
    }
  }

  getSize(): number {
    return FIXED_LIGHT_COMMAND_SIZE;
  }
}
