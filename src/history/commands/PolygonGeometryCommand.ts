import type { Command } from '../command';
import { FIXED_GEOMETRY_COMMAND_SIZE } from '../commandSize';
import { useAnnotationStore } from '../../store/useAnnotationStore';

export interface PolygonGeometry {
  points: number[];
  x: number;
  y: number;
  width: number;
  height: number;
}

function cloneGeometry(geo: PolygonGeometry): PolygonGeometry {
  return {
    points: [...geo.points],
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
  };
}

/** 多边形几何变更（移动 / 顶点编辑） */
export class PolygonGeometryCommand implements Command {
  readonly name = 'POLYGON_GEOMETRY';

  constructor(
    private readonly imageId: string,
    private readonly annotationId: string,
    private before: PolygonGeometry,
    private after: PolygonGeometry
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
    return FIXED_GEOMETRY_COMMAND_SIZE + this.after.points.length * 8;
  }
}
