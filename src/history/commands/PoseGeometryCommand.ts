import type { Command } from '../command';
import { FIXED_GEOMETRY_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import type { PoseGeometry } from '../../utils/poseGeometry';

function cloneGeometry(geo: PoseGeometry): PoseGeometry {
  return {
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
    keypoints: [...geo.keypoints],
  };
}

/** Pose 几何变更（方框移动/缩放与关键点编辑相互独立） */
export class PoseGeometryCommand implements Command {
  readonly name = 'POSE_GEOMETRY';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private before: PoseGeometry,
    private after: PoseGeometry
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
    return FIXED_GEOMETRY_COMMAND_SIZE + this.after.keypoints.length * 8;
  }
}
