import type { Command } from '../command';
import { FIXED_GEOMETRY_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import type { ObbGeometry } from '../../utils/obbGeometry';
import { annotationPatchFromObb } from '../../utils/obbGeometry';

/** OBB 几何变更（移动 / 旋转 / 角点缩放） */
export class ObbGeometryCommand implements Command {
  readonly name = 'OBB_GEOMETRY';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private before: ObbGeometry,
    private after: ObbGeometry
  ) {}

  execute(): void {
    useAnnotationStore
      .getState()
      .updateAnnotation(this.imageId, this.annotationId, annotationPatchFromObb(this.after));
  }

  undo(): void {
    useAnnotationStore
      .getState()
      .updateAnnotation(this.imageId, this.annotationId, annotationPatchFromObb(this.before));
  }

  getSize(): number {
    return FIXED_GEOMETRY_COMMAND_SIZE + this.after.points.length * 8;
  }
}
