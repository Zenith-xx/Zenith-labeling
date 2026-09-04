import Konva from 'konva';
import { clampPoint, clampRect, clampRectPosition } from '../../../utils/annotationBounds';
import {
  armSkipNextCommit,
  endClickMoveSession,
  startClickMoveSession,
  type MutableValue,
} from '../../../utils/clickMoveInteraction';
import { getKeypointNamesForClass } from '../../../utils/poseConfig';
import { isPoseKeypointVisible, setPoseKeypoint } from '../../../utils/poseGeometry';
import {
  applyShapeColors,
  getBoxOutlinePoints,
  getChamferSize,
  getShapeStrokeWidthImage,
  imageSizeForZoom,
  POINT_DRAG_HIT_SIZE,
  POINT_HIT_SIZE,
  SHAPE_HIT_SIZE,
} from '../../../utils/shapeStyle';
import {
  renderPoseKeypointMarker,
  renderVertexHandle,
  syncAnnotationLabel,
  syncOuterHighlightLines,
  type LabelNodes,
} from './shapeHostHelpers';
import type { GroupDragPreviewCapable } from './groupDragPreview';
import type { PoseShapeHostProps } from './types';

const MIN_SIZE = 5;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface LocalGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  keypoints: number[];
}

type ResizeAnchor = { left: number; top: number; right: number; bottom: number };

const CORNERS: { key: Corner; getPos: (w: number, h: number) => { x: number; y: number } }[] = [
  { key: 'tl', getPos: () => ({ x: 0, y: 0 }) },
  { key: 'tr', getPos: (w) => ({ x: w, y: 0 }) },
  { key: 'bl', getPos: (_, h) => ({ x: 0, y: h }) },
  { key: 'br', getPos: (w, h) => ({ x: w, y: h }) },
];

function cloneKeypoints(keypoints: number[]): number[] {
  return [...keypoints];
}

function geometryFromAnnotation(ann: PoseShapeHostProps['ann']): LocalGeometry {
  return {
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
    keypoints: cloneKeypoints(ann.keypoints ?? []),
  };
}

function boxGeoNearlyEqual(a: LocalGeometry, b: LocalGeometry, eps = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

function computeResize(
  corner: Corner,
  anchor: ResizeAnchor,
  pointer: { x: number; y: number },
  imageWidth: number,
  imageHeight: number
): Pick<LocalGeometry, 'x' | 'y' | 'width' | 'height'> {
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

interface CornerNodes {
  group: Konva.Group;
  hitRect: Konva.Rect;
  handleGroup: Konva.Group;
}

interface KeypointNodes {
  group: Konva.Group;
  hoverHitRect: Konva.Rect;
  dragHitRect: Konva.Rect;
  markerGroup: Konva.Group;
}

/**
 * Pose 标注：包围框与关键点使用图像绝对坐标，可独立拖动。
 * 移动方框不会带动关键点。
 */
export class PoseShapeHost implements GroupDragPreviewCapable {
  readonly root: Konva.Group;

  private props: PoseShapeHostProps;
  /** 仅承载包围框、角点与标签 */
  private boxGroup: Konva.Group;
  private strokeLine: Konva.Line;
  private highlightLines: Konva.Line[] = [];
  private highlightGroup: Konva.Group;
  private hitRect: Konva.Rect;
  private labelNodes: LabelNodes | null = null;
  private readonly cornerNodes: CornerNodes[] = [];
  private keypointNodes = new Map<number, KeypointNodes>();

  private localGeometry: LocalGeometry | null = null;
  private awaitingStoreSync = false;
  private isDragging = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private dragStartGeo: LocalGeometry | null = null;
  private dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;

  private activeKeypoint: number | null = null;
  private hoveredKeypoint: number | null = null;
  private activeCorner: Corner | null = null;
  private hoveredCorner: Corner | null = null;

  private clickMoveSkipRef: MutableValue<boolean> = { current: false };
  private keypointMoveSessionEndRef: MutableValue<(() => void) | null> = { current: null };
  private cornerMoveSessionEndRef: MutableValue<(() => void) | null> = { current: null };

  constructor(parent: Konva.Layer | Konva.Group, props: PoseShapeHostProps) {
    this.props = props;
    this.root = new Konva.Group();
    this.boxGroup = new Konva.Group();
    this.root.add(this.boxGroup);

    this.strokeLine = new Konva.Line({
      name: 'annotation-shape',
      closed: true,
      lineJoin: 'miter',
      fill: 'transparent',
      listening: false,
    });
    this.boxGroup.add(this.strokeLine);

    this.highlightGroup = new Konva.Group({ listening: false });
    this.boxGroup.add(this.highlightGroup);

    this.hitRect = new Konva.Rect({
      name: 'annotation-hit',
      fill: 'transparent',
      visible: false,
    });
    this.hitRect.on('mousedown', (e) => this.handleBoxMouseDown(e));
    this.hitRect.on('dblclick', (e) => this.handleBoxDblClick(e));
    this.boxGroup.add(this.hitRect);

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
      this.boxGroup.add(group);
      this.cornerNodes.push({ group, hitRect, handleGroup });
    }

    parent.add(this.root);
    this.syncAll();
  }

  update(props: PoseShapeHostProps): void {
    this.props = props;
    const storeGeo = geometryFromAnnotation(props.ann);
    if (this.localGeometry && boxGeoNearlyEqual(storeGeo, this.localGeometry)) {
      this.awaitingStoreSync = false;
      this.localGeometry = null;
    }
    this.syncAll();
  }

  destroy(): void {
    this.stopDragListeners();
    this.endKeypointMoveSession();
    this.endCornerMoveSession();
    this.root.destroy();
  }

  private getGeo(): LocalGeometry {
    return this.localGeometry ?? geometryFromAnnotation(this.props.ann);
  }

  private getKeypointNames(): string[] {
    return getKeypointNamesForClass(this.props.poseConfig, this.props.labelName);
  }

  /** 关键点使用图像绝对坐标 */
  private getKeypointItems(geo: LocalGeometry) {
    const items: { x: number; y: number; index: number; name: string }[] = [];
    const kpts = geo.keypoints;
    const keypointNames = this.getKeypointNames();
    for (let i = 0; i < kpts.length; i += 3) {
      const v = kpts[i + 2] ?? 0;
      if (!isPoseKeypointVisible(v)) continue;
      const x = kpts[i];
      const y = kpts[i + 1];
      if (x === 0 && y === 0) continue;
      const index = i / 3;
      items.push({
        x,
        y,
        index,
        name: keypointNames[index] ?? `kpt${index}`,
      });
    }
    return items;
  }

  private applyBoxPosition(next: Pick<LocalGeometry, 'x' | 'y'>): void {
    this.boxGroup.position({ x: next.x, y: next.y });
    this.root.getLayer()?.batchDraw();
  }

  private mergeResizeIntoGeometry(
    resize: Pick<LocalGeometry, 'x' | 'y' | 'width' | 'height'>
  ): LocalGeometry {
    const base = this.localGeometry ?? geometryFromAnnotation(this.props.ann);
    return {
      ...resize,
      keypoints: cloneKeypoints(base.keypoints),
    };
  }

  private syncAll(): void {
    const geo = this.getGeo();
    const { zoom, isSelected, isEditMode, showLabels } = this.props;

    this.applyBoxPosition(geo);

    const chamfer = isSelected ? 0 : getChamferSize(geo.width, geo.height, zoom);
    const outlinePoints = getBoxOutlinePoints(geo.width, geo.height, chamfer, true);
    const colors = applyShapeColors(this.props.color, isSelected, this.activeCorner !== null);
    const strokeWidth = getShapeStrokeWidthImage(zoom);

    this.strokeLine.points(outlinePoints);
    this.strokeLine.stroke(colors.strokeColor);
    this.strokeLine.strokeWidth(strokeWidth);

    const highlightPoints = isSelected
      ? getBoxOutlinePoints(geo.width, geo.height, 0, false)
      : outlinePoints;

    this.highlightLines = syncOuterHighlightLines(
      this.highlightGroup,
      this.highlightLines,
      highlightPoints,
      true,
      zoom,
      isSelected
    );

    const editVisible = isEditMode && isSelected;
    this.hitRect.visible(editVisible);
    if (editVisible) {
      this.hitRect.width(geo.width);
      this.hitRect.height(geo.height);
    }

    this.syncCorners(geo, isSelected, isEditMode, zoom);
    this.syncKeypoints(geo, isSelected, isEditMode, zoom, showLabels);
    this.syncLabel(showLabels);
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

      nodes.group.position(getPos(geo.width, geo.height));
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

  private ensureKeypointNode(index: number): KeypointNodes {
    let nodes = this.keypointNodes.get(index);
    if (nodes) return nodes;

    const group = new Konva.Group();
    const hoverHitRect = new Konva.Rect({ fill: 'transparent' });
    const dragHitRect = new Konva.Rect({ fill: 'transparent' });
    const markerGroup = new Konva.Group({ listening: false });

    hoverHitRect.on('mouseenter', () => this.handleKeypointMouseEnter(index));
    hoverHitRect.on('mouseleave', () => this.handleKeypointMouseLeave(index));
    dragHitRect.on('mousedown', (e) => this.handleKeypointMouseDown(index, e));
    dragHitRect.on('dblclick', (e) => {
      e.cancelBubble = true;
      this.props.onEditLabel?.(this.props.ann.id);
    });

    group.add(hoverHitRect);
    group.add(dragHitRect);
    group.add(markerGroup);
    this.root.add(group);
    nodes = { group, hoverHitRect, dragHitRect, markerGroup };
    this.keypointNodes.set(index, nodes);
    return nodes;
  }

  private syncKeypoints(
    geo: LocalGeometry,
    isSelected: boolean,
    isEditMode: boolean,
    zoom: number,
    showLabels: boolean
  ): void {
    const items = this.getKeypointItems(geo);
    const activeIds = new Set(items.map((item) => item.index));
    const hoverHitSize = imageSizeForZoom(POINT_HIT_SIZE, zoom);
    const dragHitSize = imageSizeForZoom(POINT_DRAG_HIT_SIZE, zoom);
    const { color, groupId, selectedKeypointIndex } = this.props;

    for (const [index, nodes] of this.keypointNodes) {
      if (!activeIds.has(index)) {
        nodes.group.visible(false);
      }
    }

    for (const item of items) {
      const nodes = this.ensureKeypointNode(item.index);
      const editable = isEditMode && isSelected;
      nodes.group.visible(true);
      nodes.group.position({ x: item.x, y: item.y });
      nodes.hoverHitRect.visible(editable);
      nodes.dragHitRect.visible(editable);
      if (editable) {
        nodes.hoverHitRect.x(-hoverHitSize / 2);
        nodes.hoverHitRect.y(-hoverHitSize / 2);
        nodes.hoverHitRect.width(hoverHitSize);
        nodes.hoverHitRect.height(hoverHitSize);
        nodes.dragHitRect.x(-dragHitSize / 2);
        nodes.dragHitRect.y(-dragHitSize / 2);
        nodes.dragHitRect.width(dragHitSize);
        nodes.dragHitRect.height(dragHitSize);
      }

      const emphasized =
        this.activeKeypoint === item.index ||
        this.hoveredKeypoint === item.index ||
        selectedKeypointIndex === item.index;

      renderPoseKeypointMarker(nodes.markerGroup, {
        zoom,
        color,
        name: item.name,
        groupId,
        isSelected: editable ? emphasized : false,
        showLabel: editable && emphasized,
      });
    }
  }

  private syncLabel(showLabels: boolean): void {
    this.labelNodes = syncAnnotationLabel(this.boxGroup, this.labelNodes, {
      labelName: this.props.labelName,
      groupId: this.props.groupId,
      color: this.props.color,
      zoom: this.props.zoom,
      showLabels,
      x: 0,
      y: 0,
    });
  }

  private stopDragListeners(): void {
    if (this.dragListeners) {
      window.removeEventListener('mousemove', this.dragListeners.move);
      window.removeEventListener('mouseup', this.dragListeners.up);
      this.dragListeners = null;
    }
  }

  private finishKeypointDrag(): void {
    this.isDragging = false;
    this.activeKeypoint = null;
    this.props.onCornerHover(false);
    this.props.onInteractEnd();
  }

  private finishBoxDrag(): void {
    this.isDragging = false;
    this.props.onBoxDrag(false);
    this.props.onDragEnd?.();
    this.props.onInteractEnd();
    this.stopDragListeners();
  }

  beginGroupDragPreview(): void {}

  applyGroupDragPreview(dx: number, dy: number): void {
    const base = geometryFromAnnotation(this.props.ann);
    const next: LocalGeometry = {
      ...base,
      x: base.x + dx,
      y: base.y + dy,
      keypoints: cloneKeypoints(base.keypoints),
    };
    this.localGeometry = next;
    this.boxGroup.position({ x: next.x, y: next.y });
  }

  clearGroupDragPreview(): void {
    if (this.isDragging || this.awaitingStoreSync) return;
    this.localGeometry = null;
    this.syncAll();
  }

  private endKeypointMoveSession(): void {
    endClickMoveSession(this.keypointMoveSessionEndRef);
  }

  private endCornerMoveSession(): void {
    endClickMoveSession(this.cornerMoveSessionEndRef);
  }

  private beginKeypointMoveSession(captureFrom?: MouseEvent): void {
    this.endKeypointMoveSession();
    const { clientToImage, imageWidth, imageHeight, onUpdate } = this.props;

    this.keypointMoveSessionEndRef.current = startClickMoveSession({
      skipCommitRef: this.clickMoveSkipRef,
      captureFrom,
      onMove: (ev) => {
        const base = this.localGeometry;
        if (!base) return;
        const keypointIndex = this.activeKeypoint;
        if (keypointIndex === null) return;
        const raw = clientToImage(ev.clientX, ev.clientY);
        const pointer = clampPoint(
          raw.x - this.dragOffset.x,
          raw.y - this.dragOffset.y,
          imageWidth,
          imageHeight
        );
        const nextKeypoints = setPoseKeypoint(
          base.keypoints,
          keypointIndex,
          pointer.x,
          pointer.y,
          base.keypoints[keypointIndex * 3 + 2] ?? 2
        );
        const next: LocalGeometry = { ...base, keypoints: nextKeypoints };
        this.localGeometry = next;
        this.syncAll();
      },
      onCommit: (e) => {
        const keypointIndex = this.activeKeypoint;
        const base = this.localGeometry;
        if (base && keypointIndex !== null) {
          const raw = clientToImage(e.clientX, e.clientY);
          const pointer = clampPoint(
            raw.x - this.dragOffset.x,
            raw.y - this.dragOffset.y,
            imageWidth,
            imageHeight
          );
          const nextKeypoints = setPoseKeypoint(
            base.keypoints,
            keypointIndex,
            pointer.x,
            pointer.y,
            base.keypoints[keypointIndex * 3 + 2] ?? 2
          );
          const next: LocalGeometry = { ...base, keypoints: nextKeypoints };
          this.localGeometry = next;
        }
        const final = this.localGeometry;
        if (final) {
          onUpdate(this.props.ann.id, { keypoints: final.keypoints });
        }
        this.localGeometry = null;
        this.finishKeypointDrag();
        this.endKeypointMoveSession();
        this.syncAll();
      },
    });
  }

  private beginCornerMoveSession(captureFrom?: MouseEvent): void {
    this.endCornerMoveSession();
    const { clientToImage, imageWidth, imageHeight, onUpdate, onInteractEnd, onCornerHover } =
      this.props;

    this.cornerMoveSessionEndRef.current = startClickMoveSession({
      skipCommitRef: this.clickMoveSkipRef,
      captureFrom,
      onMove: (e) => {
        const raw = clientToImage(e.clientX, e.clientY);
        const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
        const cornerKey = this.activeCorner;
        if (!cornerKey) return;
        const next = this.mergeResizeIntoGeometry(
          computeResize(cornerKey, this.resizeAnchor, pointer, imageWidth, imageHeight)
        );
        this.localGeometry = next;
        this.applyBoxPosition(next);
        this.syncAll();
      },
      onCommit: (e) => {
        const cornerKey = this.activeCorner;
        let latest = this.localGeometry;
        if (cornerKey) {
          const raw = clientToImage(e.clientX, e.clientY);
          const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
          latest = this.mergeResizeIntoGeometry(
            computeResize(cornerKey, this.resizeAnchor, pointer, imageWidth, imageHeight)
          );
          this.localGeometry = latest;
          this.applyBoxPosition(latest);
        }
        if (latest) {
          onUpdate(this.props.ann.id, {
            x: latest.x,
            y: latest.y,
            width: latest.width,
            height: latest.height,
          });
        }
        this.localGeometry = null;
        this.activeCorner = null;
        this.hoveredCorner = null;
        onCornerHover(false);
        onInteractEnd();
        this.endCornerMoveSession();
        this.syncAll();
      },
    });
  }

  private resizeAnchor: ResizeAnchor = { left: 0, top: 0, right: 0, bottom: 0 };

  private handleBoxMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode, allowBoxDrag } = this.props;
    if (
      !isSelected ||
      !isEditMode ||
      !allowBoxDrag ||
      this.isDragging ||
      this.activeKeypoint !== null ||
      this.activeCorner !== null
    ) {
      return;
    }
    e.cancelBubble = true;
    this.props.onInteractStart();
    this.dragMoved = false;

    const current = geometryFromAnnotation(this.props.ann);
    this.localGeometry = current;
    this.dragStartGeo = current;

    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragOffset = { x: pointer.x - current.x, y: pointer.y - current.y };

    this.isDragging = true;
    this.props.onBoxDrag(true);
    this.props.onDragStart?.(this.props.ann.id);

    const { imageWidth, imageHeight, onUpdate } = this.props;

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      const base = this.dragStartGeo;
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
      const next: LocalGeometry = {
        x,
        y,
        width: base.width,
        height: base.height,
        keypoints: cloneKeypoints(base.keypoints),
      };
      this.localGeometry = next;
      this.applyBoxPosition(next);
      this.syncAll();
      this.props.onDragMove?.(this.props.ann.id, x, y);
    };

    const onUp = () => {
      this.stopDragListeners();
      if (!this.isDragging) return;

      const final = this.localGeometry;
      if (final) {
        this.awaitingStoreSync = true;
        onUpdate(this.props.ann.id, { x: final.x, y: final.y });
      }
      this.dragStartGeo = null;
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

  private handleKeypointMouseDown(index: number, e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode } = this.props;
    if (!isSelected || !isEditMode || this.activeCorner !== null || this.activeKeypoint !== null) {
      return;
    }
    e.cancelBubble = true;
    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onInteractStart();
    this.props.onCornerHover(true);
    this.activeKeypoint = index;

    const current = geometryFromAnnotation(this.props.ann);
    this.localGeometry = current;
    const kptX = current.keypoints[index * 3] ?? 0;
    const kptY = current.keypoints[index * 3 + 1] ?? 0;
    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragOffset = { x: pointer.x - kptX, y: pointer.y - kptY };
    this.isDragging = true;
    this.syncAll();
    this.beginKeypointMoveSession(e.evt);
  }

  private handleKeypointMouseEnter(index: number): void {
    this.hoveredKeypoint = index;
    this.props.onSelectKeypoint(index);
    this.props.onCornerHover(true);
    this.syncAll();
  }

  private handleKeypointMouseLeave(index: number): void {
    if (this.activeKeypoint === index) return;
    this.hoveredKeypoint = null;
    this.props.onCornerHover(false);
    this.syncAll();
  }

  private handleCornerMouseDown(corner: Corner, e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode } = this.props;
    if (!isSelected || !isEditMode || this.activeKeypoint !== null || this.activeCorner !== null) {
      return;
    }
    e.cancelBubble = true;

    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onCornerHover(true);
    this.hoveredCorner = corner;
    this.props.onInteractStart();

    const current = geometryFromAnnotation(this.props.ann);
    this.localGeometry = current;
    this.resizeAnchor = {
      left: current.x,
      top: current.y,
      right: current.x + current.width,
      bottom: current.y + current.height,
    };
    this.activeCorner = corner;
    this.syncAll();
    this.beginCornerMoveSession(e.evt);
  }

  private handleCornerMouseEnter(corner: Corner): void {
    this.hoveredCorner = corner;
    this.props.onCornerHover(true);
    this.syncCorners(this.getGeo(), this.props.isSelected, this.props.isEditMode, this.props.zoom);
  }

  private handleCornerMouseLeave(corner: Corner): void {
    if (this.hoveredCorner === corner) {
      this.hoveredCorner = null;
    }
    if (!this.activeCorner) {
      this.props.onCornerHover(false);
    }
    this.syncCorners(this.getGeo(), this.props.isSelected, this.props.isEditMode, this.props.zoom);
  }
}
