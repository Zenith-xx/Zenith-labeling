import Konva from 'konva';
import type { Annotation, ImageFile, PendingAnnotation } from '../../types';
import { getPolygonBBox } from '../../types';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { useThemeStore } from '../../store/useThemeStore';
import {
  loadImageElement,
  setPinnedImageIds,
  tryResolveImageElementFromCache,
} from '../../utils/imageLoader';
import { isTypingTarget } from '../../utils/keyboard';
import {
  clampPoint,
  clampRect,
  clampPolygonPoints,
  clampRectPosition,
  rectFromDiagonal,
  translatePolygonPoints,
} from '../../utils/annotationBounds';
import {
  computeFitZoom,
  clampViewZoom,
  getImageOffset,
  getViewportBoundsInImage,
  animateViewTransform,
  animateOpacity,
  viewTransformNeedsAnimation,
  ANNOTATION_FADE_DURATION_MS,
} from '../../utils/canvasView';
import { AnnotationSpatialIndex } from '../../utils/spatialIndex';
import {
  buildAnnotationMap,
  computeViewportRect,
  getVisibleAnnotations,
  pickAnnotationAtPoint,
} from '../../utils/annotationQuery';
import {
  getShapeStrokeWidthImage,
  imageSizeForZoom,
  getPolygonCloseThresholdImage,
  getPolygonCloseClickThresholdImage,
  getPolygonDblClickDistanceImage,
  getVertexSizeScreen,
  getHandleOuterRadiusImage,
  POLYGON_CLOSE_HINT_SCALE,
  POLYGON_DBLCLICK_INTERVAL_MS,
  CROSSHAIR_COLOR,
  CROSSHAIR_WIDTH,
  CROSSHAIR_OPACITY,
  ZOOM_STEP,
  FILL_DRAWING_ENABLED,
  POLYGON_DRAWING_FILL_COLOR,
  POLYGON_LINE_JOIN,
} from '../../utils/shapeStyle';
import { parseShortcutDigit } from '../../utils/labelShortcut';
import { isBlockingOverlayOpen, isEventOnBlockingOverlay } from '../../utils/uiOverlay';
import { formatAnnotationCanvasLabel } from '../../utils/annotationDisplay';
import { generateId } from '../../utils/id';
import {
  DeleteAnnotationsCommand,
  HideAnnotationCommand,
  MoveAnnotationCommand,
  BatchCommand,
  ObbGeometryCommand,
  PasteAnnotationsCommand,
  PolygonGeometryCommand,
  PoseGeometryCommand,
  ResizeAnnotationCommand,
  ShowAnnotationCommand,
  ShowAnnotationsCommand,
} from '../../history';
import {
  annotationPatchFromObb,
  buildObbFromParams,
  isPointOnObbRotateInteractionZone,
  obbFromAnnotation,
  obbGeometryEqual,
} from '../../utils/obbGeometry';
import {
  poseGeometryEqual,
  poseGeometryFromAnnotation,
} from '../../utils/poseGeometry';
import {
  buildDuplicateResult,
  buildPasteResult,
  copyAnnotationsToClipboard,
  getAnnotationsForCopy,
  hasAnnotationClipboard,
} from '../../utils/annotationClipboard';
import { RectShapeHost } from './shapes/RectShapeHost';
import { ObbShapeHost } from './shapes/ObbShapeHost';
import { PolygonShapeHost } from './shapes/PolygonShapeHost';
import { PointShapeHost } from './shapes/PointShapeHost';
import { PoseShapeHost } from './shapes/PoseShapeHost';
import {
  clampGroupDragDelta,
  isGroupDragPreviewCapable,
  rigidTranslatePoints,
  snapshotAnnotationForGroupDrag,
  type GroupDragSnapshot,
} from './shapes/groupDragPreview';
import {
  attachObbRotateHitZone,
  type ObbRotateHitZoneHandle,
  type ObbRotateHitZoneProps,
} from './shapes/obbRotateHitZone';
import type {
  ObbShapeHostProps,
  PoseShapeHostProps,
  RectShapeHostProps,
  ShapeHostContext,
  ShapeHostVisualProps,
} from './shapes/types';
import type {
  AnnotationLayerMode,
  DisplayFrame,
  DrawState,
  PanDragStart,
  PolygonCursor,
  PolygonLastClick,
  SpatialSyncState,
  TempRect,
} from './types';
import './index.css';

const DEBUG_PAN = false;

function pointsNearlyEqual(a: number[], b: number[], eps = 0.5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

type ShapeHostProps =
  | RectShapeHostProps
  | ObbShapeHostProps
  | PoseShapeHostProps
  | (ShapeHostVisualProps & ShapeHostContext);

type ShapeHostInstance = {
  update(props: ShapeHostProps): void;
  destroy(): void;
};

type ShapeHostCtor = new (parent: Konva.Layer, props: ShapeHostProps) => ShapeHostInstance;

interface ShapeHostRegistry {
  rectangle: ShapeHostCtor;
  'rotated-rectangle': ShapeHostCtor;
  polygon: ShapeHostCtor;
  point: ShapeHostCtor;
  pose: ShapeHostCtor;
}

export class CanvasController {
  private readonly container: HTMLElement;
  private readonly stage: Konva.Stage;
  private readonly backgroundLayer: Konva.Layer;
  private readonly annotationLayer: Konva.Layer;
  private readonly selectionLayer: Konva.Layer;
  private readonly interactionLayer: Konva.Layer;

  private backgroundImage: Konva.Image | null = null;
  private readonly crosshairGroup: Konva.Group;
  private readonly crosshairH: Konva.Line;
  private readonly crosshairV: Konva.Line;
  private readonly tempRectNode: Konva.Rect;
  private readonly pendingPreviewGroup: Konva.Group;
  private readonly polygonPreviewFill: Konva.Line;
  private readonly polygonPreviewLine: Konva.Line;
  private readonly polygonVertexGroup: Konva.Group;
  private readonly polygonOriginCircle: Konva.Circle;
  private readonly pendingPointGroup: Konva.Group;
  private readonly pendingPointCircle: Konva.Circle;

  private readonly shapeHosts = new Map<string, { host: ShapeHostInstance; mode: AnnotationLayerMode }>();
  private readonly shapeHostRegistry: ShapeHostRegistry = {
    rectangle: RectShapeHost,
    'rotated-rectangle': ObbShapeHost,
    polygon: PolygonShapeHost,
    point: PointShapeHost,
    pose: PoseShapeHost,
  };
  private obbRotateHitZone: ObbRotateHitZoneHandle | null = null;
  private obbRotateHover = false;

  private readonly spatialIndex = new AnnotationSpatialIndex();
  private annotationsById = new Map<string, Annotation>();
  private spatialSync: SpatialSyncState = { imageId: undefined, annotations: [] };

  private containerSize = { width: 800, height: 600 };
  private displayFrame: DisplayFrame | null = null;
  private drawState: DrawState = { placingSecondCorner: false, startX: 0, startY: 0 };
  private tempRect: TempRect | null = null;
  private polygonPoints: number[] = [];
  private polygonCursor: PolygonCursor | null = null;
  private polygonLastClick: PolygonLastClick | null = null;
  private annotationOpacity = 1;
  private imageLoading = false;
  private onImageLoadingChange: ((loading: boolean) => void) | null = null;

  private setImageLoading(loading: boolean): void {
    if (this.imageLoading === loading) return;
    this.imageLoading = loading;
    this.onImageLoadingChange?.(loading);
  }

  private interacting = false;
  private needFitImageId: string | null = null;
  private viewAnimCancel: (() => void) | null = null;
  private opacityAnimCancel: (() => void) | null = null;
  private selectedAnnotationRef: string | null = null;
  private selectedAnnotationIdsRef: string[] = [];
  private mousePosRaf = 0;
  private lastMousePos = { x: 0, y: 0 };
  private hasCrosshair = false;
  private isPanning = false;
  private isBoxDragging = false;
  private panDragStart: PanDragStart | null = null;
  private panPointer = { x: 0, y: 0 };
  private panLiveStage: { x: number; y: number } | null = null;
  private panRaf = 0;
  private panDebugFrame = 0;
  private isOverCorner = false;
  private groupDragSnapshots: Map<string, GroupDragSnapshot> | null = null;
  private groupDragDraggedId: string | null = null;
  private groupDragPending: { id: string; x: number; y: number } | null = null;
  private groupDragRaf = 0;
  private imageLoadCancel: (() => void) | null = null;
  private syncRaf = 0;
  private lastThemeKey = '';
  private lastClampImageId: string | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private unsubAnnotation: (() => void) | null = null;
  private unsubTheme: (() => void) | null = null;
  private destroyed = false;

  private onWindowMouseMove: ((e: MouseEvent) => void) | null = null;
  private onWindowMouseUp: (() => void) | null = null;
  private onCrosshairMove: ((e: MouseEvent) => void) | null = null;
  private onCrosshairLeave: (() => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onShortcutWheel: ((e: WheelEvent) => void) | null = null;

  constructor(
    stageContainer: HTMLElement,
    layoutContainer?: HTMLElement,
    onImageLoadingChange?: (loading: boolean) => void
  ) {
    this.onImageLoadingChange = onImageLoadingChange ?? null;
    this.container = layoutContainer ?? stageContainer;

    this.stage = new Konva.Stage({
      container: stageContainer as HTMLDivElement,
      width: this.containerSize.width,
      height: this.containerSize.height,
    });

    this.backgroundLayer = new Konva.Layer({ listening: false });
    this.annotationLayer = new Konva.Layer();
    this.selectionLayer = new Konva.Layer();
    this.interactionLayer = new Konva.Layer({ listening: false });

    this.stage.add(this.backgroundLayer);
    this.stage.add(this.annotationLayer);
    this.stage.add(this.selectionLayer);
    this.stage.add(this.interactionLayer);

    this.crosshairH = new Konva.Line({
      stroke: CROSSHAIR_COLOR,
      strokeWidth: getShapeStrokeWidthImage(1, CROSSHAIR_WIDTH),
      dash: [5, 4],
      dashScaleEnabled: false,
      listening: false,
    });
    this.crosshairV = new Konva.Line({
      stroke: CROSSHAIR_COLOR,
      strokeWidth: getShapeStrokeWidthImage(1, CROSSHAIR_WIDTH),
      dash: [5, 4],
      dashScaleEnabled: false,
      listening: false,
    });
    this.crosshairGroup = new Konva.Group({
      opacity: CROSSHAIR_OPACITY,
      visible: false,
      listening: false,
    });
    this.crosshairGroup.add(this.crosshairH);
    this.crosshairGroup.add(this.crosshairV);

    this.tempRectNode = new Konva.Rect({
      stroke: '#00ff00',
      dash: [6, 3],
      dashScaleEnabled: false,
      lineJoin: 'round',
      fill: 'rgba(0, 255, 0, 0.12)',
      visible: false,
      listening: false,
    });

    this.pendingPreviewGroup = new Konva.Group({ listening: false, visible: false });

    this.polygonPreviewFill = new Konva.Line({
      name: 'polygon-preview-fill',
      closed: true,
      fill: POLYGON_DRAWING_FILL_COLOR,
      strokeEnabled: false,
      listening: false,
      visible: false,
    });
    this.polygonPreviewLine = new Konva.Line({
      name: 'polygon-preview-line',
      stroke: '#00ff00',
      dashScaleEnabled: false,
      lineJoin: POLYGON_LINE_JOIN,
      fill: 'transparent',
      listening: false,
      visible: false,
    });
    this.polygonVertexGroup = new Konva.Group({ listening: false });
    this.polygonOriginCircle = new Konva.Circle({ fill: '#00ff00', listening: false, visible: false });

    this.pendingPointCircle = new Konva.Circle({
      fill: '#00ff00',
      perfectDrawEnabled: false,
      listening: false,
    });
    this.pendingPointGroup = new Konva.Group({ listening: false, visible: false });
    this.pendingPointGroup.add(this.pendingPointCircle);

    this.interactionLayer.add(this.pendingPreviewGroup);
    this.interactionLayer.add(this.tempRectNode);
    this.interactionLayer.add(this.polygonPreviewFill);
    this.interactionLayer.add(this.polygonPreviewLine);
    this.interactionLayer.add(this.polygonVertexGroup);
    this.interactionLayer.add(this.polygonOriginCircle);
    this.interactionLayer.add(this.pendingPointGroup);
    this.interactionLayer.add(this.crosshairGroup);

    this.bindStageEvents();
    this.bindResizeObserver();
    this.bindStoreSubscriptions();
    this.bindGlobalListeners();

    const imageId = useAnnotationStore.getState().currentImage?.id;
    if (imageId) {
      this.needFitImageId = imageId;
      this.annotationOpacity = 0;
    }

    this.syncFromStore();
    this.loadCurrentImage();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.cancelViewAnimations();
    this.imageLoadCancel?.();
    this.imageLoadCancel = null;

    if (this.syncRaf) cancelAnimationFrame(this.syncRaf);
    if (this.panRaf) cancelAnimationFrame(this.panRaf);
    if (this.mousePosRaf) cancelAnimationFrame(this.mousePosRaf);

    this.unsubAnnotation?.();
    this.unsubTheme?.();
    this.resizeObserver?.disconnect();

    if (this.onWindowMouseMove) {
      window.removeEventListener('mousemove', this.onWindowMouseMove);
    }
    if (this.onWindowMouseUp) {
      window.removeEventListener('mouseup', this.onWindowMouseUp);
    }
    if (this.onCrosshairMove) {
      window.removeEventListener('mousemove', this.onCrosshairMove);
    }
    if (this.onCrosshairLeave) {
      this.container.removeEventListener('mouseleave', this.onCrosshairLeave);
    }
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
    }
    if (this.onShortcutWheel) {
      this.container.removeEventListener('wheel', this.onShortcutWheel, { capture: true });
    }

    this.clearShapeHosts();
    this.destroyObbRotateHitZone();
    this.stage.destroy();
  }

  requestRender(): void {
    this.stage.getLayers().forEach((layer) => layer.batchDraw());
  }

  syncFromStore(): void {
    if (this.destroyed) return;

    const store = useAnnotationStore.getState();
    const themeKey = useThemeStore.getState().resolved;
    const currentImage = store.currentImage;
    const annotations = currentImage
      ? store.annotationsByImage[currentImage.id] ?? []
      : [];

    this.selectedAnnotationRef = store.selectedAnnotation;
    this.selectedAnnotationIdsRef = store.selectedAnnotationIds;

    this.rebuildSpatialIndex(currentImage?.id, annotations);
    this.clampRectanglesOnImageChange(currentImage, annotations);
    this.syncStageTransform(store.zoom, store.stagePosition);
    this.syncBackgroundImage();
    this.syncAnnotationLayers(store, themeKey, annotations);
    this.syncInteractionLayer(store);
    this.updateCursor(store);
    this.requestRender();
  }

  private annotationChangeNeedsCanvasSync(
    state: ReturnType<typeof useAnnotationStore.getState>,
    prev: ReturnType<typeof useAnnotationStore.getState>
  ): boolean {
    return (
      state.currentTool !== prev.currentTool ||
      state.currentImage !== prev.currentImage ||
      state.annotationsByImage !== prev.annotationsByImage ||
      state.selectedAnnotation !== prev.selectedAnnotation ||
      state.selectedAnnotationIds !== prev.selectedAnnotationIds ||
      state.zoom !== prev.zoom ||
      state.stagePosition !== prev.stagePosition ||
      state.showLabels !== prev.showLabels ||
      state.labels !== prev.labels ||
      state.waitingForLabel !== prev.waitingForLabel ||
      state.labelModalOpen !== prev.labelModalOpen ||
      state.pendingAnnotation !== prev.pendingAnnotation ||
      state.poseConfig !== prev.poseConfig ||
      state.selectedKeypointIndex !== prev.selectedKeypointIndex
    );
  }

  getImageLoading(): boolean {
    return this.imageLoading;
  }

  private scheduleSync(): void {
    if (this.syncRaf || this.destroyed) return;
    this.syncRaf = requestAnimationFrame(() => {
      this.syncRaf = 0;
      this.syncFromStore();
    });
  }

  private bindStoreSubscriptions(): void {
    this.unsubAnnotation = useAnnotationStore.subscribe((state, prev) => {
      const imageChanged = state.currentImage?.id !== prev.currentImage?.id;
      const fileChanged =
        state.currentImage?.id === prev.currentImage?.id &&
        state.currentImage?.file !== prev.currentImage?.file;

      if (imageChanged) {
        this.lastClampImageId = null;
        this.needFitImageId = state.currentImage?.id ?? null;
        this.cancelViewAnimations();
        this.annotationOpacity = 0;
        this.drawState = { placingSecondCorner: false, startX: 0, startY: 0 };
        this.tempRect = null;
        this.polygonPoints = [];
        this.polygonCursor = null;
        this.polygonLastClick = null;
        this.loadCurrentImage();
      } else if (fileChanged) {
        this.loadCurrentImage();
      }

      if (state.currentTool !== prev.currentTool && state.currentTool !== 'polygon') {
        this.polygonPoints = [];
        this.polygonCursor = null;
        this.polygonLastClick = null;
      }

      if (state.selectedAnnotation !== prev.selectedAnnotation) {
        this.obbRotateHover = false;
      }

      if (!this.annotationChangeNeedsCanvasSync(state, prev)) return;

      this.scheduleSync();
    });

    this.unsubTheme = useThemeStore.subscribe(() => {
      this.scheduleSync();
    });
  }

  private bindResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.containerSize = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
      this.stage.width(this.containerSize.width);
      this.stage.height(this.containerSize.height);
      this.scheduleSync();
    });
    this.resizeObserver.observe(this.container);
  }

  private bindStageEvents(): void {
    this.stage.on('wheel', (e) => this.handleWheel(e));
    this.stage.on('mousedown', (e) => this.handleMouseDown(e));
    this.stage.on('mousemove', (e) => this.handleMouseMove(e));
    this.stage.on('mouseup', () => this.handleMouseUp());
    this.stage.on('mouseleave', () => this.handleMouseLeave());
  }

  private shouldShowCrosshair(): boolean {
    const store = useAnnotationStore.getState();
    if (!store.currentImage || store.labelModalOpen || store.waitingForLabel) {
      return false;
    }
    return !isBlockingOverlayOpen();
  }

  private bindGlobalListeners(): void {
    this.onCrosshairMove = (e: MouseEvent) => {
      if (!this.shouldShowCrosshair() || isEventOnBlockingOverlay(e)) {
        this.updateCrosshairImperative(0, 0, false);
        return;
      }
      const rect = this.container.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        this.updateCrosshairImperative(0, 0, false);
        return;
      }
      const pos = this.clientToImage(e.clientX, e.clientY);
      this.updateCrosshairImperative(pos.x, pos.y, true);
    };
    this.onCrosshairLeave = () => this.updateCrosshairImperative(0, 0, false);
    window.addEventListener('mousemove', this.onCrosshairMove);
    this.container.addEventListener('mouseleave', this.onCrosshairLeave);

    this.onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener('keydown', this.onKeyDown);

    this.bindShortcutWheelListener();
  }

  private bindShortcutWheelListener(): void {
    this.unbindShortcutWheelListener();
    const store = useAnnotationStore.getState();
    if (!store.waitingForLabel) return;

    this.onShortcutWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const s = useAnnotationStore.getState();
      if (e.deltaY > 0) s.nextShortcutPage();
      else if (e.deltaY < 0) s.previousShortcutPage();
    };
    this.container.addEventListener('wheel', this.onShortcutWheel, {
      passive: false,
      capture: true,
    });
  }

  private unbindShortcutWheelListener(): void {
    if (this.onShortcutWheel) {
      this.container.removeEventListener('wheel', this.onShortcutWheel, { capture: true });
      this.onShortcutWheel = null;
    }
  }

  private cancelViewAnimations(): void {
    this.viewAnimCancel?.();
    this.viewAnimCancel = null;
    this.opacityAnimCancel?.();
    this.opacityAnimCancel = null;
  }

  private batchDrawStage(): void {
    this.requestRender();
  }

  private getAnnotations(): Annotation[] {
    const { currentImage, annotationsByImage } = useAnnotationStore.getState();
    if (!currentImage) return [];
    return annotationsByImage[currentImage.id] ?? [];
  }

  private getImageDimensions(): { imageWidth: number; imageHeight: number; layoutWidth: number; layoutHeight: number } {
    const currentImage = useAnnotationStore.getState().currentImage;
    const frame = this.displayFrame;
    const viewSynced = Boolean(currentImage && frame?.id === currentImage.id);
    let imageWidth = currentImage?.width ?? 0;
    let imageHeight = currentImage?.height ?? 0;

    if (frame) {
      if (imageWidth <= 0) imageWidth = frame.width;
      if (imageHeight <= 0) imageHeight = frame.height;
      if (imageWidth <= 0 && frame.element) {
        imageWidth = frame.element.naturalWidth || frame.element.width;
      }
      if (imageHeight <= 0 && frame.element) {
        imageHeight = frame.element.naturalHeight || frame.element.height;
      }
    }

    const layoutWidth = viewSynced ? imageWidth : (frame?.width ?? 0);
    const layoutHeight = viewSynced ? imageHeight : (frame?.height ?? 0);
    return { imageWidth, imageHeight, layoutWidth, layoutHeight };
  }

  private rebuildSpatialIndex(imageId: string | undefined, annotations: Annotation[]): void {
    if (
      this.spatialSync.annotations !== annotations ||
      this.spatialSync.imageId !== imageId
    ) {
      this.spatialSync = { imageId, annotations };
      this.annotationsById = buildAnnotationMap(annotations);
      this.spatialIndex.rebuild(annotations);
    }
  }

  private clampRectanglesOnImageChange(
    currentImage: ImageFile | null,
    annotations: Annotation[]
  ): void {
    if (!currentImage) return;
    const imageId = currentImage.id;
    if (this.lastClampImageId === imageId) return;
    this.lastClampImageId = imageId;

    const viewSynced = this.displayFrame?.id === currentImage.id;
    const { imageWidth, imageHeight } = this.getImageDimensions();
    if (!viewSynced || imageWidth <= 0 || imageHeight <= 0) return;

    const { updateAnnotation } = useAnnotationStore.getState();
    for (const ann of annotations) {
      if (ann.shapeType !== 'rectangle' || !ann.width || !ann.height) continue;
      const clamped = clampRect(ann.x, ann.y, ann.width, ann.height, imageWidth, imageHeight);
      if (
        clamped.x !== ann.x ||
        clamped.y !== ann.y ||
        clamped.width !== ann.width ||
        clamped.height !== ann.height
      ) {
        updateAnnotation(currentImage.id, ann.id, clamped);
      }
    }
  }

  private getImageOffsetFromStore(): { x: number; y: number } {
    const { stagePosition, zoom: currentZoom } = useAnnotationStore.getState();
    const { layoutWidth, layoutHeight } = this.getImageDimensions();
    return getImageOffset(
      this.containerSize.width,
      this.containerSize.height,
      layoutWidth,
      layoutHeight,
      currentZoom,
      stagePosition
    );
  }

  private getImageOffsetEffective(): { x: number; y: number } {
    const start = this.panDragStart;
    if (this.isPanning && start) {
      const pointer = this.panPointer;
      return {
        x: start.stageX + (pointer.x - start.pointerX),
        y: start.stageY + (pointer.y - start.pointerY),
      };
    }
    return this.getImageOffsetFromStore();
  }

  private getImageOffsetForView(): { x: number; y: number } {
    const { zoom, stagePosition } = useAnnotationStore.getState();
    const { layoutWidth, layoutHeight } = this.getImageDimensions();
    return getImageOffset(
      this.containerSize.width,
      this.containerSize.height,
      layoutWidth,
      layoutHeight,
      zoom,
      stagePosition
    );
  }

  private stageOffsetToStorePosition(stageX: number, stageY: number): { x: number; y: number } {
    const { zoom: z } = useAnnotationStore.getState();
    const { layoutWidth, layoutHeight } = this.getImageDimensions();
    const imgW = layoutWidth * z;
    const imgH = layoutHeight * z;
    return {
      x: stageX - (this.containerSize.width - imgW) / 2,
      y: stageY - (this.containerSize.height - imgH) / 2,
    };
  }

  private syncStageTransform(zoom: number, stagePosition: { x: number; y: number }): void {
    const offset = this.getImageOffsetForView();
    const stageX =
      this.isPanning && this.panLiveStage ? this.panLiveStage.x : offset.x;
    const stageY =
      this.isPanning && this.panLiveStage ? this.panLiveStage.y : offset.y;

    this.stage.scale({ x: zoom, y: zoom });
    this.stage.position({ x: stageX, y: stageY });
  }

  private syncBackgroundImage(): void {
    if (!this.displayFrame) {
      this.backgroundImage?.visible(false);
      return;
    }

    const { layoutWidth, layoutHeight } = this.getImageDimensions();
    if (!this.backgroundImage) {
      const placeholder = document.createElement('img');
      this.backgroundImage = new Konva.Image({
        image: placeholder,
        name: 'background-image',
        listening: false,
      });
      this.backgroundLayer.add(this.backgroundImage);
    }

    this.backgroundImage.image(this.displayFrame.element);
    this.backgroundImage.width(layoutWidth);
    this.backgroundImage.height(layoutHeight);
    this.backgroundImage.visible(true);
  }

  private getVisibleAnnotationList(
    store: ReturnType<typeof useAnnotationStore.getState>
  ): Annotation[] {
    const currentImage = store.currentImage;
    if (!currentImage) return [];

    const viewSynced = this.displayFrame?.id === currentImage.id;
    const annotationsInteractive = viewSynced && this.annotationOpacity > 0.5;
    if (!annotationsInteractive) return [];

    const { zoom, stagePosition } = store;
    const { layoutWidth, layoutHeight } = this.getImageDimensions();
    if (layoutWidth <= 0 || layoutHeight <= 0) return [];

    const viewportRect = computeViewportRect(
      this.containerSize.width,
      this.containerSize.height,
      layoutWidth,
      layoutHeight,
      zoom,
      stagePosition
    );

    const visible = getVisibleAnnotations(
      this.spatialIndex,
      this.annotationsById,
      viewportRect
    );

    const visibleIds = new Set(visible.map((ann) => ann.id));
    for (const id of store.selectedAnnotationIds) {
      if (!visibleIds.has(id)) {
        const selected = this.annotationsById.get(id);
        if (selected && !selected.hidden) {
          visible.push(selected);
          visibleIds.add(id);
        }
      }
    }

    return visible;
  }

  private buildShapeHostProps(
    ann: Annotation,
    isSelected: boolean,
    store: ReturnType<typeof useAnnotationStore.getState>
  ): ShapeHostProps {
    const { imageWidth, imageHeight } = this.getImageDimensions();
    const label = store.getLabelById(ann.labelId);
    const color = label?.color ?? '#58a6ff';
    const labelName = formatAnnotationCanvasLabel(label?.name ?? '未知', {
      score: ann.score,
    });
    const isEditMode = store.currentTool === 'select';

    let displayAnn = ann;
    if (ann.shapeType === 'rectangle' && imageWidth > 0 && imageHeight > 0) {
      displayAnn = {
        ...ann,
        ...clampRect(ann.x, ann.y, ann.width, ann.height, imageWidth, imageHeight),
      };
    }

    const base: ShapeHostVisualProps & ShapeHostContext = {
      ann: displayAnn,
      color,
      labelName,
      groupId: ann.groupId,
      isSelected,
      showLabels: store.showLabels,
      imageWidth,
      imageHeight,
      zoom: store.zoom,
      isEditMode,
      clientToImage: (clientX, clientY) => this.clientToImage(clientX, clientY),
      onUpdate: (id, updates) => this.handleShapeUpdate(id, updates),
      onInteractStart: () => {
        this.interacting = true;
      },
      onInteractEnd: () => {
        this.interacting = false;
        this.isOverCorner = false;
      },
      onCornerHover: (hovering) => {
        this.isOverCorner = hovering;
      },
      onBoxDrag: (dragging) => {
        this.isBoxDragging = dragging;
      },
      onDragStart: (id) => this.beginGroupDragSession(id),
      onDragMove: (id, x, y) => this.scheduleGroupDragPreview(id, x, y),
      onDragEnd: () => this.endGroupDragSession(),
      allowBoxDrag: this.isSelectionDragAllowed(store),
      groupDragSync:
        store.selectedAnnotationIds.length > 1 &&
        this.isHomogeneousSelection(store) &&
        store.selectedAnnotationIds.includes(ann.id),
      onEditLabel: (id) => this.handleEditLabel(id),
    };

    if (ann.shapeType === 'rotated-rectangle') {
      return {
        ...base,
        rotateHandleHover: isSelected ? this.obbRotateHover : false,
      } satisfies ObbShapeHostProps;
    }

    if (ann.shapeType === 'pose' && ann.keypoints) {
      return {
        ...base,
        poseConfig: store.poseConfig,
        selectedKeypointIndex: store.selectedKeypointIndex,
        onSelectKeypoint: (index) => store.setSelectedKeypointIndex(index),
      } satisfies PoseShapeHostProps;
    }

    return base;
  }

  private getShapeHostCtor(ann: Annotation): ShapeHostCtor | null {
    if (ann.shapeType === 'rectangle') return this.shapeHostRegistry.rectangle;
    if (ann.shapeType === 'rotated-rectangle') return this.shapeHostRegistry['rotated-rectangle'];
    if (ann.shapeType === 'polygon' && ann.points) return this.shapeHostRegistry.polygon;
    if (ann.shapeType === 'point') return this.shapeHostRegistry.point;
    if (ann.shapeType === 'pose' && ann.keypoints) return this.shapeHostRegistry.pose;
    return null;
  }

  private syncAnnotationLayers(
    store: ReturnType<typeof useAnnotationStore.getState>,
    themeKey: string,
    _annotations: Annotation[]
  ): void {
    const currentImage = store.currentImage;
    const viewSynced = Boolean(currentImage && this.displayFrame?.id === currentImage.id);
    const annotationsInteractive = viewSynced && this.annotationOpacity > 0.5;
    const visible = viewSynced ? this.getVisibleAnnotationList(store) : [];
    const selectedIdSet = new Set(store.selectedAnnotationIds);

    this.annotationLayer.opacity(this.annotationOpacity);
    this.selectionLayer.opacity(this.annotationOpacity);
    this.annotationLayer.listening(annotationsInteractive);
    this.selectionLayer.listening(annotationsInteractive);

    const needed = new Map<string, AnnotationLayerMode>();

    for (const ann of visible) {
      if (ann.hidden) continue;
      const isSelected = selectedIdSet.has(ann.id);
      if (isSelected) {
        needed.set(ann.id, 'selected');
      } else {
        needed.set(ann.id, 'normal');
      }
    }

    for (const [id, entry] of this.shapeHosts) {
      const mode = needed.get(id);
      if (!mode || mode !== entry.mode) {
        entry.host.destroy();
        this.shapeHosts.delete(id);
      }
    }

    const themeChanged = themeKey !== this.lastThemeKey;
    this.lastThemeKey = themeKey;

    for (const ann of visible) {
      if (ann.hidden) continue;
      const isSelected = selectedIdSet.has(ann.id);
      const mode: AnnotationLayerMode = isSelected ? 'selected' : 'normal';
      const ctor = this.getShapeHostCtor(ann);
      if (!ctor) continue;

      const props = this.buildShapeHostProps(ann, isSelected, store);
      const existing = this.shapeHosts.get(ann.id);

      if (existing && existing.mode === mode) {
        existing.host.update(props);
      } else {
        existing?.host.destroy();
        const layer = mode === 'selected' ? this.selectionLayer : this.annotationLayer;
        const host = new ctor(layer, props);
        this.shapeHosts.set(ann.id, { host, mode });
      }

      if (themeChanged) {
        // force style refresh on theme change via update
        this.shapeHosts.get(ann.id)?.host.update(props);
      }
    }

    this.syncObbRotateHitZone(store, visible, viewSynced);
  }

  private getSelectedObbAnnotation(
    store: ReturnType<typeof useAnnotationStore.getState>,
    visible: Annotation[]
  ): Annotation | null {
    if (store.selectedAnnotationIds.length !== 1 || !store.selectedAnnotation) return null;
    const ann = visible.find((a) => a.id === store.selectedAnnotation);
    if (!ann || ann.shapeType !== 'rotated-rectangle' || ann.hidden) return null;
    return ann;
  }

  private buildObbRotateHitZoneProps(
    ann: Annotation,
    store: ReturnType<typeof useAnnotationStore.getState>
  ): ObbRotateHitZoneProps {
    const currentImage = store.currentImage;
    return {
      ann,
      imageId: currentImage?.id ?? '',
      zoom: store.zoom,
      clientToImage: (clientX, clientY) => this.clientToImage(clientX, clientY),
      onInteractStart: () => {
        this.interacting = true;
      },
      onInteractEnd: () => {
        this.interacting = false;
        this.isOverCorner = false;
      },
      onCornerHover: (hovering) => {
        this.isOverCorner = hovering;
      },
      onHoverChange: (hovering) => {
        if (this.obbRotateHover === hovering) return;
        this.obbRotateHover = hovering;
        this.scheduleSync();
      },
    };
  }

  private syncObbRotateHitZone(
    store: ReturnType<typeof useAnnotationStore.getState>,
    visible: Annotation[],
    viewSynced: boolean
  ): void {
    const isEditMode = store.currentTool === 'select';
    const annotationsInteractive = viewSynced && this.annotationOpacity > 0.5;
    const selectedObb = viewSynced ? this.getSelectedObbAnnotation(store, visible) : null;

    if (!selectedObb || !annotationsInteractive || !isEditMode) {
      this.destroyObbRotateHitZone();
      if (this.obbRotateHover) {
        this.obbRotateHover = false;
      }
      return;
    }

    const props = this.buildObbRotateHitZoneProps(selectedObb, store);
    if (this.obbRotateHitZone) {
      this.obbRotateHitZone.update(props);
    } else {
      this.obbRotateHitZone = attachObbRotateHitZone(this.selectionLayer, props);
    }
  }

  private destroyObbRotateHitZone(): void {
    this.obbRotateHitZone?.destroy();
    this.obbRotateHitZone = null;
  }

  private clearShapeHosts(): void {
    for (const entry of this.shapeHosts.values()) {
      entry.host.destroy();
    }
    this.shapeHosts.clear();
  }

  private syncInteractionLayer(store: ReturnType<typeof useAnnotationStore.getState>): void {
    const currentImage = store.currentImage;
    const viewSynced = Boolean(currentImage && this.displayFrame?.id === currentImage.id);
    const isLabelPickerActive = store.labelModalOpen || store.waitingForLabel;
    const { zoom } = store;

    this.bindShortcutWheelListener();

    this.syncPendingPreview(store, viewSynced, isLabelPickerActive, zoom);
    this.syncTempRectPreview(viewSynced, isLabelPickerActive, zoom);
    this.syncPolygonPreview(viewSynced, store.currentTool, zoom);
    this.syncPendingPointPreview(store, viewSynced, isLabelPickerActive, zoom);
    this.syncCrosshairStrokeWidth(zoom);
  }

  private syncPendingPreview(
    store: ReturnType<typeof useAnnotationStore.getState>,
    viewSynced: boolean,
    isLabelPickerActive: boolean,
    zoom: number
  ): void {
    this.pendingPreviewGroup.destroyChildren();
    this.pendingPreviewGroup.visible(false);

    if (!viewSynced || !store.pendingAnnotation || !isLabelPickerActive) return;

    const pending = store.pendingAnnotation;
    const strokeWidth = getShapeStrokeWidthImage(zoom);
    const dashStyle = { dash: [6, 3], dashScaleEnabled: false };

    if (pending.shapeType === 'polygon' && pending.points) {
      this.pendingPreviewGroup.add(
        new Konva.Line({
          points: pending.points,
          closed: true,
          stroke: '#00ff00',
          strokeWidth,
          lineJoin: POLYGON_LINE_JOIN,
          fill: 'rgba(0, 255, 0, 0.12)',
          listening: false,
          ...dashStyle,
        })
      );
    } else if (pending.shapeType === 'rotated-rectangle') {
      this.pendingPreviewGroup.add(
        new Konva.Line({
          points: buildObbFromParams(
            pending.x,
            pending.y,
            pending.width,
            pending.height,
            pending.angle ?? 0
          ).points,
          closed: true,
          stroke: '#00ff00',
          strokeWidth,
          fill: 'rgba(0, 255, 0, 0.12)',
          listening: false,
          ...dashStyle,
        })
      );
    } else if (pending.shapeType !== 'point') {
      this.pendingPreviewGroup.add(
        new Konva.Rect({
          x: pending.x,
          y: pending.y,
          width: pending.width,
          height: pending.height,
          stroke: '#00ff00',
          strokeWidth,
          fill: 'rgba(0, 255, 0, 0.12)',
          listening: false,
          ...dashStyle,
        })
      );
    }

    this.pendingPreviewGroup.visible(this.pendingPreviewGroup.children.length > 0);
  }

  private syncTempRectPreview(
    viewSynced: boolean,
    isLabelPickerActive: boolean,
    zoom: number
  ): void {
    if (!viewSynced || !this.tempRect || isLabelPickerActive) {
      this.tempRectNode.visible(false);
      return;
    }

    this.tempRectNode.x(this.tempRect.x);
    this.tempRectNode.y(this.tempRect.y);
    this.tempRectNode.width(this.tempRect.width);
    this.tempRectNode.height(this.tempRect.height);
    this.tempRectNode.strokeWidth(getShapeStrokeWidthImage(zoom));
    this.tempRectNode.visible(true);
  }

  private syncPolygonPreview(
    viewSynced: boolean,
    currentTool: string,
    zoom: number
  ): void {
    if (!viewSynced || currentTool !== 'polygon' || this.polygonPoints.length === 0) {
      this.polygonPreviewFill.visible(false);
      this.polygonPreviewLine.visible(false);
      this.polygonVertexGroup.destroyChildren();
      this.polygonOriginCircle.visible(false);
      return;
    }

    const polygonCloseThreshold = getPolygonCloseThresholdImage(zoom);
    const polygonNearOrigin =
      this.polygonPoints.length >= 6 &&
      this.polygonCursor !== null &&
      Math.hypot(
        this.polygonCursor.x - this.polygonPoints[0],
        this.polygonCursor.y - this.polygonPoints[1]
      ) < polygonCloseThreshold;

    let strokePoints = this.polygonPoints;
    if (this.polygonCursor) {
      strokePoints = polygonNearOrigin
        ? [...this.polygonPoints, this.polygonPoints[0], this.polygonPoints[1]]
        : [...this.polygonPoints, this.polygonCursor.x, this.polygonCursor.y];
    }

    let fillPoints: number[] | null = null;
    if (FILL_DRAWING_ENABLED && this.polygonPoints.length >= 4) {
      if (polygonNearOrigin) {
        fillPoints = this.polygonPoints;
      } else if (this.polygonCursor) {
        fillPoints = [...this.polygonPoints, this.polygonCursor.x, this.polygonCursor.y];
      }
    }

    if (fillPoints) {
      this.polygonPreviewFill.points(fillPoints);
      this.polygonPreviewFill.visible(true);
    } else {
      this.polygonPreviewFill.visible(false);
    }

    this.polygonPreviewLine.points(strokePoints);
    this.polygonPreviewLine.strokeWidth(getShapeStrokeWidthImage(zoom));
    this.polygonPreviewLine.closed(polygonNearOrigin);
    this.polygonPreviewLine.visible(true);

    this.polygonVertexGroup.destroyChildren();
    for (let i = 0; i < this.polygonPoints.length; i += 2) {
      if (i === 0) continue;
      this.polygonVertexGroup.add(
        new Konva.Circle({
          name: 'polygon-preview',
          x: this.polygonPoints[i],
          y: this.polygonPoints[i + 1],
          radius: getVertexSizeScreen(zoom) / 2,
          fill: '#00ff00',
          listening: false,
        })
      );
    }

    if (this.polygonPoints.length >= 6) {
      this.polygonOriginCircle.x(this.polygonPoints[0]);
      this.polygonOriginCircle.y(this.polygonPoints[1]);
      this.polygonOriginCircle.radius(
        (getVertexSizeScreen(zoom, false, polygonNearOrigin) / 2) *
          (polygonNearOrigin ? POLYGON_CLOSE_HINT_SCALE : 1)
      );
      this.polygonOriginCircle.fill(polygonNearOrigin ? '#ffffff' : '#00ff00');
      this.polygonOriginCircle.visible(true);
    } else {
      this.polygonOriginCircle.visible(false);
    }
  }

  private syncPendingPointPreview(
    store: ReturnType<typeof useAnnotationStore.getState>,
    viewSynced: boolean,
    isLabelPickerActive: boolean,
    zoom: number
  ): void {
    const pending = store.pendingAnnotation;
    const show =
      viewSynced &&
      store.waitingForLabel &&
      isLabelPickerActive &&
      pending?.shapeType === 'point';

    if (!show || !pending) {
      this.pendingPointGroup.visible(false);
      return;
    }

    const outerRadius = getHandleOuterRadiusImage(zoom);
    this.pendingPointGroup.position({ x: pending.x, y: pending.y });
    this.pendingPointCircle.radius(outerRadius);
    this.pendingPointGroup.visible(true);
  }

  private syncCrosshairStrokeWidth(zoom: number): void {
    const width = getShapeStrokeWidthImage(zoom, CROSSHAIR_WIDTH);
    this.crosshairH.strokeWidth(width);
    this.crosshairV.strokeWidth(width);
  }

  private updateCrosshairImperative(imageX: number, imageY: number, visible: boolean): void {
    if (!visible) {
      if (this.hasCrosshair) {
        this.crosshairGroup.visible(false);
        this.interactionLayer.batchDraw();
        this.hasCrosshair = false;
      }
      return;
    }

    const offset = this.getImageOffsetEffective();
    const { zoom: z } = useAnnotationStore.getState();
    const bounds = getViewportBoundsInImage(
      this.containerSize.width,
      this.containerSize.height,
      offset,
      z
    );
    this.crosshairH.points([bounds.left, imageY, bounds.right, imageY]);
    this.crosshairV.points([imageX, bounds.top, imageX, bounds.bottom]);
    if (!this.hasCrosshair) {
      this.crosshairGroup.visible(true);
      this.hasCrosshair = true;
    }
    this.interactionLayer.batchDraw();
  }

  private updateCrosshairFromStage(): void {
    if (!this.shouldShowCrosshair()) {
      this.updateCrosshairImperative(0, 0, false);
      return;
    }
    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      this.updateCrosshairImperative(0, 0, false);
      return;
    }
    const { zoom: currentZoom } = useAnnotationStore.getState();
    const offset = this.getImageOffsetEffective();
    this.updateCrosshairImperative(
      (pointer.x - offset.x) / currentZoom,
      (pointer.y - offset.y) / currentZoom,
      true
    );
  }

  private updateCursor(store: ReturnType<typeof useAnnotationStore.getState>): void {
    const isLabelPickerActive = store.labelModalOpen || store.waitingForLabel;
    let cursor = 'default';
    if (!isLabelPickerActive) {
      if (store.currentImage && (this.isPanning || this.isBoxDragging)) {
        cursor = 'grabbing';
      } else if (this.isOverCorner && store.currentTool === 'select') {
        cursor = 'pointer';
      } else {
        switch (store.currentTool) {
          case 'rectangle':
          case 'obb':
          case 'polygon':
          case 'point':
            cursor = 'crosshair';
            break;
          default:
            cursor = 'default';
        }
      }
    }
    this.stage.container().style.cursor = cursor;
  }

  private getPointerPosition(): { x: number; y: number } {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    const { zoom } = useAnnotationStore.getState();
    const offset = this.getImageOffsetForView();
    return {
      x: (pointer.x - offset.x) / zoom,
      y: (pointer.y - offset.y) / zoom,
    };
  }

  private clientToImage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    const pointer = { x: clientX - rect.left, y: clientY - rect.top };
    const { zoom } = useAnnotationStore.getState();
    const offset = this.getImageOffsetEffective();
    return {
      x: (pointer.x - offset.x) / zoom,
      y: (pointer.y - offset.y) / zoom,
    };
  }

  private getClampedPointer(): { x: number; y: number } {
    const pos = this.getPointerPosition();
    const { imageWidth, imageHeight } = this.getImageDimensions();
    if (imageWidth <= 0 || imageHeight <= 0) return pos;
    return clampPoint(pos.x, pos.y, imageWidth, imageHeight);
  }

  private pickShapeAtPointer(): string | null {
    const pos = this.getPointerPosition();
    const zoom = useAnnotationStore.getState().zoom;
    return pickAnnotationAtPoint(this.spatialIndex, this.annotationsById, pos.x, pos.y, {
      zoom,
    });
  }

  private scheduleMousePosition(x: number, y: number): void {
    this.lastMousePos = { x, y };
    if (this.mousePosRaf) return;
    this.mousePosRaf = requestAnimationFrame(() => {
      this.mousePosRaf = 0;
      const p = this.lastMousePos;
      useAnnotationStore.getState().setMousePosition({
        x: Math.round(p.x),
        y: Math.round(p.y),
      });
    });
  }

  private logPanDebug(phase: string, stagePos: { x: number; y: number } | null): void {
    if (!DEBUG_PAN) return;
    const start = this.panDragStart;
    const store = useAnnotationStore.getState().stagePosition;
    // eslint-disable-next-line no-console
    console.log(`[CanvasPan] ${phase}`, {
      pointer: { ...this.panPointer },
      startPointer: start ? { x: start.pointerX, y: start.pointerY } : null,
      'stage.position()': stagePos,
      'store.stagePosition': { ...store },
    });
  }

  private applyPanFrame(): void {
    this.panRaf = 0;
    const start = this.panDragStart;
    if (!start || !this.isPanning) return;

    const pointer = this.panPointer;
    const next = {
      x: start.stageX + (pointer.x - start.pointerX),
      y: start.stageY + (pointer.y - start.pointerY),
    };
    this.panLiveStage = next;
    this.stage.position(next);
    this.stage.batchDraw();
    if (DEBUG_PAN) {
      this.panDebugFrame += 1;
      if (this.panDebugFrame % 10 === 1) {
        this.logPanDebug('move', next);
      }
    }
  }

  private schedulePanFrame(): void {
    if (this.panRaf) return;
    this.panRaf = requestAnimationFrame(() => this.applyPanFrame());
  }

  private beginPan(clientX: number, clientY: number): void {
    const store = useAnnotationStore.getState();
    if (!store.currentImage) return;

    this.cancelViewAnimations();

    const stageX = this.stage.x();
    const stageY = this.stage.y();
    this.panDragStart = {
      pointerX: clientX,
      pointerY: clientY,
      stageX,
      stageY,
    };
    this.panPointer = { x: clientX, y: clientY };
    this.panLiveStage = { x: stageX, y: stageY };
    this.isPanning = true;
    this.panDebugFrame = 0;
    this.logPanDebug('start', { x: stageX, y: stageY });
    this.bindPanWindowListeners();
    this.updateCursor(store);
  }

  private bindPanWindowListeners(): void {
    this.unbindPanWindowListeners();
    this.onWindowMouseMove = (e: MouseEvent) => {
      if (!this.isPanning) return;
      this.panPointer = { x: e.clientX, y: e.clientY };
      this.schedulePanFrame();
    };
    this.onWindowMouseUp = () => this.endPan();
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);
  }

  private unbindPanWindowListeners(): void {
    if (this.onWindowMouseMove) {
      window.removeEventListener('mousemove', this.onWindowMouseMove);
      this.onWindowMouseMove = null;
    }
    if (this.onWindowMouseUp) {
      window.removeEventListener('mouseup', this.onWindowMouseUp);
      this.onWindowMouseUp = null;
    }
  }

  private endPan(): void {
    if (!this.isPanning) return;

    if (this.panRaf) {
      cancelAnimationFrame(this.panRaf);
      this.panRaf = 0;
    }
    this.applyPanFrame();

    const live = this.panLiveStage;
    const finalPos = live ?? { x: this.stage.x(), y: this.stage.y() };

    this.isPanning = false;
    this.panDragStart = null;
    this.unbindPanWindowListeners();

    this.stage.position(finalPos);
    const storePos = this.stageOffsetToStorePosition(finalPos.x, finalPos.y);
    useAnnotationStore.getState().setStagePosition(storePos);
    this.logPanDebug('end', finalPos);

    this.panLiveStage = null;
    this.updateCrosshairFromStage();
    this.scheduleSync();
  }

  private isClickOnEmpty(target: Konva.Node): boolean {
    const name = target.name();
    return (
      target === this.stage ||
      name === 'background-image' ||
      name === 'polygon-preview' ||
      name === 'polygon-preview-line' ||
      name === 'annotation-hit'
    );
  }

  private finishPolygon(points: number[]): void {
    const { imageWidth, imageHeight } = this.getImageDimensions();
    if (points.length < 6 || imageWidth <= 0 || imageHeight <= 0) return;
    const clamped = clampPolygonPoints(points, imageWidth, imageHeight);
    const bbox = getPolygonBBox(clamped);
    if (bbox.width < 3 || bbox.height < 3) return;

    const pending: PendingAnnotation = {
      id: generateId(),
      shapeType: 'polygon',
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      points: clamped,
    };
    useAnnotationStore.getState().beginWaitingForLabel(pending);
    this.polygonPoints = [];
    this.polygonCursor = null;
    this.polygonLastClick = null;
    this.scheduleSync();
  }

  private handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    const store = useAnnotationStore.getState();
    if (store.waitingForLabel) {
      e.evt.preventDefault();
      return;
    }

    e.evt.preventDefault();
    this.cancelViewAnimations();

    const currentImage = store.currentImage;
    if (e.evt.ctrlKey && currentImage) {
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;

      const oldZoom = store.zoom;
      const newZoom = e.evt.deltaY < 0 ? oldZoom * ZOOM_STEP : oldZoom / ZOOM_STEP;
      const clampedZoom = clampViewZoom(newZoom);

      const offset = this.getImageOffsetFromStore();
      const imageX = (pointer.x - offset.x) / oldZoom;
      const imageY = (pointer.y - offset.y) / oldZoom;

      const newOffsetX = (this.containerSize.width - currentImage.width * clampedZoom) / 2;
      const newOffsetY = (this.containerSize.height - currentImage.height * clampedZoom) / 2;

      store.setZoom(clampedZoom);
      store.setStagePosition({
        x: pointer.x - newOffsetX - imageX * clampedZoom,
        y: pointer.y - newOffsetY - imageY * clampedZoom,
      });
      this.updateCrosshairFromStage();
    } else {
      const currentPos = store.stagePosition;
      store.setStagePosition({
        x: currentPos.x - e.evt.deltaX,
        y: currentPos.y - e.evt.deltaY,
      });
      this.updateCrosshairFromStage();
    }
    this.scheduleSync();
  }

  private handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const store = useAnnotationStore.getState();
    const isLabelPickerActive = store.labelModalOpen || store.waitingForLabel;
    if (isLabelPickerActive) return;

    if (e.evt.button === 1) {
      this.beginPan(e.evt.clientX, e.evt.clientY);
      e.evt.preventDefault();
      return;
    }

    if (e.evt.button !== 0) return;

    if (this.interacting) {
      e.evt.preventDefault();
      return;
    }

    const pos = this.getClampedPointer();
    const currentTool = store.currentTool;
    const { imageWidth, imageHeight } = this.getImageDimensions();

    if (currentTool === 'select') {
      const hitId = this.pickShapeAtPointer();
      if (hitId) {
        if (e.evt.ctrlKey || e.evt.metaKey) {
          store.toggleAnnotationSelection(hitId);
        } else {
          store.setSelectedAnnotation(hitId);
        }
        this.scheduleSync();
        return;
      }
      if (this.isClickOnEmpty(e.target)) {
        if (!(e.evt.ctrlKey || e.evt.metaKey)) {
          store.clearSelection();
        }
        this.beginPan(e.evt.clientX, e.evt.clientY);
      }
      return;
    }

    if (currentTool === 'rectangle' || currentTool === 'obb') {
      const end = this.getPointerPosition();
      if (!this.drawState.placingSecondCorner) {
        this.drawState = { placingSecondCorner: true, startX: end.x, startY: end.y };
        this.tempRect = rectFromDiagonal(end.x, end.y, end.x, end.y);
        this.scheduleSync();
        return;
      }

      const rect = rectFromDiagonal(
        this.drawState.startX,
        this.drawState.startY,
        end.x,
        end.y
      );
      if (rect.width > 5 && rect.height > 5) {
        if (currentTool === 'obb') {
          store.beginWaitingForLabel({
            id: generateId(),
            shapeType: 'rotated-rectangle',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            angle: 0,
          });
        } else {
          const clamped =
            imageWidth > 0 && imageHeight > 0
              ? clampRect(
                  rect.x,
                  rect.y,
                  rect.width,
                  rect.height,
                  imageWidth,
                  imageHeight
                )
              : rect;
          store.beginWaitingForLabel({
            id: generateId(),
            shapeType: 'rectangle',
            x: clamped.x,
            y: clamped.y,
            width: clamped.width,
            height: clamped.height,
          });
        }
      }
      this.drawState = { placingSecondCorner: false, startX: 0, startY: 0 };
      this.tempRect = null;
      this.scheduleSync();
      return;
    }

    if (currentTool === 'point') {
      store.beginWaitingForLabel(
        {
          id: generateId(),
          shapeType: 'point',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
        },
        { preserveGroupId: true }
      );
      this.scheduleSync();
      return;
    }

    if (currentTool === 'polygon') {
      const vertexCount = this.polygonPoints.length / 2;
      const now = Date.now();
      const lastClick = this.polygonLastClick;
      const { zoom } = store;

      if (vertexCount >= 3 && lastClick) {
        const dblClickDist = getPolygonDblClickDistanceImage(zoom);
        const dt = now - lastClick.time;
        const distFromLastClick = Math.hypot(pos.x - lastClick.x, pos.y - lastClick.y);
        if (dt < POLYGON_DBLCLICK_INTERVAL_MS && distFromLastClick < dblClickDist) {
          this.finishPolygon(this.polygonPoints);
          return;
        }
      }

      if (vertexCount >= 3) {
        const closeThreshold = getPolygonCloseClickThresholdImage(zoom);
        const dx = pos.x - this.polygonPoints[0];
        const dy = pos.y - this.polygonPoints[1];
        if (Math.hypot(dx, dy) < closeThreshold) {
          this.finishPolygon(this.polygonPoints);
          return;
        }
      }

      const lastIdx = this.polygonPoints.length - 2;
      if (lastIdx >= 0) {
        const dx = pos.x - this.polygonPoints[lastIdx];
        const dy = pos.y - this.polygonPoints[lastIdx + 1];
        const minDist = imageSizeForZoom(3, zoom);
        const distFromLastVertex = Math.hypot(dx, dy);
        if (distFromLastVertex < minDist) {
          if (
            vertexCount >= 3 &&
            lastClick &&
            now - lastClick.time < POLYGON_DBLCLICK_INTERVAL_MS
          ) {
            this.finishPolygon(this.polygonPoints);
          }
          return;
        }
      }

      this.polygonPoints = [...this.polygonPoints, pos.x, pos.y];
      this.polygonLastClick = { time: now, x: pos.x, y: pos.y };
      this.scheduleSync();
    }
  }

  private handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const store = useAnnotationStore.getState();
    const isLabelPickerActive = store.labelModalOpen || store.waitingForLabel;
    const isEditMode = store.currentTool === 'select';

    if (this.isPanning) {
      this.panPointer = { x: e.evt.clientX, y: e.evt.clientY };
      this.schedulePanFrame();
      return;
    }

    const pos = this.getClampedPointer();
    this.scheduleMousePosition(pos.x, pos.y);

    if (
      isEditMode &&
      !isLabelPickerActive &&
      !this.interacting &&
      !this.isBoxDragging &&
      !this.isOverCorner
    ) {
      const selectedId = this.selectedAnnotationRef;
      if (selectedId) {
        const selectedAnn = this.annotationsById.get(selectedId);
        if (
          selectedAnn?.shapeType === 'rotated-rectangle' &&
          isPointOnObbRotateInteractionZone(
            pos.x,
            pos.y,
            selectedAnn.x,
            selectedAnn.y,
            selectedAnn.width,
            selectedAnn.height,
            selectedAnn.angle ?? 0,
            store.zoom
          )
        ) {
          return;
        }
      }

      const hitId = this.pickShapeAtPointer();
      if (hitId) {
        const additive = e.evt.ctrlKey || e.evt.metaKey;
        if (additive) {
          if (!this.selectedAnnotationIdsRef.includes(hitId)) {
            store.selectAnnotationOnHover(hitId, true);
          }
        } else if (this.selectedAnnotationIdsRef.includes(hitId)) {
          // 多选时悬停已选中的方框，保持多选不变
        } else if (
          hitId !== this.selectedAnnotationRef ||
          this.selectedAnnotationIdsRef.length > 1
        ) {
          store.selectAnnotationOnHover(hitId, false);
        }
        this.scheduleSync();
      }
    }

    if (store.currentTool === 'polygon' && this.polygonPoints.length > 0) {
      this.polygonCursor = { x: pos.x, y: pos.y };
      this.syncInteractionLayer(store);
      this.interactionLayer.batchDraw();
    }

    if (
      this.drawState.placingSecondCorner &&
      (store.currentTool === 'rectangle' || store.currentTool === 'obb')
    ) {
      const { imageWidth, imageHeight } = this.getImageDimensions();
      if (imageWidth > 0 && imageHeight > 0) {
        const end = this.getPointerPosition();
        this.tempRect = rectFromDiagonal(
          this.drawState.startX,
          this.drawState.startY,
          end.x,
          end.y
        );
        this.syncInteractionLayer(store);
        this.interactionLayer.batchDraw();
      }
    }
  }

  private handleMouseLeave(): void {
    if (this.isPanning) return;
    this.updateCrosshairImperative(0, 0, false);
  }

  private handleMouseUp(): void {
    if (this.isPanning) {
      this.endPan();
    }
  }

  private handleEditLabel(annotationId: string): void {
    const store = useAnnotationStore.getState();
    if (store.labelModalOpen || store.waitingForLabel) return;
    store.setSelectedAnnotation(annotationId);
    store.openEditLabelModal(annotationId);
  }

  private isHomogeneousSelection(
    store: ReturnType<typeof useAnnotationStore.getState>
  ): boolean {
    const ids = store.selectedAnnotationIds;
    if (ids.length <= 1) return true;
    const imageId = store.currentImage?.id;
    if (!imageId) return false;
    const list = store.annotationsByImage[imageId] ?? [];
    let shapeType: string | null = null;
    for (const id of ids) {
      const item = list.find((a) => a.id === id);
      if (!item) return false;
      if (shapeType === null) {
        shapeType = item.shapeType;
      } else if (item.shapeType !== shapeType) {
        return false;
      }
    }
    return true;
  }

  private isSelectionDragAllowed(
    store: ReturnType<typeof useAnnotationStore.getState>
  ): boolean {
    return this.isHomogeneousSelection(store);
  }

  private beginGroupDragSession(draggedId: string): void {
    const store = useAnnotationStore.getState();
    if (store.selectedAnnotationIds.length <= 1) return;
    if (!store.selectedAnnotationIds.includes(draggedId)) return;
    if (!this.isHomogeneousSelection(store)) return;

    const imageId = store.currentImage?.id;
    if (!imageId) return;
    const list = store.annotationsByImage[imageId] ?? [];
    const snapshots = new Map<string, GroupDragSnapshot>();
    for (const id of store.selectedAnnotationIds) {
      const ann = list.find((a) => a.id === id);
      if (ann) snapshots.set(id, snapshotAnnotationForGroupDrag(ann));
    }
    this.groupDragSnapshots = snapshots;
    this.groupDragDraggedId = draggedId;
  }

  private scheduleGroupDragPreview(id: string, x: number, y: number): void {
    this.groupDragPending = { id, x, y };
    if (this.groupDragRaf) return;
    this.groupDragRaf = requestAnimationFrame(() => {
      this.groupDragRaf = 0;
      const pending = this.groupDragPending;
      this.groupDragPending = null;
      if (pending) this.applyGroupDragPreview(pending.id, pending.x, pending.y);
    });
  }

  private applyGroupDragPreview(draggedId: string, x: number, y: number): void {
    if (!this.groupDragSnapshots || this.groupDragDraggedId !== draggedId) return;
    const base = this.groupDragSnapshots.get(draggedId);
    if (!base) return;

    const { imageWidth, imageHeight } = this.getImageDimensions();
    const { dx, dy } = clampGroupDragDelta(
      this.groupDragSnapshots.values(),
      x - base.x,
      y - base.y,
      imageWidth,
      imageHeight
    );
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

    let moved = false;
    for (const [id] of this.groupDragSnapshots) {
      const entry = this.shapeHosts.get(id);
      if (entry && isGroupDragPreviewCapable(entry.host)) {
        entry.host.applyGroupDragPreview(dx, dy);
        moved = true;
      }
    }
    if (moved) {
      this.annotationLayer.batchDraw();
      this.selectionLayer.batchDraw();
    }
  }

  private clampGroupDeltaForCommit(
    rawDx: number,
    rawDy: number,
    imageWidth: number,
    imageHeight: number
  ): { dx: number; dy: number } {
    if (!this.groupDragSnapshots || this.groupDragSnapshots.size === 0) {
      return { dx: rawDx, dy: rawDy };
    }
    return clampGroupDragDelta(
      this.groupDragSnapshots.values(),
      rawDx,
      rawDy,
      imageWidth,
      imageHeight
    );
  }

  private endGroupDragSession(): void {
    if (this.groupDragRaf) {
      cancelAnimationFrame(this.groupDragRaf);
      this.groupDragRaf = 0;
    }
    this.groupDragPending = null;
    this.groupDragSnapshots = null;
    this.groupDragDraggedId = null;
    // 不在此处 clearGroupDragPreview：store 同步在下一帧，提前清空会导致松手回闪
  }

  private applyGroupShapeUpdate(
    updates: Partial<Annotation>,
    draggedAnn: Annotation,
    store: ReturnType<typeof useAnnotationStore.getState>,
    imageId: string,
    imageWidth: number,
    imageHeight: number
  ): void {
    const selectedIds = store.selectedAnnotationIds;
    const list = store.annotationsByImage[imageId] ?? [];
    const commands: (
      | MoveAnnotationCommand
      | ObbGeometryCommand
      | PolygonGeometryCommand
      | PoseGeometryCommand
    )[] = [];
    const patches: Record<string, Partial<Annotation>> = {};
    const shapeType = draggedAnn.shapeType;

    if (shapeType === 'polygon' && updates.points) {
      const rawDx = (updates.points[0] ?? 0) - (draggedAnn.points?.[0] ?? 0);
      const rawDy = (updates.points[1] ?? 0) - (draggedAnn.points?.[1] ?? 0);
      const { dx, dy } = this.clampGroupDeltaForCommit(rawDx, rawDy, imageWidth, imageHeight);
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      for (const id of selectedIds) {
        const ann = list.find((a) => a.id === id);
        if (!ann || ann.shapeType !== 'polygon' || !ann.points) continue;
        const newPoints = rigidTranslatePoints(ann.points, dx, dy);
        const bbox = getPolygonBBox(newPoints);
        const before = {
          points: ann.points,
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height,
        };
        const after = {
          points: newPoints,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
        };
        if (pointsNearlyEqual(before.points, after.points)) continue;
        patches[id] = after;
        commands.push(new PolygonGeometryCommand(imageId, id, before, after));
      }
    } else if (shapeType === 'rotated-rectangle') {
      const afterObb = obbFromAnnotation({ ...draggedAnn, ...updates });
      const beforeObb = obbFromAnnotation(draggedAnn);
      const { dx, dy } = this.clampGroupDeltaForCommit(
        afterObb.x - beforeObb.x,
        afterObb.y - beforeObb.y,
        imageWidth,
        imageHeight
      );
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      for (const id of selectedIds) {
        const ann = list.find((a) => a.id === id);
        if (!ann || ann.shapeType !== 'rotated-rectangle') continue;
        const before = obbFromAnnotation(ann);
        const after = { ...before, x: before.x + dx, y: before.y + dy };
        if (obbGeometryEqual(before, after)) continue;
        patches[id] = annotationPatchFromObb(after);
        commands.push(new ObbGeometryCommand(imageId, id, before, after));
      }
    } else if (shapeType === 'pose') {
      const afterGeo = poseGeometryFromAnnotation({ ...draggedAnn, ...updates });
      const beforeGeo = poseGeometryFromAnnotation(draggedAnn);
      const { dx, dy } = this.clampGroupDeltaForCommit(
        afterGeo.x - beforeGeo.x,
        afterGeo.y - beforeGeo.y,
        imageWidth,
        imageHeight
      );
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      for (const id of selectedIds) {
        const ann = list.find((a) => a.id === id);
        if (!ann || ann.shapeType !== 'pose') continue;
        const before = poseGeometryFromAnnotation(ann);
        const after = {
          ...before,
          x: before.x + dx,
          y: before.y + dy,
        };
        if (poseGeometryEqual(before, after)) continue;
        patches[id] = after;
        commands.push(new PoseGeometryCommand(imageId, id, before, after));
      }
    } else if (shapeType === 'point' && updates.x !== undefined && updates.y !== undefined) {
      const { dx, dy } = this.clampGroupDeltaForCommit(
        updates.x - draggedAnn.x,
        updates.y - draggedAnn.y,
        imageWidth,
        imageHeight
      );
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      for (const id of selectedIds) {
        const ann = list.find((a) => a.id === id);
        if (!ann || ann.shapeType !== 'point') continue;
        const next = { x: ann.x + dx, y: ann.y + dy };
        if (Math.abs(next.x - ann.x) < 0.01 && Math.abs(next.y - ann.y) < 0.01) continue;
        patches[id] = next;
        commands.push(
          new MoveAnnotationCommand(imageId, id, { x: ann.x, y: ann.y }, next)
        );
      }
    } else if (shapeType === 'rectangle') {
      const mergedX = updates.x ?? draggedAnn.x;
      const mergedY = updates.y ?? draggedAnn.y;
      const { dx, dy } = this.clampGroupDeltaForCommit(
        mergedX - draggedAnn.x,
        mergedY - draggedAnn.y,
        imageWidth,
        imageHeight
      );
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

      for (const id of selectedIds) {
        const ann = list.find((a) => a.id === id);
        if (!ann || ann.shapeType !== 'rectangle') continue;
        const x = ann.x + dx;
        const y = ann.y + dy;
        if (Math.abs(x - ann.x) < 0.01 && Math.abs(y - ann.y) < 0.01) continue;
        patches[id] = { x, y };
        commands.push(
          new MoveAnnotationCommand(imageId, id, { x: ann.x, y: ann.y }, { x, y })
        );
      }
    }

    if (commands.length === 0) return;
    store.updateAnnotations(imageId, patches);
    useHistoryStore.getState().pushCommand(new BatchCommand(commands, '移动标注'));
  }

  private handleShapeUpdate(id: string, updates: Partial<Annotation>): void {
    const store = useAnnotationStore.getState();
    const currentImage = store.currentImage;
    const { imageWidth, imageHeight } = this.getImageDimensions();
    if (!currentImage || imageWidth <= 0 || imageHeight <= 0) return;

    const ann = store.annotationsByImage[currentImage.id]?.find((a) => a.id === id);
    if (!ann) return;

    if (
      store.selectedAnnotationIds.length > 1 &&
      store.selectedAnnotationIds.includes(id) &&
      this.isHomogeneousSelection(store)
    ) {
      this.applyGroupShapeUpdate(updates, ann, store, currentImage.id, imageWidth, imageHeight);
      return;
    }

    if (ann.shapeType === 'polygon' && updates.points) {
      const before = {
        points: ann.points ?? [],
        x: ann.x,
        y: ann.y,
        width: ann.width,
        height: ann.height,
      };
      const after = {
        points: updates.points,
        x: updates.x ?? ann.x,
        y: updates.y ?? ann.y,
        width: updates.width ?? ann.width,
        height: updates.height ?? ann.height,
      };
      if (pointsNearlyEqual(before.points, after.points)) return;

      store.updateAnnotation(currentImage.id, id, after);
      useHistoryStore.getState().pushCommand(
        new PolygonGeometryCommand(currentImage.id, id, before, after)
      );
      return;
    }

    if (ann.shapeType === 'rotated-rectangle') {
      const before = obbFromAnnotation(ann);
      const after = obbFromAnnotation({ ...ann, ...updates });
      if (obbGeometryEqual(before, after)) return;

      store.updateAnnotation(currentImage.id, id, annotationPatchFromObb(after));
      useHistoryStore.getState().pushCommand(
        new ObbGeometryCommand(currentImage.id, id, before, after)
      );
      return;
    }

    if (ann.shapeType === 'point' && updates.x !== undefined && updates.y !== undefined) {
      const p = clampPoint(updates.x, updates.y, imageWidth, imageHeight);
      if (Math.abs(p.x - ann.x) < 0.01 && Math.abs(p.y - ann.y) < 0.01) return;

      store.updateAnnotation(currentImage.id, id, p);
      useHistoryStore.getState().pushCommand(
        new MoveAnnotationCommand(
          currentImage.id,
          id,
          { x: ann.x, y: ann.y },
          { x: p.x, y: p.y }
        )
      );
      return;
    }

    if (ann.shapeType === 'pose') {
      const before = poseGeometryFromAnnotation(ann);
      const after = poseGeometryFromAnnotation({ ...ann, ...updates });
      if (poseGeometryEqual(before, after)) return;

      store.updateAnnotation(currentImage.id, id, after);
      useHistoryStore.getState().pushCommand(
        new PoseGeometryCommand(currentImage.id, id, before, after)
      );
      return;
    }

    const merged = { ...ann, ...updates };
    const isPositionOnly =
      updates.width === undefined &&
      updates.height === undefined &&
      (updates.x !== undefined || updates.y !== undefined);

    if (isPositionOnly) {
      const normalized = clampRect(
        ann.x,
        ann.y,
        ann.width,
        ann.height,
        imageWidth,
        imageHeight
      );
      const { x, y } = clampRectPosition(
        merged.x,
        merged.y,
        normalized.width,
        normalized.height,
        imageWidth,
        imageHeight
      );
      if (Math.abs(x - ann.x) < 0.01 && Math.abs(y - ann.y) < 0.01) return;

      store.updateAnnotation(currentImage.id, id, { x, y });
      useHistoryStore.getState().pushCommand(
        new MoveAnnotationCommand(
          currentImage.id,
          id,
          { x: ann.x, y: ann.y },
          { x, y }
        )
      );
      return;
    }

    const clamped = clampRect(
      merged.x,
      merged.y,
      merged.width,
      merged.height,
      imageWidth,
      imageHeight
    );
    if (
      clamped.x === ann.x &&
      clamped.y === ann.y &&
      clamped.width === ann.width &&
      clamped.height === ann.height
    ) {
      return;
    }
    useHistoryStore.getState().executeCommand(
      new ResizeAnnotationCommand(
        currentImage.id,
        id,
        { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
        clamped
      )
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget()) return;

    const store = useAnnotationStore.getState();
    const isEditMode = store.currentTool === 'select';
    const currentImage = store.currentImage;
    const selectedAnnotation = store.selectedAnnotation;
    const selectedAnnotationIds = store.selectedAnnotationIds;

    if (store.waitingForLabel) {
      if (e.key === 'Escape') {
        e.preventDefault();
        store.cancelWaitingForLabel();
        (document.activeElement as HTMLElement)?.blur();
        this.scheduleSync();
        return;
      }
      const digit = parseShortcutDigit(e.key);
      if (digit !== null) {
        if (store.confirmPendingWithShortcutDigit(digit)) {
          e.preventDefault();
        }
        this.scheduleSync();
        return;
      }
    }

    if (store.labelModalOpen) return;

    if (e.key === 'r' || e.key === 'R') {
      if (store.currentImage) store.setCurrentTool('rectangle');
      (document.activeElement as HTMLElement)?.blur();
    } else if (e.key === 'p' || e.key === 'P') {
      if (store.currentImage) store.setCurrentTool('polygon');
      (document.activeElement as HTMLElement)?.blur();
    } else if (e.key === 'b' || e.key === 'B') {
      if (store.currentImage) store.setCurrentTool('obb');
      (document.activeElement as HTMLElement)?.blur();
    } else if (e.key === 'o' || e.key === 'O') {
      if (store.currentImage) store.setCurrentTool('point');
      (document.activeElement as HTMLElement)?.blur();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'l' || e.key === 'L')
    ) {
      if (!currentImage || store.labels.length === 0) return;
      e.preventDefault();
      store.toggleShowLabels();
      (document.activeElement as HTMLElement)?.blur();
    } else if (e.key === 'Escape') {
      store.clearSelection();
      this.drawState = { placingSecondCorner: false, startX: 0, startY: 0 };
      this.tempRect = null;
      this.polygonPoints = [];
      this.polygonCursor = null;
      this.polygonLastClick = null;
      this.scheduleSync();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'z' || e.key === 'Z')
    ) {
      e.preventDefault();
      if (e.shiftKey) {
        useHistoryStore.getState().redo();
      } else {
        useHistoryStore.getState().undo();
      }
      (document.activeElement as HTMLElement)?.blur();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'y' || e.key === 'Y')
    ) {
      e.preventDefault();
      useHistoryStore.getState().redo();
      (document.activeElement as HTMLElement)?.blur();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'c' || e.key === 'C') &&
      isEditMode &&
      currentImage &&
      selectedAnnotation
    ) {
      e.preventDefault();
      const anns = store.annotationsByImage[currentImage.id] ?? [];
      const copySet = getAnnotationsForCopy(anns, selectedAnnotation);
      if (copySet) {
        copyAnnotationsToClipboard(copySet.annotations, copySet.primaryId);
      }
      (document.activeElement as HTMLElement)?.blur();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'v' || e.key === 'V') &&
      isEditMode &&
      currentImage &&
      hasAnnotationClipboard()
    ) {
      e.preventDefault();
      const result = buildPasteResult(currentImage.width, currentImage.height);
      if (result && result.annotations.length > 0) {
        useHistoryStore.getState().executeCommand(
          new PasteAnnotationsCommand(
            currentImage.id,
            result.annotations,
            result.primaryId
          )
        );
      }
      (document.activeElement as HTMLElement)?.blur();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === 'd' || e.key === 'D') &&
      isEditMode &&
      currentImage &&
      selectedAnnotation
    ) {
      e.preventDefault();
      const anns = store.annotationsByImage[currentImage.id] ?? [];
      const result = buildDuplicateResult(
        anns,
        selectedAnnotation,
        currentImage.width,
        currentImage.height
      );
      if (result && result.annotations.length > 0) {
        useHistoryStore.getState().executeCommand(
          new PasteAnnotationsCommand(
            currentImage.id,
            result.annotations,
            result.primaryId
          )
        );
      }
      (document.activeElement as HTMLElement)?.blur();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedAnnotationIds.length > 0 && currentImage) {
        const anns = store.annotationsByImage[currentImage.id] ?? [];
        const toDelete = anns.filter((a) => selectedAnnotationIds.includes(a.id));
        if (toDelete.length > 0) {
          useHistoryStore.getState().executeCommand(
            new DeleteAnnotationsCommand(
              currentImage.id,
              toDelete,
              [...selectedAnnotationIds]
            )
          );
        }
      }
    } else if ((e.key === 's' || e.key === 'S') && currentImage && isEditMode) {
      const idsToHide =
        selectedAnnotationIds.length > 0
          ? selectedAnnotationIds
          : selectedAnnotation
            ? [selectedAnnotation]
            : [];
      if (idsToHide.length === 0) return;

      const anns = store.annotationsByImage[currentImage.id] ?? [];
      const history = useHistoryStore.getState();
      for (const id of idsToHide) {
        const ann = anns.find((a) => a.id === id);
        if (!ann || ann.hidden) continue;
        history.executeCommand(new HideAnnotationCommand(currentImage.id, id, true));
      }
      (document.activeElement as HTMLElement)?.blur();
    } else if ((e.key === 'w' || e.key === 'W') && isEditMode && currentImage) {
      const idsToShow =
        selectedAnnotationIds.length > 0
          ? selectedAnnotationIds
          : selectedAnnotation
            ? [selectedAnnotation]
            : [];

      const anns = store.annotationsByImage[currentImage.id] ?? [];
      const hiddenInSelection = idsToShow.filter((id) => {
        const ann = anns.find((a) => a.id === id);
        return ann?.hidden;
      });

      const history = useHistoryStore.getState();

      if (selectedAnnotationIds.length > 1 && hiddenInSelection.length > 0) {
        history.executeCommand(
          new ShowAnnotationsCommand(
            currentImage.id,
            hiddenInSelection,
            store.captureViewSnapshot(),
            idsToShow
          )
        );
      } else if (history.canRevealLastHidden()) {
        store.revealLastHidden();
      } else if (hiddenInSelection.length === 1) {
        history.executeCommand(
          new ShowAnnotationCommand(
            currentImage.id,
            hiddenInSelection[0],
            store.captureViewSnapshot(),
            false
          )
        );
      }
      (document.activeElement as HTMLElement)?.blur();
    }
  }

  private loadCurrentImage(): void {
    this.imageLoadCancel?.();
    this.imageLoadCancel = null;

    const currentImage = useAnnotationStore.getState().currentImage;
    if (!currentImage) {
      this.displayFrame = null;
      this.setImageLoading(false);
      this.scheduleSync();
      return;
    }

    let cancelled = false;
    const targetId = currentImage.id;

    const pinNearbyImages = (centerIndex: number) => {
      const { imageList } = useAnnotationStore.getState();
      const pinned: string[] = [];
      for (let i = centerIndex - 5; i <= centerIndex + 5; i++) {
        const neighbor = imageList[i];
        if (neighbor) pinned.push(neighbor.id);
      }
      setPinnedImageIds(pinned);
    };

    const preloadNeighbors = (centerIndex: number) => {
      pinNearbyImages(centerIndex);
      const { imageList, updateImage } = useAnnotationStore.getState();
      for (const offset of [-1, 1]) {
        const neighbor = imageList[centerIndex + offset];
        if (!neighbor) continue;
        loadImageElement(neighbor)
          .then(({ image: loaded }) => {
            if (cancelled) return;
            updateImage(loaded.id, {
              url: loaded.url,
              width: loaded.width,
              height: loaded.height,
              loaded: true,
            });
          })
          .catch(() => undefined);
      }
    };

    const applyFrame = (loaded: ImageFile, element: HTMLImageElement) => {
      if (cancelled) return;
      if (useAnnotationStore.getState().currentImage?.id !== targetId) return;

      const { width, height } = loaded;
      const cw = this.containerSize.width;
      const ch = this.containerSize.height;

      this.displayFrame = { id: loaded.id, element, width, height };
      this.setImageLoading(false);

      const store = useAnnotationStore.getState();
      if (width > 0 && height > 0) {
        const live = store.currentImage;
        if (
          live?.id === targetId &&
          (live.width <= 0 || live.height <= 0 || !live.loaded)
        ) {
          store.updateImage(targetId, {
            width,
            height,
            url: loaded.url,
            loaded: true,
          });
        }
      }

      const { zoom: currentZoom, stagePosition: currentPos, resetZoomOnImageChange } = store;

      const shouldFitMarker = this.needFitImageId === targetId;
      if (shouldFitMarker) {
        this.needFitImageId = null;
      }

      let targetZoom = currentZoom;
      let targetPos = currentPos;

      if (
        shouldFitMarker &&
        resetZoomOnImageChange &&
        width > 0 &&
        height > 0 &&
        cw > 0 &&
        ch > 0
      ) {
        targetZoom = computeFitZoom(width, height, cw, ch);
        targetPos = { x: 0, y: 0 };
      }

      const from = { zoom: currentZoom, stagePosition: currentPos };
      const to = { zoom: targetZoom, stagePosition: targetPos };

      const fadeInAnnotations = () => {
        requestAnimationFrame(() => {
          this.batchDrawStage();
          this.opacityAnimCancel?.();
          this.opacityAnimCancel = animateOpacity(this.annotationOpacity, 1, {
            duration: ANNOTATION_FADE_DURATION_MS,
            onUpdate: (v) => {
              this.annotationOpacity = v;
              this.annotationLayer.opacity(v);
              this.selectionLayer.opacity(v);
              this.batchDrawStage();
            },
            onComplete: () => {
              this.scheduleSync();
              requestAnimationFrame(() => this.batchDrawStage());
            },
          });
        });
      };

      const onViewTransitionComplete = () => fadeInAnnotations();

      this.viewAnimCancel?.();
      if (viewTransformNeedsAnimation(from, to)) {
        this.viewAnimCancel = animateViewTransform(from, to, {
          onUpdate: (z, p) => {
            store.setViewTransform(z, p);
            requestAnimationFrame(() => this.batchDrawStage());
          },
          onComplete: onViewTransitionComplete,
        });
      } else {
        if (resetZoomOnImageChange && shouldFitMarker) {
          store.setViewTransform(targetZoom, targetPos);
        }
        onViewTransitionComplete();
      }

      const { currentImageIndex } = useAnnotationStore.getState();
      if (currentImageIndex >= 0) preloadNeighbors(currentImageIndex);
      this.scheduleSync();
    };

    const cachedResolved = tryResolveImageElementFromCache(currentImage);
    if (cachedResolved) {
      applyFrame(cachedResolved.image, cachedResolved.element);
      this.imageLoadCancel = () => {
        cancelled = true;
      };
      return;
    }

    const showLoadingOverlay = !this.displayFrame;
    if (showLoadingOverlay) {
      this.setImageLoading(true);
    }
    this.scheduleSync();

    loadImageElement(currentImage)
      .then(({ image: loaded, element }) => {
        if (cancelled) return;
        useAnnotationStore.getState().updateImage(loaded.id, {
          url: loaded.url,
          width: loaded.width,
          height: loaded.height,
          loaded: true,
        });
        applyFrame(loaded, element);
      })
      .catch(() => {
        if (!cancelled && useAnnotationStore.getState().currentImage?.id === targetId) {
          this.displayFrame = null;
          this.setImageLoading(false);
          this.annotationOpacity = 0;
          this.scheduleSync();
        }
      });

    this.imageLoadCancel = () => {
      cancelled = true;
      this.viewAnimCancel?.();
      this.opacityAnimCancel?.();
      const stillOnSameImage = useAnnotationStore.getState().currentImage?.id === targetId;
        if (!stillOnSameImage) {
        this.setImageLoading(false);
      }
    };
  }
}

export function getWiredShapeHostTypes(
  registry: ShapeHostRegistry = {
    rectangle: RectShapeHost,
    'rotated-rectangle': ObbShapeHost,
    polygon: PolygonShapeHost,
    point: PointShapeHost,
    pose: PoseShapeHost,
  }
): string[] {
  return Object.entries(registry)
    .filter(([, ctor]) => Boolean(ctor))
    .map(([key]) => key);
}
