import type { Annotation, PendingAnnotation } from '../../types';

/** Double-buffered image frame shown on the background layer */
export interface DisplayFrame {
  id: string;
  element: HTMLImageElement;
  width: number;
  height: number;
}

/** Rectangle / OBB draw tool: first corner placed, awaiting second click */
export interface DrawState {
  placingSecondCorner: boolean;
  startX: number;
  startY: number;
}

/** Pan drag origin — absolute displacement, never accumulate deltas */
export interface PanDragStart {
  pointerX: number;
  pointerY: number;
  stageX: number;
  stageY: number;
}

export interface TempRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonCursor {
  x: number;
  y: number;
}

export interface PolygonLastClick {
  time: number;
  x: number;
  y: number;
}

export type AnnotationLayerMode = 'normal' | 'selected';

export interface SpatialSyncState {
  imageId: string | undefined;
  annotations: Annotation[];
}

export interface PendingAnnotationPreview {
  pending: PendingAnnotation;
  zoom: number;
}
