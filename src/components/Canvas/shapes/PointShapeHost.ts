import Konva from 'konva';
import { clampPoint } from '../../../utils/annotationBounds';
import { imageSizeForZoom, POINT_DRAG_HIT_SIZE, POINT_HIT_SIZE } from '../../../utils/shapeStyle';
import { renderPoseKeypointMarker } from './shapeHostHelpers';
import type { GroupDragPreviewCapable } from './groupDragPreview';
import type { PointShapeHostProps } from './types';

export class PointShapeHost implements GroupDragPreviewCapable {
  readonly root: Konva.Group;

  private props: PointShapeHostProps;
  private markerGroup: Konva.Group;
  private hoverHitRect: Konva.Rect;
  private dragHitRect: Konva.Rect;

  private localPos: { x: number; y: number } | null = null;
  private awaitingStoreSync = false;
  private isDragging = false;
  private isHovered = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;

  constructor(parent: Konva.Layer | Konva.Group, props: PointShapeHostProps) {
    this.props = props;
    this.root = new Konva.Group();

    this.markerGroup = new Konva.Group({ listening: false });
    this.root.add(this.markerGroup);

    this.hoverHitRect = new Konva.Rect({ fill: 'transparent', visible: false });
    this.hoverHitRect.on('mouseenter', () => this.handleMouseEnter());
    this.hoverHitRect.on('mouseleave', () => this.handleMouseLeave());

    this.dragHitRect = new Konva.Rect({ fill: 'transparent', visible: false });
    this.dragHitRect.on('mousedown', (e) => this.handleMouseDown(e));
    this.dragHitRect.on('dblclick', (e) => this.handleDblClick(e));

    this.root.add(this.hoverHitRect);
    this.root.add(this.dragHitRect);

    parent.add(this.root);
    this.syncAll();
  }

  update(props: PointShapeHostProps): void {
    this.props = props;
    if (this.localPos) {
      const { x, y } = props.ann;
      if (Math.abs(x - this.localPos.x) < 0.01 && Math.abs(y - this.localPos.y) < 0.01) {
        this.awaitingStoreSync = false;
        this.localPos = null;
      }
    }
    this.syncAll();
  }

  destroy(): void {
    this.stopDragListeners();
    this.root.destroy();
  }

  private getPos(): { x: number; y: number } {
    return this.localPos ?? { x: this.props.ann.x, y: this.props.ann.y };
  }

  private syncAll(): void {
    const { zoom, isSelected, isEditMode, showLabels, color, labelName, groupId } = this.props;
    const pos = this.getPos();
    const hoverHitSize = imageSizeForZoom(POINT_HIT_SIZE, zoom);
    const dragHitSize = imageSizeForZoom(POINT_DRAG_HIT_SIZE, zoom);

    this.root.position(pos);
    renderPoseKeypointMarker(this.markerGroup, {
      zoom,
      color,
      name: labelName,
      groupId,
      isSelected: isSelected || this.isHovered || this.isDragging,
      showLabel: showLabels,
    });

    const editVisible = isEditMode && isSelected;
    this.hoverHitRect.visible(editVisible);
    this.dragHitRect.visible(editVisible);
    if (editVisible) {
      this.hoverHitRect.x(-hoverHitSize / 2);
      this.hoverHitRect.y(-hoverHitSize / 2);
      this.hoverHitRect.width(hoverHitSize);
      this.hoverHitRect.height(hoverHitSize);
      this.dragHitRect.x(-dragHitSize / 2);
      this.dragHitRect.y(-dragHitSize / 2);
      this.dragHitRect.width(dragHitSize);
      this.dragHitRect.height(dragHitSize);
    }
  }

  private stopDragListeners(): void {
    if (this.dragListeners) {
      window.removeEventListener('mousemove', this.dragListeners.move);
      window.removeEventListener('mouseup', this.dragListeners.up);
      this.dragListeners = null;
    }
  }

  private handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const {
      isEditMode,
      isSelected,
      allowBoxDrag,
      imageWidth,
      imageHeight,
      onUpdate,
      onInteractStart,
      onInteractEnd,
    } = this.props;
    if (!isEditMode || !isSelected || !allowBoxDrag) return;
    e.cancelBubble = true;
    onInteractStart();
    this.dragMoved = false;

    const current = { x: this.props.ann.x, y: this.props.ann.y };
    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragOffset = { x: pointer.x - current.x, y: pointer.y - current.y };
    this.localPos = current;
    this.isDragging = true;
    this.props.onDragStart?.(this.props.ann.id);
    this.syncAll();

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      const raw = this.props.clientToImage(ev.clientX, ev.clientY);
      const rawX = raw.x - this.dragOffset.x;
      const rawY = raw.y - this.dragOffset.y;

      if (this.props.groupDragSync) {
        if (Math.abs(rawX - current.x) > 1 || Math.abs(rawY - current.y) > 1) {
          this.dragMoved = true;
        }
        this.props.onDragMove?.(this.props.ann.id, rawX, rawY);
        return;
      }

      const next = clampPoint(rawX, rawY, imageWidth, imageHeight);
      if (Math.abs(next.x - current.x) > 1 || Math.abs(next.y - current.y) > 1) {
        this.dragMoved = true;
      }
      this.localPos = next;
      this.root.position(next);
      this.syncAll();
      this.props.onDragMove?.(this.props.ann.id, next.x, next.y);
    };

    const onUp = () => {
      this.stopDragListeners();
      if (!this.isDragging) return;
      this.isDragging = false;

      const final = this.localPos ?? current;
      if (this.dragMoved) {
        this.awaitingStoreSync = true;
        onUpdate(this.props.ann.id, final);
      } else {
        this.localPos = null;
      }
      this.props.onDragEnd?.();
      onInteractEnd();
      this.syncAll();
    };

    this.dragListeners = { move: onMove, up: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private handleMouseEnter(): void {
    this.isHovered = true;
    this.syncAll();
  }

  private handleMouseLeave(): void {
    if (!this.isDragging) {
      this.isHovered = false;
      this.syncAll();
    }
  }

  private handleDblClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.props.onEditLabel?.(this.props.ann.id);
  }

  beginGroupDragPreview(): void {}

  applyGroupDragPreview(dx: number, dy: number): void {
    const next = {
      x: this.props.ann.x + dx,
      y: this.props.ann.y + dy,
    };
    this.localPos = next;
    this.root.position(next);
  }

  clearGroupDragPreview(): void {
    if (this.isDragging || this.awaitingStoreSync) return;
    this.localPos = null;
    this.syncAll();
  }
}
