import type { Command } from '../command';
import type { Label } from '../../types';
import { estimateLabelSize } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

/** 更新标签元数据（名称、颜色、描述） */
export class UpdateLabelCommand implements Command {
  readonly name = 'UPDATE_LABEL';

  constructor(
    private readonly labelId: string,
    private readonly before: Label,
    private readonly after: Partial<Omit<Label, 'id'>>
  ) {}

  execute(): void {
    useAnnotationStore.getState().updateLabel(this.labelId, this.after);
  }

  undo(): void {
    useAnnotationStore.getState().updateLabel(this.labelId, {
      name: this.before.name,
      color: this.before.color,
      description: this.before.description,
    });
  }

  getSize(): number {
    const merged: Label = { ...this.before, ...this.after };
    return estimateLabelSize(this.before) + estimateLabelSize(merged);
  }
}
