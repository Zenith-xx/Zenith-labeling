import type { Command } from '../command';
import { FIXED_GEOMETRY_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

export interface PointGeometry {
  x: number;
  y: number;
}

/** 移动标注（仅位置） */
export class MoveAnnotationCommand implements Command {
  readonly name = 'MOVE_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private before: PointGeometry,
    private after: PointGeometry
  ) {}

  execute(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      x: this.after.x,
      y: this.after.y,
    });
  }

  undo(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      x: this.before.x,
      y: this.before.y,
    });
  }

  getSize(): number {
    return FIXED_GEOMETRY_COMMAND_SIZE;
  }
}
