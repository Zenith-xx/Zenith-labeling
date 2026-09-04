import type { Command } from '../command';
import type { Label } from '../../types';
import { estimateLabelSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 创建标签 */
export class CreateLabelCommand implements Command {
  readonly name = 'CREATE_LABEL';

  constructor(private readonly label: Label) {}

  execute(): void {
    useAnnotationStore.getState().addLabel(this.label);
  }

  undo(): void {
    useAnnotationStore.getState().removeLabelWithoutHistory(this.label.id);
  }

  getSize(): number {
    return estimateLabelSize(this.label);
  }
}
