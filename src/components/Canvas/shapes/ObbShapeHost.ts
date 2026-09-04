import Konva from 'konva';
import {
  armSkipNextCommit,
  endClickMoveSession,
  startClickMoveSession,
  type MutableValue,
} from '../../../utils/clickMoveInteraction';
import {
  buildObbFromParams,
  getObbAxisAlignedBBox,
  getObbCorners,
  resizeObbFromFixedCorner,
  type ObCorner,
} from '../../../utils/obbGeometry';
import {
  applyShapeColors,
  getBoxOutlinePoints,
  getChamferSize,
  getObbCenterDotRadius,
  getObbRotateHandleOffset,
  getStrokeWidthScreen,
  imageSizeForZoom,
  SHAPE_HIT_SIZE,
  SHOW_MASKS,
  FILL_DRAWING_ENABLED,
} from '../../../utils/shapeStyle';
import {
  applyObbGroupTransform,
  type LabelNodes,
  renderRotateHandle,
  renderVertexHandle,
  syncAnnotationLabel,
  syncOuterHighlightLines,
} from './shapeHostHelpers';
import type { GroupDragPreviewCapable } from './groupDragPreview';
import type { ObbShapeHostProps } from './types';

const MIN_SIZE = 5;
const ANIM_DURATION = 0.12;

const OBB_CORNER_INDEX: Record<ObCorner, number> = {
  tl: 0,
  tr: 1,
  br: 2,
  bl: 3,
};

interface LocalObb {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

const CORNERS: {
  key: ObCorner;
  getPos: (w: number, h: number) => { x: number; y: number };
}[] = [
  { key: 'tl', getPos: () => ({ x: 0, y: 0 }) },
  { key: 'tr', getPos: (w) => ({ x: w, y: 0 }) },
  { key: 'br', getPos: (w, h) => ({ x: w, y: h }) },
  { key: 'bl', getPos: (_, h) => ({ x: 0, y: h }) },
];

function geoNearlyEqual(a: LocalObb, b: LocalObb, eps = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps &&
    Math.abs(a.angle - b.angle) < 1e-4
  );
}

function localObbToPatch(geo: LocalObb) {
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

interface CornerNodes {
  group: Konva.Group;
  hitRect: Konva.Rect;
  handleGroup: Konva.Group;
}

export class ObbShapeHost implements GroupDragPreviewCapable {
  readonly root: Konva.Group;
  readonly labelRoot: Konva.Group;

  private props: ObbShapeHostProps;
  private maskLine: Konva.Line | null = null;
  private fillLine: Konva.Line | null = null;
  private strokeLine: Konva.Line;
  private highlightLines: Konva.Line[] = [];
  private highlightGroup: Konva.Group;
  private hitLine: Konva.Line;
  private centerDot: Konva.Circle | null = null;
  private rotateHandleGroup: Konva.Group | null = null;
  private labelNodes: LabelNodes | null = null;
  private readonly cornerNodes: CornerNodes[] = [];

  private localGeometry: LocalObb | null = null;
  private geoRaf = 0;
  private awaitingStoreSync = false;
  private activeCorner: ObCorner | null = null;
  private hoveredCorner: ObCorner | null = null;
  private isDragging = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private dragStartObb: LocalObb | null = null;
  private resizeFixedCorner: { x: number; y: number; angle: number } | null = null;
  private dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;
  private clickMoveSkipRef: MutableValue<boolean> = { current: false };
  private moveSessionEndRef: MutableValue<(() => void) | null> = { current: null };

  constructor(parent: Konva.Layer | Konva.Group, props: ObbShapeHostProps) {
    this.props = props;
    this.root = new Konva.Group();
    this.labelRoot = new Konva.Group();

    if (SHOW_MASKS) {
      this.maskLine = new Konva.Line({
        closed: true,
        strokeEnabled: false,
        listening: false,
      });
      this.root.add(this.maskLine);
    }

    this.fillLine = new Konva.Line({
      closed: true,
      strokeEnabled: false,
      listening: false,
      visible: false,
    });
    this.root.add(this.fillLine);

    this.strokeLine = new Konva.Line({
      name: 'annotation-shape',
      closed: true,
      lineJoin: 'miter',
      fill: 'transparent',
      listening: false,
    });
    this.root.add(this.strokeLine);

    this.highlightGroup = new Konva.Group({ listening: false });
    this.root.add(this.highlightGroup);

    this.hitLine = new Konva.Line({
      name: 'annotation-hit',
      closed: true,
      fill: 'rgba(0,0,0,0.001)',
      strokeEnabled: false,
      visible: false,
    });
    this.hitLine.on('mousedown', (e) => this.handleBoxMouseDown(e));
    this.hitLine.on('dblclick', (e) => this.handleBoxDblClick(e));
    this.root.add(this.hitLine);

    for (const { key } of CORNERS) {
      const group = new Konva.Group({ visible: false });
      const hitSize = imageSizeForZoom(SHAPE_HIT_SIZE, props.zoom);
      const hitRect = new Konva.Rect({
        x: -hitSize / 2,
        y: -hitSize / 2,
        width: hitSize,
        height: hitSize,
        fill: 'transparent',
      });
      hitRect.on('mousedown', (e) => this.handleCornerMouseDown(key, e));
      hitRect.on('mouseenter', () => this.handleCornerMouseEnter(key));
      hitRect.on('mouseleave', () => this.handleCornerMouseLeave(key));
      group.add(hitRect);

      const handleGroup = new Konva.Group({ listening: false });
      group.add(handleGroup);
      this.root.add(group);
      this.cornerNodes.push({ group, hitRect, handleGroup });
    }

    parent.add(this.root);
    parent.add(this.labelRoot);
    this.syncAll();
  }

  update(props: ObbShapeHostProps): void {
    const prev = this.props;
    this.props = props;

    const storeGeo = this.getStoreGeo();
    if (this.localGeometry && geoNearlyEqual(storeGeo, this.localGeometry)) {
      this.awaitingStoreSync = false;
      this.localGeometry = null;
    }

    this.syncAll();

    const stylePropsChanged =
      prev.color !== props.color ||
      prev.isSelected !== props.isSelected ||
      prev.zoom !== props.zoom ||
      prev.rotateHandleHover !== props.rotateHandleHover;

    if (stylePropsChanged) {
      this.animateStyle();
    }
  }

  destroy(): void {
    this.stopBoxDragListeners();
    this.endCornerMoveSession();
    if (this.geoRaf) cancelAnimationFrame(this.geoRaf);

    if (this.awaitingStoreSync && this.localGeometry) {
      const pending = this.localGeometry;
      const ann = this.props.ann;
      const before = buildObbFromParams(
        ann.x,
        ann.y,
        ann.width,
        ann.height,
        ann.angle ?? 0
      );
      const after = buildObbFromParams(
        pending.x,
        pending.y,
        pending.width,
        pending.height,
        pending.angle
      );
      if (
        Math.abs(before.x - after.x) > 0.01 ||
        Math.abs(before.y - after.y) > 0.01 ||
        Math.abs(before.angle - after.angle) > 1e-4 ||
        Math.abs(before.width - after.width) > 0.01 ||
        Math.abs(before.height - after.height) > 0.01
      ) {
        this.props.onUpdate(ann.id, localObbToPatch(pending));
      }
    }

    this.labelRoot.destroy();
    this.root.destroy();
  }

  private getStoreGeo(): LocalObb {
    const { ann } = this.props;
    const obb = buildObbFromParams(
      ann.x,
      ann.y,
      ann.width,
      ann.height,
      ann.angle ?? 0
    );
    return {
      x: obb.x,
      y: obb.y,
      width: obb.width,
      height: obb.height,
      angle: obb.angle,
    };
  }

  private getGeo(): LocalObb {
    return this.localGeometry ?? this.getStoreGeo();
  }

  private getDisplayGeo(): LocalObb {
    return this.localGeometry ?? this.getStoreGeo();
  }

  private applyGroupTransform(geo: LocalObb): void {
    applyObbGroupTransform(this.root, geo.x, geo.y, geo.width, geo.height, geo.angle);
  }

  private syncBoxLines(width: number, height: number): void {
    const { zoom, isSelected } = this.props;
    const chamfer = isSelected ? 0 : getChamferSize(width, height, zoom);
    const points = getBoxOutlinePoints(width, height, chamfer, true);
    for (const line of [this.maskLine, this.fillLine, this.strokeLine, this.hitLine]) {
      line?.points(points);
    }
  }

  private scheduleLocalGeometry(next: LocalObb, immediate = false): void {
    this.localGeometry = next;
    if (immediate) {
      if (this.geoRaf) {
        cancelAnimationFrame(this.geoRaf);
        this.geoRaf = 0;
      }
      this.updateCornerPositions();
      return;
    }
    if (this.geoRaf) return;
    this.geoRaf = requestAnimationFrame(() => {
      this.geoRaf = 0;
      this.updateCornerPositions();
    });
  }

  private syncAll(): void {
    const geo = this.getGeo();
    const { zoom, isSelected, isEditMode, showLabels } = this.props;

    this.applyGroupTransform(geo);
    this.syncBoxLines(geo.width, geo.height);

    const colors = applyShapeColors(this.props.color, isSelected, this.activeCorner !== null);
    const strokeWidth = getStrokeWidthScreen(isSelected, zoom);
    const showShapeFill = FILL_DRAWING_ENABLED && isSelected && !this.activeCorner;

    this.strokeLine.stroke(colors.strokeColor);
    this.strokeLine.strokeWidth(strokeWidth);

    if (this.maskLine && SHOW_MASKS) {
      this.maskLine.fill(colors.maskFillColor);
      this.maskLine.visible(true);
    }

    if (this.fillLine) {
      if (showShapeFill) {
        this.fillLine.fill(colors.selectFillColor);
        this.fillLine.opacity(1);
        this.fillLine.visible(true);
      } else {
        this.fillLine.visible(false);
      }
    }

    this.syncOuterHighlight(geo);
    this.syncHitLine(isSelected, isEditMode);
    this.syncCorners(geo, isSelected, isEditMode, zoom);
    this.syncCenterAndRotateHandle(geo, isSelected, isEditMode, zoom);
    this.syncLabel(showLabels, geo);
  }

  private animateStyle(): void {
    const { zoom, isSelected, color } = this.props;
    const colors = applyShapeColors(color, isSelected, this.activeCorner !== null);
    const strokeWidth = getStrokeWidthScreen(isSelected, zoom);
    const showShapeFill = FILL_DRAWING_ENABLED && isSelected && !this.activeCorner;

    this.strokeLine.to({
      stroke: colors.strokeColor,
      strokeWidth,
      duration: ANIM_DURATION,
      easing: Konva.Easings.EaseInOut,
    });

    if (this.fillLine && showShapeFill) {
      this.fillLine.to({
        fill: colors.selectFillColor,
        opacity: 1,
        duration: ANIM_DURATION,
        easing: Konva.Easings.EaseInOut,
      });
    }

    if (this.maskLine && SHOW_MASKS) {
      this.maskLine.to({
        fill: colors.maskFillColor,
        duration: this.activeCorner ? 0 : ANIM_DURATION,
        easing: Konva.Easings.EaseInOut,
      });
    }
  }

  private syncOuterHighlight(geo: LocalObb): void {
    const { zoom, isSelected } = this.props;
    const points = getBoxOutlinePoints(geo.width, geo.height, 0, false);
    this.highlightLines = syncOuterHighlightLines(
      this.highlightGroup,
      this.highlightLines,
      points,
      true,
      zoom,
      isSelected
    );
  }

  private syncOuterHighlightLive(width: number, height: number): void {
    const { zoom, isSelected } = this.props;
    const points = getBoxOutlinePoints(width, height, 0, false);
    this.highlightLines = syncOuterHighlightLines(
      this.highlightGroup,
      this.highlightLines,
      points,
      true,
      zoom,
      isSelected
    );
    this.root.getLayer()?.batchDraw();
  }

  private syncHitLine(isSelected: boolean, isEditMode: boolean): void {
    this.hitLine.visible(isEditMode && isSelected);
  }

  private syncCorners(
    geo: LocalObb,
    isSelected: boolean,
    isEditMode: boolean,
    zoom: number
  ): void {
    const visible = isSelected && isEditMode;
    const hitSize = imageSizeForZoom(SHAPE_HIT_SIZE, zoom);

    CORNERS.forEach(({ key, getPos }, index) => {
      const nodes = this.cornerNodes[index];
      nodes.group.visible(visible);
      if (!visible) return;

      const pos = getPos(geo.width, geo.height);
      nodes.group.position(pos);
      nodes.hitRect.x(-hitSize / 2);
      nodes.hitRect.y(-hitSize / 2);
      nodes.hitRect.width(hitSize);
      nodes.hitRect.height(hitSize);

      const isActive = this.activeCorner === key;
      const isHovered = this.hoveredCorner === key && !isActive;
      renderVertexHandle(nodes.handleGroup, {
        zoom,
        emphasized: isHovered || isActive,
      });
    });
  }

  private syncCenterAndRotateHandle(
    geo: LocalObb,
    isSelected: boolean,
    isEditMode: boolean,
    zoom: number
  ): void {
    const visible = isSelected && isEditMode;
    const rotateHandleOffset = getObbRotateHandleOffset(zoom);

    if (visible) {
      if (!this.centerDot) {
        this.centerDot = new Konva.Circle({
          fill: '#ffffff',
          listening: false,
        });
        this.root.add(this.centerDot);
      }
      this.centerDot.visible(true);
      this.centerDot.x(geo.width / 2);
      this.centerDot.y(geo.height / 2);
      this.centerDot.radius(getObbCenterDotRadius(zoom));
    } else {
      this.centerDot?.visible(false);
    }

    if (visible && rotateHandleOffset > 0) {
      if (!this.rotateHandleGroup) {
        this.rotateHandleGroup = new Konva.Group({ listening: false });
        this.root.add(this.rotateHandleGroup);
      }
      this.rotateHandleGroup.visible(true);
      this.rotateHandleGroup.position({ x: geo.width / 2, y: -rotateHandleOffset });
      renderRotateHandle(
        this.rotateHandleGroup,
        zoom,
        this.props.rotateHandleHover ?? false
      );
    } else {
      this.rotateHandleGroup?.visible(false);
    }
  }

  private syncLabel(showLabels: boolean, geo: LocalObb): void {
    const bbox = getObbAxisAlignedBBox(geo.x, geo.y, geo.width, geo.height, geo.angle);
    this.labelNodes = syncAnnotationLabel(this.labelRoot, this.labelNodes, {
      labelName: this.props.labelName,
      groupId: this.props.groupId,
      color: this.props.color,
      zoom: this.props.zoom,
      showLabels,
      x: bbox.x,
      y: bbox.y,
    });
  }

  private updateCornerPositions(): void {
    const geo = this.getGeo();
    CORNERS.forEach(({ getPos }, index) => {
      const nodes = this.cornerNodes[index];
      if (!nodes.group.visible()) return;
      nodes.group.position(getPos(geo.width, geo.height));
    });
  }

  private syncResizeVisuals(next: LocalObb): void {
    this.applyGroupTransform(next);
    this.syncBoxLines(next.width, next.height);
    const { isSelected, isEditMode } = this.props;
    if (isSelected && isEditMode) {
      this.syncOuterHighlightLive(next.width, next.height);
    }
    this.scheduleLocalGeometry(next, true);
    this.syncHitLine(isSelected, isEditMode);
    this.syncCenterAndRotateHandle(next, isSelected, isEditMode, this.props.zoom);
    this.syncLabel(this.props.showLabels, next);
  }

  private endCornerMoveSession(): void {
    endClickMoveSession(this.moveSessionEndRef);
  }

  private beginCornerMoveSession(captureFrom?: MouseEvent): void {
    this.endCornerMoveSession();
    const { clientToImage, onUpdate, onInteractEnd, onCornerHover } = this.props;

    this.moveSessionEndRef.current = startClickMoveSession({
      skipCommitRef: this.clickMoveSkipRef,
      captureFrom,
      onMove: (e) => {
        const pointer = clientToImage(e.clientX, e.clientY);
        const cornerKey = this.activeCorner;
        const anchor = this.resizeFixedCorner;
        if (!cornerKey || !anchor) return;
        const nextObb = resizeObbFromFixedCorner(
          anchor.angle,
          cornerKey,
          anchor.x,
          anchor.y,
          pointer.x,
          pointer.y,
          MIN_SIZE
        );
        this.syncResizeVisuals({
          x: nextObb.x,
          y: nextObb.y,
          width: nextObb.width,
          height: nextObb.height,
          angle: nextObb.angle,
        });
      },
      onCommit: (e) => {
        const cornerKey = this.activeCorner;
        const anchor = this.resizeFixedCorner;
        let latest = this.localGeometry ?? this.getDisplayGeo();
        if (cornerKey && anchor) {
          const pointer = clientToImage(e.clientX, e.clientY);
          const nextObb = resizeObbFromFixedCorner(
            anchor.angle,
            cornerKey,
            anchor.x,
            anchor.y,
            pointer.x,
            pointer.y,
            MIN_SIZE
          );
          latest = {
            x: nextObb.x,
            y: nextObb.y,
            width: nextObb.width,
            height: nextObb.height,
            angle: nextObb.angle,
          };
          this.localGeometry = latest;
          this.applyGroupTransform(latest);
        }
        if (latest) {
          this.awaitingStoreSync = true;
          onUpdate(this.props.ann.id, localObbToPatch(latest));
        }
        this.activeCorner = null;
        this.resizeFixedCorner = null;
        onCornerHover(false);
        this.hoveredCorner = null;
        onInteractEnd();
        this.endCornerMoveSession();
        this.syncAll();
      },
    });
  }

  private stopBoxDragListeners(): void {
    if (this.dragListeners) {
      window.removeEventListener('mousemove', this.dragListeners.move);
      window.removeEventListener('mouseup', this.dragListeners.up);
      this.dragListeners = null;
    }
  }

  private finishBoxDrag(): void {
    this.isDragging = false;
    this.props.onBoxDrag(false);
    this.props.onDragEnd?.();
    this.props.onInteractEnd();
  }

  beginGroupDragPreview(): void {}

  applyGroupDragPreview(dx: number, dy: number): void {
    const base = this.getStoreGeo();
    const next: LocalObb = {
      ...base,
      x: base.x + dx,
      y: base.y + dy,
    };
    this.localGeometry = next;
    this.applyGroupTransform(next);
    if (this.isDragging) {
      this.scheduleLocalGeometry(next, true);
      this.syncLabel(this.props.showLabels, next);
    }
  }

  clearGroupDragPreview(): void {
    if (this.isDragging || this.awaitingStoreSync) return;
    this.localGeometry = null;
    this.syncAll();
  }

  private handleBoxMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode, allowBoxDrag } = this.props;
    if (!isSelected || !isEditMode || !allowBoxDrag || this.activeCorner || this.isDragging) return;
    e.cancelBubble = true;
    this.props.onInteractStart();
    this.dragMoved = false;

    const current = this.getDisplayGeo();
    this.localGeometry = current;
    this.dragStartObb = current;

    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragOffset = { x: pointer.x - current.x, y: pointer.y - current.y };

    this.isDragging = true;
    this.props.onBoxDrag(true);
    this.props.onDragStart?.(this.props.ann.id);

    const { onUpdate } = this.props;

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging || !this.dragStartObb) return;
      const start = this.dragStartObb;
      const ptr = this.props.clientToImage(ev.clientX, ev.clientY);
      const rawX = ptr.x - this.dragOffset.x;
      const rawY = ptr.y - this.dragOffset.y;
      if (Math.abs(rawX - start.x) > 1 || Math.abs(rawY - start.y) > 1) {
        this.dragMoved = true;
      }

      if (this.props.groupDragSync) {
        this.props.onDragMove?.(this.props.ann.id, rawX, rawY);
        return;
      }

      const next: LocalObb = {
        x: rawX,
        y: rawY,
        width: start.width,
        height: start.height,
        angle: start.angle,
      };
      this.localGeometry = next;
      this.applyGroupTransform(next);
      this.scheduleLocalGeometry(next, true);
      this.syncLabel(this.props.showLabels, next);
      this.props.onDragMove?.(this.props.ann.id, rawX, rawY);
    };

    const onUp = () => {
      this.stopBoxDragListeners();
      if (!this.isDragging) return;

      const final = this.localGeometry;
      if (final) {
        this.awaitingStoreSync = true;
        onUpdate(this.props.ann.id, localObbToPatch(final));
      }
      this.finishBoxDrag();
    };

    this.dragListeners = { move: onMove, up: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private handleBoxDblClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.props.onEditLabel?.(this.props.ann.id);
  }

  private handleCornerMouseDown(corner: ObCorner, e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.activeCorner !== null) return;

    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onCornerHover(true);
    this.hoveredCorner = corner;
    this.props.onInteractStart();

    const current = this.getDisplayGeo();
    this.localGeometry = current;
    this.awaitingStoreSync = false;
    const corners = getObbCorners(
      current.x,
      current.y,
      current.width,
      current.height,
      current.angle
    );
    const fixedIdx = (OBB_CORNER_INDEX[corner] + 2) % 4;
    this.resizeFixedCorner = {
      x: corners[fixedIdx * 2],
      y: corners[fixedIdx * 2 + 1],
      angle: current.angle,
    };
    this.activeCorner = corner;
    this.syncAll();
    this.beginCornerMoveSession(e.evt);
  }

  private handleCornerMouseEnter(corner: ObCorner): void {
    if (this.props.isEditMode) {
      this.hoveredCorner = corner;
      this.props.onCornerHover(true);
      this.syncCorners(
        this.getGeo(),
        this.props.isSelected,
        this.props.isEditMode,
        this.props.zoom
      );
    }
  }

  private handleCornerMouseLeave(corner: ObCorner): void {
    if (this.hoveredCorner === corner) {
      this.hoveredCorner = null;
    }
    if (!this.activeCorner) {
      this.props.onCornerHover(false);
    }
    this.syncCorners(
      this.getGeo(),
      this.props.isSelected,
      this.props.isEditMode,
      this.props.zoom
    );
  }
}
