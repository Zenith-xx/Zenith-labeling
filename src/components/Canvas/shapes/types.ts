import type { Annotation } from '../../../types';
import type { PoseConfig } from '../../../utils/poseConfig';

/** Shared context passed to all annotation shape hosts (callbacks + canvas state). */
export interface ShapeHostContext {
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  isEditMode: boolean;
  clientToImage: (clientX: number, clientY: number) => { x: number; y: number };
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onInteractStart: () => void;
  onInteractEnd: () => void;
  onCornerHover: (hovering: boolean) => void;
  onBoxDrag: (dragging: boolean) => void;
  /** 多选拖动：开始 / 移动 / 结束（仅主动拖动的标注触发） */
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onDragEnd?: () => void;
  /** 多选且类型不一致时为 false，禁止拖动 */
  allowBoxDrag: boolean;
  /** 多选同类型联动拖动：位移由控制器统一贴边，避免各框单独挤压 */
  groupDragSync?: boolean;
  onEditLabel?: (id: string) => void;
}

export interface ShapeHostVisualProps {
  ann: Annotation;
  color: string;
  labelName: string;
  groupId?: number;
  isSelected: boolean;
  showLabels: boolean;
}

export interface ObbShapeHostProps extends ShapeHostContext, ShapeHostVisualProps {
  rotateHandleHover?: boolean;
}

export interface PoseShapeHostProps extends ShapeHostContext, ShapeHostVisualProps {
  poseConfig: PoseConfig;
  selectedKeypointIndex: number | null;
  onSelectKeypoint: (index: number | null) => void;
}

export type PolygonShapeHostProps = ShapeHostContext & ShapeHostVisualProps;
export type PointShapeHostProps = ShapeHostContext & ShapeHostVisualProps;
export type RectShapeHostProps = ShapeHostContext & ShapeHostVisualProps;
