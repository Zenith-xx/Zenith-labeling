import type { FormatMenuGroup } from './formatMenuTypes';

export const UPLOAD_FORMAT_GROUPS: FormatMenuGroup[] = [
  {
    items: [
      { id: 'yolo:hbb', label: 'YOLO HBB' },
      { id: 'yolo:obb', label: 'YOLO OBB' },
      { id: 'yolo:seg', label: 'YOLO Seg' },
      { id: 'yolo:pose', label: 'YOLO Pose' },
    ],
  },
  {
    items: [
      { id: 'coco:detection', label: 'COCO 检测' },
      { id: 'coco:segmentation', label: 'COCO 分割' },
      { id: 'coco:keypoints', label: 'COCO 关键点' },
    ],
  },
  {
    items: [
      { id: 'voc:detection', label: 'VOC 检测' },
      { id: 'voc:segmentation', label: 'VOC 分割' },
    ],
  },
];

export const EXPORT_FORMAT_GROUPS: FormatMenuGroup[] = [
  {
    items: [
      { id: 'yolo:hbb', label: 'YOLO HBB' },
      { id: 'yolo:obb', label: 'YOLO OBB' },
      { id: 'yolo:seg', label: 'YOLO Seg' },
      { id: 'yolo:pose', label: 'YOLO Pose' },
    ],
  },
  {
    items: [
      { id: 'coco:detection', label: 'COCO 检测' },
      { id: 'coco:segmentation', label: 'COCO 分割' },
      { id: 'coco:keypoints', label: 'COCO 关键点' },
    ],
  },
  {
    items: [
      { id: 'voc:detection', label: 'VOC 检测' },
      { id: 'voc:segmentation', label: 'VOC 分割' },
    ],
  },
];
