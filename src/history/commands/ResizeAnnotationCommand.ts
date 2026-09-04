import type { Command } from '../command';
import { FIXED_GEOMETRY_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 调整标注尺寸 / 几何 */
export class ResizeAnnotationCommand implements Command {
  readonly name = 'RESIZE_ANNOTATION';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private before: RectGeometry,
    private after: RectGeometry
  ) {}

  execute(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      ...this.after,
    });
  }

  undo(): void {
    useAnnotationStore.getState().updateAnnotation(this.imageId, this.annotationId, {
      ...this.before,
    });
  }

  getSize(): number {
    return FIXED_GEOMETRY_COMMAND_SIZE;
  }
}
