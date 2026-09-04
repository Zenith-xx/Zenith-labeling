export type ToolType = 'select' | 'rectangle' | 'polygon' | 'obb' | 'point' | 'delete';

export type AnnotationShapeType =
  | 'rectangle'
  | 'polygon'
  | 'rotated-rectangle'
  | 'point'
  | 'pose';

export type YoloFormat = 'hbb' | 'obb' | 'seg' | 'pose';

/** COCO 导出格式 */
export type CocoFormat = 'detection' | 'segmentation' | 'keypoints';

/** VOC 导入/导出格式 */
export type VocFormat = 'detection' | 'segmentation';

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface Annotation {
  id: string;
  labelId: string;
  shapeType: AnnotationShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 多边形顶点 [x1,y1,x2,y2,...]；OBB 可存四角点 */
  points?: number[];
  /** 旋转框角度（弧度，绕中心） */
  angle?: number;
  /** Pose 关键点 [x1,y1,v1, x2,y2,v2, ...] */
  keypoints?: number[];
  /** 用户自定义编号，用于绑定方框与关键点 */
  groupId?: number;
  /** 是否在画布上隐藏（仍保留标注数据） */
  hidden?: boolean;
  /** AI 推理置信度，画布标签显示为「类别 0.60」 */
  score?: number;
}

/** 绘制完成、待绑定标签的临时标注（各形状通用） */
export interface PendingAnnotation {
  id: string;
  shapeType: AnnotationShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: number[];
  angle?: number;
  keypoints?: number[];
  groupId?: number;
}

export interface ImageFile {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  /** 原始文件引用，用于懒加载解码；恢复项目后绑定文件夹前可为空 */
  file?: File;
  /** 是否已完成解码并获取尺寸 */
  loaded?: boolean;
}

/** 根据多边形顶点计算包围盒 */
export function getPolygonBBox(points: number[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    xs.push(points[i]);
    ys.push(points[i + 1]);
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
