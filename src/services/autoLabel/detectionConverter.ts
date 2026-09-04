import type { LabelingServerModel, LabelingServerPredictResult, RemoteShape } from './types';

/** 将 Labeling-Server 统一 shapes 转为标注形状 */
export function serverShapesToRemoteShapes(
  shapes: LabelingServerPredictResult['shapes']
): RemoteShape[] {
  return shapes
    .filter((s) => s.label?.trim() && s.points?.length)
    .map((s) => ({
      label: s.label.trim(),
      shape_type: s.shape_type,
      points: s.points as [number, number][],
      score: s.score ?? null,
      attributes: s.keypoints ? { keypoints: s.keypoints } : undefined,
    }));
}

/** @deprecated 兼容旧版仅 detections 的响应 */
export function detectionsToRemoteShapes(
  detections: import('./types').LabelingDetection[]
): RemoteShape[] {
  return detections
    .filter((d) => d.label?.trim())
    .map((d) => {
      const { x, y, width, height } = d.bbox;
      return {
        label: d.label.trim(),
        shape_type: 'rectangle',
        points: [
          [x, y],
          [x + width, y + height],
        ] as [number, number][],
        score: d.confidence,
      };
    });
}

export function predictionToRemoteShapes(
  result: LabelingServerPredictResult
): RemoteShape[] {
  if (result.shapes?.length) {
    return serverShapesToRemoteShapes(result.shapes);
  }
  return detectionsToRemoteShapes(result.detections ?? []);
}
