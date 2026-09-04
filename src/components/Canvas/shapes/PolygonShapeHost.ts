import Konva from 'konva';
import { getPolygonBBox } from '../../../types';
import { clampPoint, clampPolygonPoints, translatePolygonPoints } from '../../../utils/annotationBounds';
import {
  armSkipNextCommit,
  endClickMoveSession,
  startClickMoveSession,
  type MutableValue,
} from '../../../utils/clickMoveInteraction';
import {
  insertPolygonVertex,
  nearestPolygonEdge,
} from '../../../utils/polygonGeometry';
import {
  applyShapeColors,
  getPolygonChamferOutlinePoints,
  getStrokeWidthScreen,
  imageSizeForZoom,
  SHAPE_HIT_SIZE,
  SHOW_MASKS,
  FILL_DRAWING_ENABLED,
  POLYGON_LINE_JOIN,
} from '../../../utils/shapeStyle';
import {
  type LabelNodes,
  renderVertexHandle,
  syncAnnotationLabel,
  syncOuterHighlightLines,
} from './shapeHostHelpers';
import type { GroupDragPreviewCapable } from './groupDragPreview';
import { rigidTranslatePoints } from './groupDragPreview';
import type { PolygonShapeHostProps } from './types';

function clonePoints(points: number[]): number[] {
  return [...points];
}

function pointsNearlyEqual(a: number[], b: number[], eps = 0.5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

function geometryFromPoints(points: number[]) {
  const bbox = getPolygonBBox(points);
  return {
    points,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
  };
}

interface VertexNodes {
  group: Konva.Group;
  hitRect: Konva.Rect;
  handleGroup: Konva.Group;
}

export class PolygonShapeHost implements GroupDragPreviewCapable {
  readonly root: Konva.Group;

  private props: PolygonShapeHostProps;
  private maskLine: Konva.Line | null = null;
  private fillLine: Konva.Line | null = null;
  private strokeLine: Konva.Line;
  private highlightLines: Konva.Line[] = [];
  private highlightGroup: Konva.Group;
  private hitLine: Konva.Line;
  private edgeHitLine: Konva.Line;
  private edgePreviewGroup: Konva.Group | null = null;
  private edgePreviewHandle: Konva.Group | null = null;
  private labelNodes: LabelNodes | null = null;
  private vertexNodes: VertexNodes[] = [];

  private localPoints: number[] | null = null;
  private pointsRaf = 0;
  private awaitingStoreSync = false;
  private activeVertex: number | null = null;
  private hoveredVertex: number | null = null;
  private hoveredEdge: number | null = null;
  private edgePreviewPoint: { x: number; y: number } | null = null;
  private isDragging = false;
  private dragMoved = false;
  private dragStartPointer = { x: 0, y: 0 };
  private dragStartPoints: number[] = [];
  private vertexAnchor: number[] = [];
  private dragListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;
  private clickMoveSkipRef: MutableValue<boolean> = { current: false };
  private moveSessionEndRef: MutableValue<(() => void) | null> = { current: null };

  constructor(parent: Konva.Layer | Konva.Group, props: PolygonShapeHostProps) {
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
      lineJoin: POLYGON_LINE_JOIN,
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
    this.hitLine.on('mousedown', (e) => this.handleWholeMouseDown(e));
    this.hitLine.on('dblclick', (e) => this.handleWholeDblClick(e));
    this.root.add(this.hitLine);

    this.edgeHitLine = new Konva.Line({
      name: 'polygon-edge-hit',
      closed: true,
      stroke: 'rgba(0,0,0,0.001)',
      strokeWidth: 1,
      fillEnabled: false,
      visible: false,
    });
    this.edgeHitLine.on('mousemove', (e) => this.handleEdgeMouseMove(e));
    this.edgeHitLine.on('mouseleave', () => this.clearEdgeHover());
    this.edgeHitLine.on('mousedown', (e) => this.handleEdgeMouseDown(e));
    this.root.add(this.edgeHitLine);

    parent.add(this.root);
    this.syncAll();
  }

  update(props: PolygonShapeHostProps): void {
    this.props = props;

    const storePoints = this.getStorePoints();
    if (this.localPoints && pointsNearlyEqual(storePoints, this.localPoints)) {
      this.awaitingStoreSync = false;
      this.localPoints = null;
    }

    this.syncAll();
  }

  destroy(): void {
    this.stopDragListeners();
    this.endVertexMoveSession();
    if (this.pointsRaf) cancelAnimationFrame(this.pointsRaf);

    const pending = this.localPoints;
    const store = this.props.ann.points;
    if (
      pending &&
      store &&
      !pointsNearlyEqual(pending, store) &&
      !this.awaitingStoreSync
    ) {
      this.props.onUpdate(this.props.ann.id, geometryFromPoints(pending));
    }

    this.root.destroy();
  }

  private getStorePoints(): number[] {
    const { ann, imageWidth, imageHeight } = this.props;
    if (!ann.points?.length) return [];
    return imageWidth > 0 && imageHeight > 0
      ? clampPolygonPoints(ann.points, imageWidth, imageHeight)
      : ann.points;
  }

  private getDisplayPoints(): number[] {
    return clonePoints(this.localPoints ?? this.getStorePoints());
  }

  private scheduleLocalPoints(next: number[]): void {
    this.localPoints = next;
    if (this.pointsRaf) return;
    this.pointsRaf = requestAnimationFrame(() => {
      this.pointsRaf = 0;
      this.syncGeometryFromPoints(next);
    });
  }

  private syncGeometryFromPoints(displayPoints: number[]): void {
    const { zoom, isSelected, isEditMode } = this.props;
    const colors = applyShapeColors(this.props.color, isSelected, this.activeVertex !== null);
    const strokeWidth = getStrokeWidthScreen(isSelected, zoom);
    const showShapeFill = FILL_DRAWING_ENABLED && isSelected && !this.activeVertex;
    const outlinePoints = getPolygonChamferOutlinePoints(displayPoints, zoom);
    const pathPoints = isSelected ? displayPoints : outlinePoints;

    for (const line of [this.maskLine, this.fillLine]) {
      line?.points(displayPoints);
    }
    this.strokeLine.points(pathPoints);
    this.strokeLine.stroke(colors.strokeColor);
    this.strokeLine.strokeWidth(strokeWidth);
    this.hitLine.points(displayPoints);
    this.edgeHitLine.points(displayPoints);

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

    this.syncOuterHighlight(pathPoints);
    this.syncVertices(displayPoints);
    this.syncEdgePreview();
    this.syncLabel(displayPoints);
  }

  private syncAll(): void {
    const displayPoints = this.getDisplayPoints();
    const { zoom, isSelected, isEditMode } = this.props;
    const edgeHitEpsilon = imageSizeForZoom(10, zoom);
    const hitSize = imageSizeForZoom(SHAPE_HIT_SIZE, zoom);

    const editVisible = isSelected && isEditMode;
    this.hitLine.visible(editVisible);
    this.edgeHitLine.visible(editVisible);
    if (editVisible) {
      this.edgeHitLine.hitStrokeWidth(edgeHitEpsilon * 2);
    }

    this.syncGeometryFromPoints(displayPoints);
    void hitSize;
  }

  private syncOuterHighlight(pathPoints: number[]): void {
    const { zoom, isSelected } = this.props;
    this.highlightLines = syncOuterHighlightLines(
      this.highlightGroup,
      this.highlightLines,
      pathPoints,
      true,
      zoom,
      isSelected
    );
  }

  private ensureVertexNodes(count: number): void {
    while (this.vertexNodes.length < count) {
      const group = new Konva.Group({ visible: false });
      const hitRect = new Konva.Rect({ fill: 'transparent' });
      const handleGroup = new Konva.Group({ listening: false });
      const index = this.vertexNodes.length;

      hitRect.on('mousedown', (e) => this.handleVertexMouseDown(index, e));
      hitRect.on('mouseenter', () => this.handleVertexMouseEnter(index));
      hitRect.on('mouseleave', () => this.handleVertexMouseLeave(index));

      group.add(hitRect);
      group.add(handleGroup);
      this.root.add(group);
      this.vertexNodes.push({ group, hitRect, handleGroup });
    }
    while (this.vertexNodes.length > count) {
      this.vertexNodes.pop()?.group.destroy();
    }
  }

  private syncVertices(displayPoints: number[]): void {
    const { zoom, isSelected, isEditMode } = this.props;
    const visible = isSelected && isEditMode;
    const hitSize = imageSizeForZoom(SHAPE_HIT_SIZE, zoom);
    const vertexCount = displayPoints.length / 2;

    this.ensureVertexNodes(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const nodes = this.vertexNodes[i];
      nodes.group.visible(visible);
      if (!visible) continue;

      nodes.group.position({ x: displayPoints[i * 2], y: displayPoints[i * 2 + 1] });
      nodes.hitRect.x(-hitSize / 2);
      nodes.hitRect.y(-hitSize / 2);
      nodes.hitRect.width(hitSize);
      nodes.hitRect.height(hitSize);

      const isActive = this.activeVertex === i;
      const isHovered = this.hoveredVertex === i && !isActive;
      renderVertexHandle(nodes.handleGroup, {
        zoom,
        emphasized: isHovered || isActive,
      });
      nodes.group.moveToTop();
    }
  }

  private syncEdgePreview(): void {
    const { zoom, isSelected, isEditMode } = this.props;
    const show =
      isSelected &&
      isEditMode &&
      this.hoveredEdge !== null &&
      this.edgePreviewPoint !== null &&
      this.activeVertex === null;

    if (!show || !this.edgePreviewPoint) {
      this.edgePreviewGroup?.visible(false);
      return;
    }

    if (!this.edgePreviewGroup) {
      this.edgePreviewGroup = new Konva.Group({ listening: false });
      this.edgePreviewHandle = new Konva.Group({ listening: false });
      this.edgePreviewGroup.add(this.edgePreviewHandle);
      this.root.add(this.edgePreviewGroup);
    }

    this.edgePreviewGroup.visible(true);
    this.edgePreviewGroup.position(this.edgePreviewPoint);
    renderVertexHandle(this.edgePreviewHandle!, {
      zoom,
      emphasized: true,
    });
  }

  private syncLabel(displayPoints: number[]): void {
    const bbox = getPolygonBBox(displayPoints);
    this.labelNodes = syncAnnotationLabel(this.root, this.labelNodes, {
      labelName: this.props.labelName,
      groupId: this.props.groupId,
      color: this.props.color,
      zoom: this.props.zoom,
      showLabels: this.props.showLabels,
      x: bbox.x,
      y: bbox.y,
    });
  }

  private commitGeometry(nextPoints: number[]): void {
    const { imageWidth, imageHeight, onUpdate } = this.props;
    const clamped =
      imageWidth > 0 && imageHeight > 0
        ? clampPolygonPoints(nextPoints, imageWidth, imageHeight)
        : nextPoints;
    this.localPoints = clamped;
    this.awaitingStoreSync = true;
    onUpdate(this.props.ann.id, geometryFromPoints(clamped));
  }

  private findEdgeAtPointer(clientX: number, clientY: number) {
    const { clientToImage, zoom } = this.props;
    const pointer = clientToImage(clientX, clientY);
    const edgeHitEpsilon = imageSizeForZoom(10, zoom);
    const hitSize = imageSizeForZoom(SHAPE_HIT_SIZE, zoom);
    return nearestPolygonEdge(
      this.getDisplayPoints(),
      pointer.x,
      pointer.y,
      edgeHitEpsilon,
      hitSize / 2
    );
  }

  private clearEdgeHover(): void {
    this.hoveredEdge = null;
    this.edgePreviewPoint = null;
    if (this.activeVertex === null && this.hoveredVertex === null) {
      this.props.onCornerHover(false);
    }
    this.syncEdgePreview();
  }

  private stopDragListeners(): void {
    if (this.dragListeners) {
      window.removeEventListener('mousemove', this.dragListeners.move);
      window.removeEventListener('mouseup', this.dragListeners.up);
      this.dragListeners = null;
    }
  }

  private finishDrag(): void {
    this.isDragging = false;
    this.props.onBoxDrag(false);
    this.props.onDragEnd?.();
    this.props.onInteractEnd();
  }

  beginGroupDragPreview(): void {}

  applyGroupDragPreview(dx: number, dy: number): void {
    const base = this.getStorePoints();
    const next = rigidTranslatePoints(base, dx, dy);
    this.localPoints = next;
    this.syncGeometryFromPoints(next);
  }

  clearGroupDragPreview(): void {
    if (this.isDragging || this.awaitingStoreSync) return;
    this.localPoints = null;
    this.syncAll();
  }

  private endVertexMoveSession(): void {
    endClickMoveSession(this.moveSessionEndRef);
  }

  private beginVertexMoveSession(captureFrom?: MouseEvent): void {
    this.endVertexMoveSession();
    const { clientToImage, imageWidth, imageHeight } = this.props;

    this.moveSessionEndRef.current = startClickMoveSession({
      skipCommitRef: this.clickMoveSkipRef,
      captureFrom,
      onMove: (e) => {
        const raw = clientToImage(e.clientX, e.clientY);
        const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
        const vertexIndex = this.activeVertex;
        if (vertexIndex === null) return;
        const next = clonePoints(this.vertexAnchor);
        next[vertexIndex * 2] = pointer.x;
        next[vertexIndex * 2 + 1] = pointer.y;
        this.scheduleLocalPoints(next);
      },
      onCommit: (e) => {
        const vertexIndex = this.activeVertex;
        if (vertexIndex !== null) {
          const raw = clientToImage(e.clientX, e.clientY);
          const pointer = clampPoint(raw.x, raw.y, imageWidth, imageHeight);
          const next = clonePoints(this.vertexAnchor);
          next[vertexIndex * 2] = pointer.x;
          next[vertexIndex * 2 + 1] = pointer.y;
          this.scheduleLocalPoints(next);
        }
        const latest = this.localPoints;
        if (latest) {
          this.commitGeometry(latest);
        }
        this.activeVertex = null;
        this.hoveredVertex = null;
        this.hoveredEdge = null;
        this.edgePreviewPoint = null;
        this.props.onCornerHover(false);
        this.props.onInteractEnd();
        this.endVertexMoveSession();
        this.syncAll();
      },
    });
  }

  private handleEdgeMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode } = this.props;
    if (!isSelected || !isEditMode || this.activeVertex !== null) return;
    const edge = this.findEdgeAtPointer(e.evt.clientX, e.evt.clientY);
    if (edge) {
      this.hoveredEdge = edge.edgeIndex;
      this.edgePreviewPoint = edge.projected;
      this.props.onCornerHover(true);
    } else {
      this.clearEdgeHover();
    }
    this.syncEdgePreview();
  }

  private handleEdgeMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode } = this.props;
    if (!isSelected || !isEditMode || this.activeVertex !== null) return;
    const edge = this.findEdgeAtPointer(e.evt.clientX, e.evt.clientY);
    if (!edge) return;

    e.cancelBubble = true;
    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onInteractStart();
    this.props.onCornerHover(true);

    const current = this.getDisplayPoints();
    const inserted = insertPolygonVertex(
      current,
      edge.edgeIndex,
      edge.projected.x,
      edge.projected.y
    );
    this.localPoints = inserted;
    this.vertexAnchor = clonePoints(inserted);
    this.awaitingStoreSync = false;
    this.activeVertex = edge.edgeIndex;
    this.hoveredEdge = edge.edgeIndex;
    this.edgePreviewPoint = { x: edge.projected.x, y: edge.projected.y };
    this.syncAll();
    this.beginVertexMoveSession(e.evt);
  }

  private handleWholeMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const { isSelected, isEditMode, allowBoxDrag, imageWidth, imageHeight } = this.props;
    if (!isSelected || !isEditMode || !allowBoxDrag || this.activeVertex !== null || this.isDragging) return;
    if (this.findEdgeAtPointer(e.evt.clientX, e.evt.clientY)) return;
    e.cancelBubble = true;
    this.props.onInteractStart();
    this.dragMoved = false;

    const current = this.getDisplayPoints();
    this.localPoints = current;
    const pointer = this.props.clientToImage(e.evt.clientX, e.evt.clientY);
    this.dragStartPointer = pointer;
    this.dragStartPoints = current;

    this.isDragging = true;
    this.props.onBoxDrag(true);
    this.props.onDragStart?.(this.props.ann.id);
    this.syncAll();

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      const ptr = this.props.clientToImage(ev.clientX, ev.clientY);
      const dx = ptr.x - this.dragStartPointer.x;
      const dy = ptr.y - this.dragStartPointer.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this.dragMoved = true;

      if (this.props.groupDragSync) {
        const startBbox = getPolygonBBox(this.dragStartPoints);
        this.props.onDragMove?.(this.props.ann.id, startBbox.x + dx, startBbox.y + dy);
        return;
      }

      const next =
        imageWidth > 0 && imageHeight > 0
          ? translatePolygonPoints(this.dragStartPoints, dx, dy, imageWidth, imageHeight)
          : translatePolygonPoints(this.dragStartPoints, dx, dy, 0, 0);
      this.scheduleLocalPoints(next);
      const bbox = getPolygonBBox(next);
      this.props.onDragMove?.(this.props.ann.id, bbox.x, bbox.y);
    };

    const onUp = () => {
      this.stopDragListeners();
      if (!this.isDragging) return;
      const final = this.localPoints ?? this.getDisplayPoints();
      this.commitGeometry(final);
      this.finishDrag();
    };

    this.dragListeners = { move: onMove, up: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private handleWholeDblClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    this.props.onEditLabel?.(this.props.ann.id);
  }

  private handleVertexMouseDown(index: number, e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    if (this.activeVertex !== null) return;

    armSkipNextCommit(this.clickMoveSkipRef);
    this.props.onCornerHover(true);
    this.hoveredVertex = index;
    this.props.onInteractStart();

    const current = this.getDisplayPoints();
    this.localPoints = current;
    this.vertexAnchor = clonePoints(current);
    this.awaitingStoreSync = false;
    this.activeVertex = index;
    this.syncAll();
    this.beginVertexMoveSession(e.evt);
  }

  private handleVertexMouseEnter(index: number): void {
    if (this.props.isEditMode) {
      this.hoveredVertex = index;
      this.props.onCornerHover(true);
      this.syncVertices(this.getDisplayPoints());
    }
  }

  private handleVertexMouseLeave(index: number): void {
    if (this.hoveredVertex === index) {
      this.hoveredVertex = null;
    }
    if (this.activeVertex === null) {
      this.props.onCornerHover(false);
    }
    this.syncVertices(this.getDisplayPoints());
  }
}
