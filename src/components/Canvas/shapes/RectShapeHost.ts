import Konva from 'konva';
import type { Annotation } from '../../../types';
import { clampRect, clampPoint, clampRectPosition } from '../../../utils/annotationBounds';
import { formatCanvasLabel } from '../../../utils/annotationDisplay';
import {
  armSkipNextCommit,
  endClickMoveSession,
  startClickMoveSession,
  type MutableValue,
} from '../../../utils/clickMoveInteraction';
import type { GroupDragPreviewCapable } from './groupDragPreview';
import {
  applyShapeColors,
  getBoxOutlinePoints,
  getChamferSize,
  getLabelScreenBgSize,
  getScreenSpaceLabelInverseScale,
  getStrokeWidthScreen,
  imageSizeForZoom,
  LABEL_FONT_FAMILY,
  LABEL_SCREEN_FONT_SIZE,
  LABEL_TEXT_COLOR,
  SHAPE_HIT_SIZE,
  SHOW_MASKS,
  FILL_DRAWING_ENABLED,
} from '../../../utils/shapeStyle';
import type { ShapeHostContext } from './types';
import { renderVertexHandle, syncOuterHighlightLines } from './shapeHostHelpers';

export type { ShapeHostContext } from './types';

const MIN_SIZE = 5;
const ANIM_DURATION = 0.12;
const DEBUG_DRAG = false;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface LocalGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeAnchor = { left: number; top: number; right: number; bottom: number };

export interface RectShapeHostProps extends ShapeHostContext {
  ann: Annotation;
  color: string;
  labelName: string;
  groupId?: number;
  isSelected: boolean;
  showLabels: boolean;
}

const CORNERS: { key: Corner; getPos: (w: number, h: number) => { x: number; y: number } }[] = [
  { key: 'tl', getPos: () => ({ x: 0, y: 0 }) },
  { key: 'tr', getPos: (w) => ({ x: w, y: 0 }) },
  { key: 'bl', getPos: (_, h) => ({ x: 0, y: h }) },
  { key: 'br', getPos: (w, h) => ({ x: w, y: h }) },
];

function computeResize(
  corner: Corner,
  anchor: ResizeAnchor,
  pointer: { x: number; y: number },
  imageWidth: number,
  imageHeight: number
): LocalGeometry {
  const { left, top, right, bottom } = anchor;
  let x = left;
  let y = top;
  let width = right - left;
  let height = bottom - top;

  switch (corner) {
    case 'tl':
      x = pointer.x;
      y = pointer.y;
      width = right - x;
      height = bottom - y;
      break;
    case 'tr':
      y = pointer.y;
      width = pointer.x - left;
      height = bottom - y;
      break;
    case 'bl':
      x = pointer.x;
      width = right - x;
      height = pointer.y - top;
      break;
    case 'br':
      width = pointer.x - left;
      height = pointer.y - top;
      break;
  }

  if (width < MIN_SIZE) {
    if (corner === 'tl' || corner === 'bl') x = right - MIN_SIZE;
    width = MIN_SIZE;
  }
  if (height < MIN_SIZE) {
    if (corner === 'tl' || corner === 'tr') y = bottom - MIN_SIZE;
    height = MIN_SIZE;
  }

  return clampRect(x, y, width, height, imageWidth, imageHeight, MIN_SIZE);
}

function geoNearlyEqual(a: LocalGeometry, b: LocalGeometry, eps = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

function cloneGeo(geo: LocalGeometry): LocalGeometry {
  return { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
}

interface CornerNodes {
  group: Konva.Group;
  hitRect: Konva.Rect;
  handleGroup: Konva.Group;
}

export class RectShapeHost implements GroupDragPreviewCapable {
  readonly root: Konva.Group;

  private props: RectShapeHostProps;
  private maskLine: Konva.Line | null = null;
  private fillLine: Konva.Line | null = null;
  private strokeLine: Konva.Line;
  private highlightLines: Konva.Line[] = [];
  private highlightGroup: Konva.Group;
  private hitRect: Konva.Rect;
  private labelGroup: Konva.Group | null = null;
  private labelBg: Konva.Rect | null = null;
  private labelText: Konva.Text | null = null;
  private readonly cornerNodes: CornerNodes[] = [];

  private localGeometry: LocalGeometry | null = null;
  private geoRaf = 0;
  private awaitingStoreSync = false;
  private activeCorner: Corner | null = null;
  private hoveredCorner: Corner | null = null;
  private isBoxDragging = false;
  private isDragging = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private resizeAnchor: ResizeAnchor = { left: 0, top: 0, right: 0, bottom: 0 };
  private dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;
  private clickMoveSkipRef: MutableValue<boolean> = { current: false };
  private moveSessionEndRef: MutableValue<(() => void) | null> = { current: null };

  constructor(parent: Konva.Layer | Konva.Group, props: RectShapeHostProps) {
    this.props = props;
    this.root = new Konva.Group();

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

    this.hitRect = new Konva.Rect({
      name: 'annotation-hit',
      fill: 'transparent',
      visible: false,
    });
    this.hitRect.on('mousedown', (e) => this.handleBoxMouseDown(e));
    this.hitRect.on('dblclick', (e) => this.handleBoxDblClick(e));
    this.root.add(this.hitRect);

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
    this.syncAll();
  }

  update(props: RectShapeHostProps): void {
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
      prev.zoom !== props.zoom;

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
      if (
        Math.abs(pending.x - ann.x) > 0.01 ||
        Math.abs(pending.y - ann.y) > 0.01
      ) {
        this.props.onUpdate(ann.id, { x: pending.x, y: pending.y });
      }
    }

    this.root.destroy();
  }

  private getStoreGeo(): LocalGeometry {
    const { ann, imageWidth, imageHeight } = this.props;
    const pos = clampRectPosition(ann.x, ann.y, ann.width, ann.height, imageWidth, imageHeight);
    return { x: pos.x, y: pos.y, width: ann.width, height: ann.height };
  }

  private getDisplayGeo(): LocalGeometry {
    return cloneGeo(this.localGeometry ?? this.getStoreGeo());
  }

  private getGeo(): LocalGeometry {
    return this.localGeometry ?? this.getStoreGeo();
  }

  private applyGroupPosition(next: LocalGeometry): void {
    this.root.position({ x: next.x, y: next.y });
  }

  private scheduleLocalGeometry(next: LocalGeometry, immediate = false): void {
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

  private syncBoxLines(width: number, height: number): void {
    const { zoom, isSelected } = this.props;
    const chamfer = isSelected ? 0 : getChamferSize(width, height, zoom);
    const points = getBoxOutlinePoints(width, height, chamfer, true);
    for (const line of [this.maskLine, this.fillLine, this.strokeLine]) {
      line?.points(points);
    }
  }

  private syncAll(): void {
    const geo = this.getGeo();
    const { zoom, isSelected, isEditMode, showLabels } = this.props;

    this.applyGroupPosition(geo);
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
    this.syncHitRect(geo, isSelected, isEditMode);
    this.syncCorners(geo, isSelected, isEditMode, zoom);
    this.syncLabel(showLabels);
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

  private syncOuterHighlight(geo: LocalGeometry): void {
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

  private syncHitRect(geo: LocalGeometry, isSelected: boolean, isEditMode: boolean): void {
    const visible = isEditMode && isSelected;
    this.hitRect.visible(visible);
    if (visible) {
      this.hitRect.width(geo.width);
      this.hitRect.height(geo.height);
    }
  }

  private syncCorners(
    geo: LocalGeometry,
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

  private updateCornerPositions(): void {
    const geo = this.getGeo();
    CORNERS.forEach(({ getPos }, index) => {
      const nodes = this.cornerNodes[index];
      if (!nodes.group.visible()) return;
      nodes.group.position(getPos(geo.width, geo.height));
    });
  }

  private syncLabel(showLabels: boolean): void {
    if (!showLabels) {
      this.labelGroup?.visible(false);
      return;
    }

    const { labelName, groupId, color, zoom } = this.props;
    const screenScale = getScreenSpaceLabelInverseScale(zoom);
    const displayText =
      groupId != null ? formatCanvasLabel(groupId, labelName) : labelName;
    const { width: bgWidth, height: bgHeight } = getLabelScreenBgSize(displayText);

    if (!this.labelGroup) {
      this.labelGroup = new Konva.Group({ x: 0, y: 0, listening: false });
      this.labelBg = new Konva.Rect({ perfectDrawEnabled: false, listening: false });
      this.labelText = new Konva.Text({
        fontSize: LABEL_SCREEN_FONT_SIZE,
        fontFamily: LABEL_FONT_FAMILY,
        fontStyle: 'normal',
        fill: LABEL_TEXT_COLOR,
        align: 'center',
        verticalAlign: 'middle',
        wrap: 'none',
        perfectDrawEnabled: true,
        listening: false,
      });
      this.labelGroup.add(this.labelBg);
      this.labelGroup.add(this.labelText);
      this.root.add(this.labelGroup);
    }

    this.labelGroup.visible(true);
    this.labelGroup.scaleX(screenScale);
    this.labelGroup.scaleY(screenScale);
    this.labelBg!.width(bgWidth);
    this.labelBg!.height(bgHeight);
    this.labelBg!.fill(color);
    this.labelText!.width(bgWidth);
    this.labelText!.height(bgHeight);
    this.labelText!.text(displayText);
  }

  private syncResizeVisuals(next: LocalGeometry): void {
    this.applyGroupPosition(next);
    this.syncBoxLines(next.width, next.height);
    const { isSelected, isEditMode } = this.props;
    if (isSelected && isEditMode) {
      this.syncOuterHighlightLive(next.width, next.height);
    }
    this.scheduleLocalGeometry(next, true);
    this.syncHitRect(next, isSelected, isEditMode);
  }

  private logDebug(phase: string, next: LocalGeometry | null): void {
    if (!DEBUG_DRAG) return;
    const { ann } = this.props;
    // eslint-disable-next-line no-console
    console.log(`[RectShapeHost:${ann.id}] ${phase}`, {
      Konva: { x: this.root.x(), y: this.root.y() },
      localGeometry: next ?? this.localGeometry,
      store: { x: ann.x, y: ann.y, w: ann.width, h: ann.height },
    });
  }

  private endCornerMoveSession(): void {
    endClickMoveSession(this.moveSessionEndRef);
  }

  private beginCornerMoveSession(captureFrom?: MouseEvent): void {
    this.endCornerMoveSession();
    const { clientToImage, imageWidth, imageHeight, onUpdate, onInteractEnd, onCornerHover } =
      this.props;

    this.moveSessionEndRef.current = startClickMoveSession({
      skipCommitRef: this.clickMoveSkipRef,
      captureFrom,
      onMove: (e) => {
        const raw = clientToImage(e.clientX, e.clientY);
        const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
        const cornerKey = this.activeCorner;
        if (!cornerKey) return;
        const next = computeResize(
          cornerKey,
          this.resizeAnchor,
          pointer,
          imageWidth,
          imageHeight
        );
        this.syncResizeVisuals(next);
      },
      onCommit: (e) => {
        const cornerKey = this.activeCorner;
        let latest = this.localGeometry;
        if (cornerKey) {
          const raw = clientToImage(e.clientX, e.clientY);
          const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
          latest = computeResize(
            cornerKey,
            this.resizeAnchor,
            pointer,
            imageWidth,
            imageHeight
          );
          this.localGeometry = latest;
          this.applyGroupPosition(latest);
        }
        if (latest) {
          this.awaitingStoreSync = true;
          this.logDebug('resizeEnd', latest);
          onUpdate(this.props.ann.id, {
            x: latest.x,
            y: latest.y,
            width: latest.width,
            height: latest.height,
          });
        }
        this.activeCorner = null;
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
    this.isBoxDragging = false;
    this.props.onBoxDrag(false);
    this.props.onDragEnd?.();
    this.props.onInteractEnd();
  }

  beginGroupDragPreview(): void {
    // 非主动拖动的方框：applyGroupDragPreview 基于 store 坐标计算
  }

  applyGroupDragPreview(dx: number, dy: number): void {
    const base = this.getStoreGeo();
    const next: LocalGeometry = {
      x: base.x + dx,
      y: base.y + dy,
      width: base.width,
      height: base.height,
    };
    this.localGeometry = next;
    this.applyGroupPosition(next);
    if (this.isDragging) {
      this.scheduleLocalGeometry(next, true);
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

    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragOffset = { x: pointer.x - current.x, y: pointer.y - current.y };

    this.isDragging = true;
    this.isBoxDragging = true;
    this.props.onBoxDrag(true);
    this.props.onDragStart?.(this.props.ann.id);
    this.logDebug('dragStart', current);

    const { imageWidth, imageHeight, onUpdate } = this.props;

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      const base = this.localGeometry;
      if (!base) return;

      const ptr = this.props.clientToImage(ev.clientX, ev.clientY);
      const rawX = ptr.x - this.dragOffset.x;
      const rawY = ptr.y - this.dragOffset.y;

      if (this.props.groupDragSync) {
        if (Math.abs(rawX - base.x) > 1 || Math.abs(rawY - base.y) > 1) {
          this.dragMoved = true;
        }
        this.props.onDragMove?.(this.props.ann.id, rawX, rawY);
        return;
      }

      const { x, y } = clampRectPosition(
        rawX,
        rawY,
        base.width,
        base.height,
        imageWidth,
        imageHeight
      );
      if (Math.abs(x - base.x) > 1 || Math.abs(y - base.y) > 1) {
        this.dragMoved = true;
      }
      const next: LocalGeometry = { x, y, width: base.width, height: base.height };
      this.localGeometry = next;
      this.applyGroupPosition(next);
      this.scheduleLocalGeometry(next, true);
      this.props.onDragMove?.(this.props.ann.id, x, y);
    };

    const onUp = () => {
      this.stopBoxDragListeners();
      if (!this.isDragging) return;

      const final = this.localGeometry;
      if (final) {
        const finalGeo: LocalGeometry = this.props.groupDragSync
          ? final
          : (() => {
              const clamped = clampRectPosition(
                final.x,
                final.y,
                final.width,
                final.height,
                imageWidth,
                imageHeight
              );
              return {
                x: clamped.x,
                y: clamped.y,
                width: final.width,
                height: final.height,
              };
            })();
        this.localGeometry = finalGeo;
        this.applyGroupPosition(finalGeo);
        this.awaitingStoreSync = true;
        this.logDebug('dragEnd', finalGeo);
        onUpdate(this.props.ann.id, { x: finalGeo.x, y: finalGeo.y });
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

  private handleCornerMouseDown(corner: Corner, e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.activeCorner !== null) return;

    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onCornerHover(true);
    this.hoveredCorner = corner;
    this.props.onInteractStart();

    const current = this.getDisplayGeo();
    this.localGeometry = current;
    this.awaitingStoreSync = false;

    this.resizeAnchor = {
      left: current.x,
      top: current.y,
      right: current.x + current.width,
      bottom: current.y + current.height,
    };
    this.activeCorner = corner;
    this.logDebug('resizeStart', current);
    this.syncAll();
    this.beginCornerMoveSession(e.evt);
  }

  private handleCornerMouseEnter(corner: Corner): void {
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

  private handleCornerMouseLeave(corner: Corner): void {
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
