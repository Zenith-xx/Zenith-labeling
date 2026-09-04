/** OBB 几何：中心旋转矩形 ↔ 四角点（YOLO OBB 格式） */

import type { Annotation } from '../types';
import { getPolygonBBox } from '../types';
import { clampPoint } from './annotationBounds';
import { getObbRotateHandleOffset, getObbRotateHandleRadii, getObbRotateCorridorHitHalfWidth } from './shapeStyle';

export interface ObbGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  points: number[];
}

export function getObbCenter(x: number, y: number, width: number, height: number) {
  return { cx: x + width / 2, cy: y + height / 2 };
}

export function getObbCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  angleRad = 0
): number[] {
  const { cx, cy } = getObbCenter(x, y, width, height);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const hw = width / 2;
  const hh = height / 2;
  const local: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  const out: number[] = [];
  for (const [lx, ly] of local) {
    out.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
  }
  return out;
}

export function pointInObb(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angleRad = 0
): boolean {
  const { cx, cy } = getObbCenter(x, y, width, height);
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  const lx = (px - cx) * cos - (py - cy) * sin;
  const ly = (px - cx) * sin + (py - cy) * cos;
  return Math.abs(lx) <= width / 2 && Math.abs(ly) <= height / 2;
}

/** 点是否落在 OBB 边框附近（用于重叠旋转框按边线选中） */
export function pointNearObbBorder(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angleRad: number,
  tolerance: number
): boolean {
  if (width <= 0 || height <= 0 || tolerance <= 0) return false;

  const { cx, cy } = getObbCenter(x, y, width, height);
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  const lx = (px - cx) * cos - (py - cy) * sin;
  const ly = (px - cx) * sin + (py - cy) * cos;
  const hw = width / 2;
  const hh = height / 2;

  if (Math.abs(lx) > hw + tolerance || Math.abs(ly) > hh + tolerance) {
    return false;
  }

  const distToEdge = Math.min(
    Math.abs(lx + hw),
    Math.abs(hw - lx),
    Math.abs(ly + hh),
    Math.abs(hh - ly)
  );
  return distToEdge <= tolerance;
}

/** 由 YOLO OBB 四角点还原 x,y,width,height,angle */
export function obbFromCorners(points: number[]): {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
} {
  const x1 = points[0];
  const y1 = points[1];
  const x2 = points[2];
  const y2 = points[3];
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const rx = points[i];
    const ry = points[i + 1];
    xs.push(rx * cos - ry * sin);
    ys.push(rx * sin + ry * cos);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const localCx = (minX + maxX) / 2;
  const localCy = (minY + maxY) / 2;
  const cx = localCx * Math.cos(angle) - localCy * Math.sin(angle);
  const cy = localCx * Math.sin(angle) + localCy * Math.cos(angle);
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    angle,
  };
}

/** YOLO OBB angle 格式：xc yc w h angle(radians) */
export function obbFromYoloAngle(
  xc: number,
  yc: number,
  w: number,
  h: number,
  angle: number,
  imageWidth: number,
  imageHeight: number
) {
  const width = w * imageWidth;
  const height = h * imageHeight;
  const cx = xc * imageWidth;
  const cy = yc * imageHeight;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    angle,
  };
}

export function buildObbFromParams(
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0
): ObbGeometry {
  return {
    x,
    y,
    width,
    height,
    angle,
    points: getObbCorners(x, y, width, height, angle),
  };
}

export function obbFromAnnotation(ann: Annotation): ObbGeometry {
  const angle = ann.angle ?? 0;
  if (ann.points && ann.points.length >= 8) {
    const parsed = obbFromCorners(ann.points);
    return buildObbFromParams(
      parsed.x,
      parsed.y,
      parsed.width,
      parsed.height,
      parsed.angle
    );
  }
  return buildObbFromParams(ann.x, ann.y, ann.width, ann.height, angle);
}

export function annotationPatchFromObb(obb: ObbGeometry): Partial<Annotation> {
  return {
    x: obb.x,
    y: obb.y,
    width: obb.width,
    height: obb.height,
    angle: obb.angle,
    points: [...obb.points],
  };
}

function pointsNearlyEqual(a: number[], b: number[], eps = 0.5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

export function obbGeometryEqual(a: ObbGeometry, b: ObbGeometry, eps = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps &&
    Math.abs(a.angle - b.angle) < 1e-4 &&
    pointsNearlyEqual(a.points, b.points, eps)
  );
}

export function getObbAxisAlignedBBox(
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0
) {
  const corners = getObbCorners(x, y, width, height, angle);
  return getPolygonBBox(corners);
}

export type ObCorner = 'tl' | 'tr' | 'br' | 'bl';

const CORNER_INDEX: Record<ObCorner, number> = {
  tl: 0,
  tr: 1,
  br: 2,
  bl: 3,
};

const CORNER_SIGNS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** 拖拽角在局部坐标下的宽高（对角锚点固定） */
function obbDragUvToSize(
  corner: ObCorner,
  u: number,
  v: number,
  minSize: number
): { w: number; h: number } {
  let w: number;
  let h: number;
  switch (corner) {
    case 'tl':
      w = -u;
      h = -v;
      break;
    case 'tr':
      w = u;
      h = -v;
      break;
    case 'br':
      w = u;
      h = v;
      break;
    case 'bl':
      w = -u;
      h = v;
      break;
  }
  return {
    w: Math.max(minSize, w),
    h: Math.max(minSize, h),
  };
}

/** 拖角 resize：对角锚点固定在世界坐标，保持当前 angle（与矩形框一致，不翻转） */
export function resizeObbFromFixedCorner(
  angle: number,
  corner: ObCorner,
  fixedX: number,
  fixedY: number,
  pointerX: number,
  pointerY: number,
  minSize = 5
): ObbGeometry {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = pointerX - fixedX;
  const dy = pointerY - fixedY;

  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  const { w, h } = obbDragUvToSize(corner, u, v, minSize);

  const fixedIdx = (CORNER_INDEX[corner] + 2) % 4;
  const fsx = CORNER_SIGNS[fixedIdx][0];
  const fsy = CORNER_SIGNS[fixedIdx][1];

  const lx = fsx * (w / 2);
  const ly = fsy * (h / 2);
  const ox = lx * cos - ly * sin;
  const oy = lx * sin + ly * cos;
  const cx = fixedX - ox;
  const cy = fixedY - oy;

  return buildObbFromParams(cx - w / 2, cy - h / 2, w, h, angle);
}

/** 拖角 resize：对角固定，保持当前 angle */
export function resizeObbFromCornerDrag(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  corner: ObCorner,
  pointerX: number,
  pointerY: number,
  minSize = 5
): ObbGeometry {
  const idx = CORNER_INDEX[corner];
  const corners = getObbCorners(x, y, width, height, angle);
  const fixedIdx = (idx + 2) % 4;
  const fx = corners[fixedIdx * 2];
  const fy = corners[fixedIdx * 2 + 1];

  return resizeObbFromFixedCorner(
    angle,
    corner,
    fx,
    fy,
    pointerX,
    pointerY,
    minSize
  );
}

/** 四角是否均在图像范围内 */
export function obbCornersInsideImage(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  imageWidth: number,
  imageHeight: number
): boolean {
  if (imageWidth <= 0 || imageHeight <= 0) return true;
  const corners = getObbCorners(x, y, width, height, angle);
  for (let i = 0; i < corners.length; i += 2) {
    const cx = corners[i];
    const cy = corners[i + 1];
    if (cx < 0 || cx > imageWidth || cy < 0 || cy > imageHeight) {
      return false;
    }
  }
  return true;
}

/**
 * 拖角 resize，并保证四角不超出图像（沿固定对角方向收缩拖拽点）。
 */
export function resizeObbFromCornerDragBounded(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  corner: ObCorner,
  pointerX: number,
  pointerY: number,
  minSize: number,
  imageWidth: number,
  imageHeight: number
): ObbGeometry {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return resizeObbFromCornerDrag(x, y, width, height, angle, corner, pointerX, pointerY, minSize);
  }

  const idx = CORNER_INDEX[corner];
  const corners = getObbCorners(x, y, width, height, angle);
  const fixedIdx = (idx + 2) % 4;
  const fx = corners[fixedIdx * 2];
  const fy = corners[fixedIdx * 2 + 1];

  const clamped = clampPoint(pointerX, pointerY, imageWidth, imageHeight);
  let px = clamped.x;
  let py = clamped.y;

  const atPointer = resizeObbFromCornerDrag(
    x,
    y,
    width,
    height,
    angle,
    corner,
    px,
    py,
    minSize
  );
  if (
    obbCornersInsideImage(
      atPointer.x,
      atPointer.y,
      atPointer.width,
      atPointer.height,
      atPointer.angle,
      imageWidth,
      imageHeight
    )
  ) {
    return atPointer;
  }

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const testPx = fx + t * (px - fx);
    const testPy = fy + t * (py - fy);
    const testObb = resizeObbFromCornerDrag(
      x,
      y,
      width,
      height,
      angle,
      corner,
      testPx,
      testPy,
      minSize
    );
    const fits = obbCornersInsideImage(
      testObb.x,
      testObb.y,
      testObb.width,
      testObb.height,
      testObb.angle,
      imageWidth,
      imageHeight
    );
    if (fits) lo = t;
    else hi = t;
  }

  return resizeObbFromCornerDrag(
    x,
    y,
    width,
    height,
    angle,
    corner,
    fx + lo * (px - fx),
    fy + lo * (py - fy),
    minSize
  );
}

export function rotateObbFromPointer(
  x: number,
  y: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number
): ObbGeometry {
  const { cx, cy } = getObbCenter(x, y, width, height);
  const angle = Math.atan2(pointerY - cy, pointerX - cx) + Math.PI / 2;
  return buildObbFromParams(x, y, width, height, angle);
}

/** 刚性平移 OBB，仅在触边时限制位移 */
export function clampObbTranslation(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: x + dx, y: y + dy };
  }

  const corners = getObbCorners(x, y, width, height, angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < corners.length; i += 2) {
    minX = Math.min(minX, corners[i]);
    maxX = Math.max(maxX, corners[i]);
    minY = Math.min(minY, corners[i + 1]);
    maxY = Math.max(maxY, corners[i + 1]);
  }

  const clampedDx = Math.max(-minX, Math.min(dx, imageWidth - maxX));
  const clampedDy = Math.max(-minY, Math.min(dy, imageHeight - maxY));
  return { x: x + clampedDx, y: y + clampedDy };
}

/** 旋转手柄中心在图像坐标中的位置 */
export function getObbRotateHandleImagePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  zoom: number
): { x: number; y: number } {
  const { cx, cy } = getObbCenter(x, y, width, height);
  const offset = getObbRotateHandleOffset(zoom);
  const localDy = -(offset + height / 2);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    x: cx - localDy * sin,
    y: cy + localDy * cos,
  };
}

/** 指针是否落在 OBB 旋转手柄命中区内（与手柄外径一致） */
export function isPointOnObbRotateHandle(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  zoom: number
): boolean {
  const center = getObbRotateHandleImagePosition(x, y, width, height, angle, zoom);
  const { outerRadius } = getObbRotateHandleRadii(zoom, false);
  const dx = px - center.x;
  const dy = py - center.y;
  return dx * dx + dy * dy <= outerRadius * outerRadius;
}

/** 图像坐标 → OBB 局部坐标（左上为原点，y 向上为负） */
export function imagePointToObbLocal(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number
): { lx: number; ly: number } {
  const { cx, cy } = getObbCenter(x, y, width, height);
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return { lx: rx + width / 2, ly: ry + height / 2 };
}

/**
 * 指针是否落在框顶中点 → 旋转手柄的隐形垂向命中带内（不显示，仅用于点击）。
 * 带宽为旋转手柄外径 × OBB_ROTATE_CORRIDOR_HIT_HALF_WIDTH_SCALE。
 */
export function isPointOnObbRotateCorridor(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  zoom: number
): boolean {
  const offset = getObbRotateHandleOffset(zoom);
  if (offset <= 0) return false;

  const { lx, ly } = imagePointToObbLocal(px, py, x, y, width, height, angle);
  const halfWidth = getObbRotateCorridorHitHalfWidth(zoom);
  const left = width / 2 - halfWidth;
  const right = width / 2 + halfWidth;
  const top = -offset;
  const bottom = 0;
  return lx >= left && lx <= right && ly >= top && ly <= bottom;
}

/** 旋转手柄圆盘 + 垂向命中带 */
export function isPointOnObbRotateInteractionZone(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  zoom: number
): boolean {
  return (
    isPointOnObbRotateHandle(px, py, x, y, width, height, angle, zoom) ||
    isPointOnObbRotateCorridor(px, py, x, y, width, height, angle, zoom)
  );
}
