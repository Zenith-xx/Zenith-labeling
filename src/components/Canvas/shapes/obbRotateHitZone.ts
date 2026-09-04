import Konva from 'konva';
import type { Annotation } from '../../../types';
import { ObbGeometryCommand } from '../../../history';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import {
  buildObbFromParams,
  obbFromAnnotation,
  obbGeometryEqual,
  rotateObbFromPointer,
  type ObbGeometry,
} from '../../../utils/obbGeometry';
import {
  getObbRotateHandleOffset,
  getObbRotateHandleRadii,
  getObbRotateCorridorHitHalfWidth,
} from '../../../utils/shapeStyle';
import { applyObbGroupTransform } from './shapeHostHelpers';

export interface ObbRotateHitZoneProps {
  ann: Annotation;
  imageId: string;
  zoom: number;
  clientToImage: (clientX: number, clientY: number) => { x: number; y: number };
  onInteractStart: () => void;
  onInteractEnd: () => void;
  onCornerHover: (hovering: boolean) => void;
  onHoverChange: (hovering: boolean) => void;
}

interface LocalObb {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

function toLocalObb(ann: Annotation): LocalObb {
  return {
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
    angle: ann.angle ?? 0,
  };
}

function toPatch(geo: LocalObb): Partial<Annotation> {
  const obb = buildObbFromParams(geo.x, geo.y, geo.width, geo.height, geo.angle);
  return {
    x: obb.x,
    y: obb.y,
    width: obb.width,
    height: obb.height,
    angle: obb.angle,
    points: obb.points,
  };
}

function localObbToGeometry(geo: LocalObb): ObbGeometry {
  return buildObbFromParams(geo.x, geo.y, geo.width, geo.height, geo.angle);
}

export interface ObbRotateHitZoneHandle {
  readonly root: Konva.Group;
  update(props: ObbRotateHitZoneProps): void;
  destroy(): void;
}

/**
 * OBB 旋转手柄命中区（顶层）：框顶中点 → 手柄的隐形垂向带 + 手柄圆盘。
 * 仅负责点击判定与旋转拖动，不绘制可见图形。
 */
export function attachObbRotateHitZone(
  parent: Konva.Layer | Konva.Group,
  props: ObbRotateHitZoneProps
): ObbRotateHitZoneHandle {
  const root = new Konva.Group();
  const corridorHit = new Konva.Rect({
    name: 'obb-rotate-corridor-hit',
    fill: 'rgba(0,0,0,0.001)',
    strokeEnabled: false,
    perfectDrawEnabled: false,
  });
  const handleGroup = new Konva.Group();
  const circleHit = new Konva.Circle({
    name: 'obb-rotate-hit',
    fill: 'rgba(0,0,0,0.001)',
    strokeEnabled: false,
    perfectDrawEnabled: false,
  });

  handleGroup.add(circleHit);
  root.add(corridorHit);
  root.add(handleGroup);
  parent.add(root);

  let currentProps = props;
  let activeRotate = false;
  let localGeo = toLocalObb(props.ann);
  let rotateStart: ObbGeometry | null = null;
  let dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;

  const stopDragListeners = () => {
    if (!dragListeners) return;
    window.removeEventListener('mousemove', dragListeners.move);
    window.removeEventListener('mouseup', dragListeners.up);
    dragListeners = null;
  };

  const handlePointerEnter = () => {
    currentProps.onHoverChange(true);
    currentProps.onCornerHover(true);
  };

  const handlePointerLeave = () => {
    if (activeRotate) return;
    currentProps.onHoverChange(false);
    currentProps.onCornerHover(false);
  };

  const handleRotateMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    currentProps.onInteractStart();
    currentProps.onCornerHover(true);
    currentProps.onHoverChange(true);
    localGeo = toLocalObb(currentProps.ann);
    rotateStart = obbFromAnnotation(currentProps.ann);
    activeRotate = true;

    const onMove = (ev: MouseEvent) => {
      const raw = currentProps.clientToImage(ev.clientX, ev.clientY);
      const nextObb = rotateObbFromPointer(
        localGeo.x,
        localGeo.y,
        localGeo.width,
        localGeo.height,
        raw.x,
        raw.y
      );
      localGeo = {
        x: nextObb.x,
        y: nextObb.y,
        width: nextObb.width,
        height: nextObb.height,
        angle: nextObb.angle,
      };
      useAnnotationStore
        .getState()
        .updateAnnotation(currentProps.imageId, currentProps.ann.id, toPatch(localGeo));
    };

    const onUp = () => {
      stopDragListeners();
      const before = rotateStart;
      const after = localObbToGeometry(localGeo);
      rotateStart = null;
      if (before && !obbGeometryEqual(before, after)) {
        useHistoryStore.getState().executeCommand(
          new ObbGeometryCommand(currentProps.imageId, currentProps.ann.id, before, after)
        );
      }
      activeRotate = false;
      currentProps.onCornerHover(false);
      currentProps.onHoverChange(false);
      currentProps.onInteractEnd();
    };

    dragListeners = { move: onMove, up: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  corridorHit.on('mousedown', handleRotateMouseDown);
  corridorHit.on('mouseenter', handlePointerEnter);
  corridorHit.on('mouseleave', handlePointerLeave);
  circleHit.on('mousedown', handleRotateMouseDown);
  circleHit.on('mouseenter', handlePointerEnter);
  circleHit.on('mouseleave', handlePointerLeave);

  const syncLayout = (nextProps: ObbRotateHitZoneProps) => {
    const geo = toLocalObb(nextProps.ann);
    const rotateHandleOffset = getObbRotateHandleOffset(nextProps.zoom);
    const rotateHandleHitRadius = getObbRotateHandleRadii(nextProps.zoom, false).outerRadius;
    const corridorHalfWidth = getObbRotateCorridorHitHalfWidth(nextProps.zoom);

    if (rotateHandleOffset <= 0) {
      root.visible(false);
      return;
    }

    root.visible(true);
    applyObbGroupTransform(root, geo.x, geo.y, geo.width, geo.height, geo.angle);

    corridorHit.x(geo.width / 2 - corridorHalfWidth);
    corridorHit.y(-rotateHandleOffset);
    corridorHit.width(corridorHalfWidth * 2);
    corridorHit.height(rotateHandleOffset);

    handleGroup.position({ x: geo.width / 2, y: -rotateHandleOffset });
    circleHit.radius(rotateHandleHitRadius);
  };

  syncLayout(props);

  return {
    root,
    update(nextProps: ObbRotateHitZoneProps) {
      currentProps = nextProps;
      if (!activeRotate) {
        localGeo = toLocalObb(nextProps.ann);
      }
      syncLayout(nextProps);
    },
    destroy() {
      stopDragListeners();
      root.destroy();
    },
  };
}
