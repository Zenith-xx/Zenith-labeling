import type {
  ToolType,
  Annotation,
  ImageFile,
  Label,
  PendingAnnotation,
} from '../../types';
import type { PoseConfig } from '../../utils/poseConfig';
import type { ShowViewSnapshot } from '../../history';

export type ImagePatch = Partial<
  Pick<ImageFile, 'name' | 'url' | 'width' | 'height' | 'loaded' | 'file'>
>;

export interface AnnotationStore {
  currentTool: ToolType;
  setCurrentTool: (tool: ToolType) => void;

  labels: Label[];
  /** 由 Command 调用，不触发 History */
  addLabel: (label: Label) => void;
  updateLabel: (id: string, updates: Partial<Omit<Label, 'id'>>) => void;
  removeLabelWithoutHistory: (id: string) => void;
  removeLabelsWithoutHistory: (ids: string[]) => void;
  /** 清空全部标签与全部标注；不可撤销 */
  clearAllLabels: () => void;
  getLabelById: (id: string) => Label | undefined;

  annotationsByImage: Record<string, Annotation[]>;
  annotatedImageIds: Record<string, true>;
  getAnnotationsForImage: (imageId: string) => Annotation[];
  addAnnotation: (imageId: string, annotation: Annotation) => void;
  removeAnnotation: (imageId: string, annotationId: string) => void;
  updateAnnotation: (
    imageId: string,
    annotationId: string,
    updates: Partial<Omit<Annotation, 'id'>>
  ) => void;
  /** 批量更新同一张图上的多个标注（一次 set，避免多选拖动卡顿） */
  updateAnnotations: (
    imageId: string,
    updatesById: Record<string, Partial<Omit<Annotation, 'id'>>>
  ) => void;
  replaceImageAnnotations: (imageId: string, annotations: Annotation[]) => void;
  setAnnotationHidden: (
    imageId: string,
    annotationId: string,
    hidden: boolean
  ) => void;
  captureViewSnapshot: () => ShowViewSnapshot;
  focusAnnotationView: (imageId: string, annotationId: string) => void;
  restoreViewSnapshot: (snapshot: ShowViewSnapshot) => void;
  /** W 快捷键：撤销最近一次隐藏（若栈顶为 HIDE_ANNOTATION） */
  revealLastHidden: () => boolean;

  selectedAnnotation: string | null;
  selectedAnnotationIds: string[];
  setSelectedAnnotation: (id: string | null) => void;
  setSelectedAnnotations: (ids: string[]) => void;
  selectAnnotationOnHover: (id: string, additive: boolean) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearSelection: () => void;

  currentImage: ImageFile | null;
  currentImageIndex: number;
  setCurrentImage: (image: ImageFile) => void;
  setCurrentImageByIndex: (index: number) => void;
  goToPreviousImage: () => void;
  goToNextImage: () => void;
  imageList: ImageFile[];
  addImage: (image: ImageFile) => void;
  updateImage: (imageId: string, patch: ImagePatch) => void;
  batchUpdateImages: (patches: Record<string, ImagePatch>) => void;
  loadProject: (project: {
    images: ImageFile[];
    labels: Label[];
    annotationsByImage: Record<string, Annotation[]>;
  }) => void;
  /** 清空状态，准备分批导入数据集 */
  prepareDatasetImport: () => void;
  /** 分批追加图片（不替换 imageList） */
  appendImages: (images: ImageFile[]) => void;
  /** 分批合并标注与标签 */
  appendAnnotations: (
    labels: Label[],
    annotationsByImage: Record<string, Annotation[]>
  ) => void;
  /** 分批仅合并标注（标签已通过 sync/Transaction 写入） */
  appendAnnotationsOnly: (
    annotationsByImage: Record<string, Annotation[]>
  ) => void;
  /** 导入完成：触发 autosave */
  finishDatasetImport: () => void;
  /** 清空标签列表（保留标注），JSON 解析前按导入数据重建标签 */
  resetLabelsForImport: () => void;
  /** 按路径自然排序图片列表（与资源管理器一致） */
  sortImageListByPath: () => void;

  zoom: number;
  setZoom: (zoom: number) => void;

  /** 画布是否显示标注标签（Ctrl+L） */
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  toggleShowLabels: () => void;

  stagePosition: { x: number; y: number };
  setStagePosition: (pos: { x: number; y: number }) => void;
  setViewTransform: (zoom: number, stagePosition: { x: number; y: number }) => void;

  resetZoomOnImageChange: boolean;
  setResetZoomOnImageChange: (reset: boolean) => void;

  mousePosition: { x: number; y: number };
  setMousePosition: (pos: { x: number; y: number }) => void;

  pendingAnnotation: PendingAnnotation | null;
  editingAnnotationId: string | null;
  labelModalOpen: boolean;
  /** 画框完成后等待数字键选标签 */
  waitingForLabel: boolean;
  /** 快捷标签分页（0-based，每页 10 个：1–9、0） */
  shortcutPage: number;
  beginWaitingForLabel: (
    pending: PendingAnnotation,
    options?: { preserveGroupId?: boolean }
  ) => void;
  cancelWaitingForLabel: () => void;
  nextShortcutPage: () => void;
  previousShortcutPage: () => void;
  /** 数字键 1–9、0 确认标签，走 AddAnnotationCommand */
  confirmPendingWithShortcutDigit: (digit: number) => boolean;
  /** 从等待状态打开完整 LabelModal */
  openLabelModalFromWaiting: (labelName?: string) => void;
  openLabelModal: (pending: PendingAnnotation) => void;
  openEditLabelModal: (annotationId: string) => void;
  confirmLabelByText: (labelName: string, description?: string) => void;
  cancelLabelModal: () => void;
  lastUsedLabelName: string;

  /** 最近一次标注使用的编号（关键点自动绑定） */
  lastUsedGroupId: number | null;

  /** 标签选择时可填写的编号（绑定方框与关键点） */
  pendingGroupIdInput: string;
  setPendingGroupIdInput: (value: string) => void;

  /** YOLO Pose 关键点配置（与 Ultralytics pose yaml 一致） */
  poseConfig: PoseConfig;
  setPoseConfig: (config: PoseConfig) => void;

  /** 当前选中的关键点序号（pose 标注内，0-based） */
  selectedKeypointIndex: number | null;
  setSelectedKeypointIndex: (index: number | null) => void;

  clearCurrentImageAnnotations: () => void;
  applyYoloImport: (
    labels: Label[],
    annotationsByImage: Record<string, Annotation[]>,
    poseConfig?: PoseConfig,
    options?: { replaceLabels?: boolean /** 默认 true：按导入重建标签 */ }
  ) => void;
}
