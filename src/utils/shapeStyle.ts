/**
 * 画布方框与标注绘制参数
 */

/** 形状描边线宽 */
export const SHAPE_LINE_WIDTH = 3;

/** 选中/未选中线宽一致（仅改颜色） */
export const SELECTED_STROKE_WIDTH = 3;

/** 顶点绘制尺寸 — draw_vertex: d = point_size / scale */
export const SHAPE_POINT_SIZE = 10;

/** zoom_widget / navigator_widget 范围 1%–1000% → scale 0.01–10 */
export const VIEW_ZOOM_MIN = 0.01;
export const VIEW_ZOOM_MAX = 10;

/** 方框切角目标屏幕像素（放大到最大 zoom 时的视觉大小） */
export const SELECTED_CHAMFER_SIZE = 2;

/**
 * 缩小时切角不超过「方框屏幕短边 × 此比例」，避免 zoom 很小时切角占满方框。
 * 调小 → 缩小时切角更克制；调大 → 允许更明显的切角。范围建议 0.05–0.2。
 */
export const CHAMFER_MAX_BOX_FRACTION = 0.1;

/** canvas.mask.opacity (0-255) */
export const MASK_OPACITY = 80;

/** 拖动角点时 mask 更透明，便于看清框选区域（参考 canvas.py moving_shape 时隐藏 fill） */
export const DRAG_MASK_OPACITY = 35;

/** _update_shape_color → fill_color alpha */
export const FILL_COLOR_ALPHA = 128;

/** _update_shape_color → select_fill_color alpha */
export const SELECT_FILL_COLOR_ALPHA = 155;

/** 选中描边默认白色（侧栏选中不改变画布描边，仅保留常量备查） */
export const SELECT_LINE_COLOR = '#ffffff';

/** _update_shape_color → hvertex_fill_color */
export const HVERTEX_FILL_COLOR = '#ffffff';

/** label_widget 启动时 fill_drawing.trigger()，选中/hover 时 shape.fill=true */
export const FILL_DRAWING_ENABLED = true;

/** 是否显示多边形/矩形填充遮罩 */
export const SHOW_MASKS = true;

/** 多边形绘制中面积预览填充（canvas.py fill_drawing + mask_opacity 白底） */
export const POLYGON_DRAWING_FILL_COLOR = 'rgba(255, 255, 255, 0.31)';

/** 多边形描边连接方式：bevel 避免锐角 miter 尖刺 */
export const POLYGON_LINE_JOIN = 'bevel' as const;

/** shape.py point_type = P_ROUND */
export const VERTEX_POINT_TYPE = 'round' as const;

/** 角点命中区域（屏幕像素，canvas.epsilon 相关，编辑用） */
export const SHAPE_HIT_SIZE = 14;

/** 边框线选中容差（屏幕像素，固定不随 zoom 变化） */
export const BORDER_HIT_SIZE = 10;

/** 关键点/独立点命中区域（屏幕像素，悬停/选中判定） */
export const POINT_HIT_SIZE = 28;

/** 关键点/独立点拖动命中区域（屏幕像素，比选中区更小，避免误拖） */
export const POINT_DRAG_HIT_SIZE = 14;

/** canvas.py ROTATION_HANDLE_DISTANCE / ROTATION_HANDLE_HIT_RADIUS */
export const ROTATION_HANDLE_DISTANCE = 32;
export const ROTATION_HANDLE_HIT_RADIUS = 10;

/** canvas.crosshair */
export const CROSSHAIR_COLOR = '#00ff00';
export const CROSSHAIR_WIDTH = 2;
export const CROSSHAIR_OPACITY = 0.5;

/** 标签绘制 canvas.py show_labels */
export const LABEL_FONT_SIZE = 8;
/** 画布标签屏幕字号（resetTransform 后绘制，不随 zoom 变化） */
export const LABEL_SCREEN_FONT_SIZE = 10;

/**
 * 标签开始跟随画面放大的 zoom 阈值（200% = 2.0）。
 * zoom ≤ 此值：屏幕字号固定；zoom > 此值：随 zoom 同比放大（跟随图片，不跟随边框）。
 */
export const LABEL_ZOOM_CAP = 1.5;
export const LABEL_SCREEN_PADDING = 4;
export const LABEL_SCREEN_PADDING_X = 4;
export const LABEL_SCREEN_PADDING_Y = 2;
export const LABEL_CORNER_RADIUS = 0;
export const LABEL_INSIDE_BG = 'rgba(0, 0, 0, 0.72)';
export const LABEL_INSIDE_TEXT = '#ffffff';
/** Qt QFontMetrics(Arial 8).height() */
export const LABEL_LINE_HEIGHT = 11;
export const LABEL_PADDING_X = 4;
export const LABEL_PADDING_Y = 2;
export const LABEL_FONT_FAMILY = 'Arial, sans-serif';
export const LABEL_TEXT_COLOR = '#000000';

/** label_widget.py LABEL_OPACITY — 侧栏标签列表背景，非画布 overlay */
export const LABEL_LIST_OPACITY = 128;

/** label_widget zoom_request add_zoom */
export const ZOOM_STEP = 1.1;

/** highlight_settings NEAR_VERTEX */
export const HIGHLIGHT_VERTEX_SCALE = 4;

/** highlight_settings MOVE_VERTEX */
export const MOVE_VERTEX_SCALE = 1.5;

/**
 * ── 四角圆点：跟随框线屏幕线宽 ──
 * 以 VIEW_ZOOM_MAX 为基准（此时直径 = SHAPE_POINT_SIZE，最佳匹配）。
 * 其它 zoom：直径 = 线宽 × (SHAPE_POINT_SIZE / 最大zoom线宽) × VERTEX_LINE_MATCH_SCALE
 *
 * VERTEX_LINE_MATCH_SCALE：相对线宽的倍率微调（1 = 与线宽同比）
 * VERTEX_MIN_SCREEN_DIAMETER：屏幕像素下限，防止过小难点中
 */
export const VERTEX_LINE_MATCH_SCALE = 1.5;
export const VERTEX_MIN_SCREEN_DIAMETER = 5;

/**
 * ── 角点手柄 + 选中白线（视觉模型）──
 *
 * 1. 角点手柄：实心白色圆
 * 2. 选中白线：与边框同路径、同线宽，叠在彩色描边之上
 */

/** 手柄外径倍率（相对顶点基准直径） */
export const HANDLE_SIZE_SCALE = 1.2;

/**
 * OBB 中心白点半径 ÷ 手柄外圈半径（0~1）。
 * 缩放与手柄相同：getVertexSizeScreen(zoom) × HANDLE_SIZE_SCALE。
 */
export const OBB_CENTER_DOT_RADIUS_RATIO = 0.6;

/**
 * ── OBB 旋转手柄（独立于角点手柄）──
 * 中心镂空 → 白环 → 黑环；缩放基于 getHandleOuterRadiusImage。
 */
/** 旋转手柄外径 ÷ 角点手柄外径 */
export const OBB_ROTATE_HANDLE_SIZE_SCALE = 1.15;

/** 中心镂空半径 ÷ 旋转手柄外径（中间留空） */
export const OBB_ROTATE_HANDLE_HOLE_RADIUS_RATIO = 0.38;

/** 白环外缘半径 ÷ 旋转手柄外径（白环在镂空与此外缘之间） */
export const OBB_ROTATE_HANDLE_WHITE_OUTER_RATIO = 0.72;

/** 悬停/拖动时旋转手柄整体缩放 */
export const OBB_ROTATE_HANDLE_HOVER_SCALE = 1.2;

/** 垂向命中带半宽 ÷ 旋转手柄外径（>1 比手柄圆盘更宽，便于沿“垂线”点击） */
export const OBB_ROTATE_CORRIDOR_HIT_HALF_WIDTH_SCALE = 2;

/** OBB 旋转手柄中心相对框顶边中点的上移距离（图像坐标） */
export function getObbRotateHandleOffset(zoom: number): number {
  const handleVertexSize = getVertexSizeScreen(zoom, false, false) * HANDLE_SIZE_SCALE;
  return handleVertexSize * 0.9 + imageSizeForZoom(10, zoom);
}

/**
 * 手柄悬停/拖动时完整白圆的缩放（相对基准外径），有确认感且不过大。
 */
export const VERTEX_HOVER_SCALE = 1.5;

export interface ShapeColors {
  lineColor: string;
  fillColor: string;
  selectFillColor: string;
  strokeColor: string;
  maskFillColor: string;
  vertexFillColor: string;
  hvertexFillColor: string;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
}

/**
 * label_widget._update_shape_color 等价
 * line_color / vertex_fill_color = 标签 RGB
 * fill_color = 标签 RGB alpha 128
 * select_line_color = 白
 * select_fill_color = 标签 RGB alpha 155
 * hvertex_fill_color = 白
 */
export function applyShapeColors(
  labelColor: string,
  isSelected: boolean,
  isResizing = false
): ShapeColors {
  const fillColor = colorWithAlpha(labelColor, FILL_COLOR_ALPHA);
  const selectFillColor = colorWithAlpha(labelColor, SELECT_FILL_COLOR_ALPHA);

  // 画布方框始终保持标签色描边/遮罩（侧栏选中不改变方框颜色）
  const maskAlpha = isResizing ? DRAG_MASK_OPACITY : MASK_OPACITY;
  const maskFillColor = colorWithAlpha(labelColor, maskAlpha);
  const strokeColor = labelColor;

  return {
    lineColor: labelColor,
    fillColor,
    selectFillColor,
    strokeColor,
    maskFillColor,
    vertexFillColor: labelColor,
    hvertexFillColor: HVERTEX_FILL_COLOR,
  };
}

/**
 * shape.py: pen.setWidth(max(1, int(round(line_width / scale))))
 * Stage scale(zoom) 下图像坐标线宽；屏幕视觉 ≈ max(zoom, line_width) px
 * zoom ≤ line_width/scale 时恒为 line_width；超过后继续随 zoom 变粗
 */
export function getShapeStrokeWidthImage(
  zoom: number,
  lineWidth = SHAPE_LINE_WIDTH
): number {
  const safeZoom = Math.max(zoom, 1e-6);
  return Math.max(1, Math.round(lineWidth / safeZoom));
}

/** 线宽在屏幕上的近似像素（= getShapeStrokeWidthImage * zoom） */
export function getShapeStrokeWidthScreenPixels(
  zoom: number,
  lineWidth = SHAPE_LINE_WIDTH
): number {
  return getShapeStrokeWidthImage(zoom, lineWidth) * Math.max(zoom, 1e-6);
}

export function getStrokeWidthScreen(isSelected = false, zoom = 1): number {
  return getShapeStrokeWidthImage(
    zoom,
    isSelected ? SELECTED_STROKE_WIDTH : SHAPE_LINE_WIDTH
  );
}

/** 切角在图像坐标下的最大长度（屏幕像素恒定 + 缩小视图比例上限 + 不超过边长 1/4） */
export function getMaxChamferImage(
  zoom: number,
  boundsWidth: number,
  boundsHeight: number
): number {
  const safeZoom = Math.max(zoom, 1e-6);
  const fromFixedScreen = imageSizeForZoom(SELECTED_CHAMFER_SIZE, safeZoom);
  const screenShortSide = Math.min(boundsWidth, boundsHeight) * safeZoom;
  const cappedScreenChamfer = Math.min(
    SELECTED_CHAMFER_SIZE,
    screenShortSide * CHAMFER_MAX_BOX_FRACTION
  );
  const fromScreenBox = imageSizeForZoom(cappedScreenChamfer, safeZoom);
  const fromBoxGeometry = Math.min(boundsWidth / 4, boundsHeight / 4);
  return Math.min(fromFixedScreen, fromScreenBox, fromBoxGeometry);
}

/** 方框切角：image 坐标长度 */
export function getChamferSize(width: number, height: number, zoom: number): number {
  return getMaxChamferImage(zoom, width, height);
}

/** 直角或切角轮廓点 [x1,y1,...] */
export function getBoxOutlinePoints(
  width: number,
  height: number,
  chamfer: number,
  useChamfer: boolean
): number[] {
  if (!useChamfer || chamfer <= 0) {
    return [0, 0, width, 0, width, height, 0, height];
  }
  const c = Math.min(chamfer, width / 4, height / 4);
  return [
    c, 0,
    width - c, 0,
    width, c,
    width, height - c,
    width - c, height,
    c, height,
    0, height - c,
    0, c,
  ];
}

function dist2d(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** 多边形轮廓切角：仅对凸顶点切角，凹（反射）顶点保持尖角，避免描边拐进内侧 */
export function getPolygonChamferOutlinePoints(points: number[], zoom: number): number[] {
  const n = points.length / 2;
  if (n < 3) return [...points];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, points[i * 2]);
    maxX = Math.max(maxX, points[i * 2]);
    minY = Math.min(minY, points[i * 2 + 1]);
    maxY = Math.max(maxY, points[i * 2 + 1]);
  }
  const maxChamfer = getMaxChamferImage(zoom, maxX - minX, maxY - minY);
  // y 向下时鞋带面积 ≥ 0 表示顺时针；顺时针凸顶点叉积 > 0
  const clockwise = getPolygonSignedArea(points) >= 0;
  const outline: number[] = [];

  for (let i = 0; i < n; i++) {
    const cx = points[i * 2];
    const cy = points[i * 2 + 1];
    const px = points[((i - 1 + n) % n) * 2];
    const py = points[((i - 1 + n) % n) * 2 + 1];
    const nx = points[((i + 1) % n) * 2];
    const ny = points[((i + 1) % n) * 2 + 1];

    const inLen = dist2d(px, py, cx, cy);
    const outLen = dist2d(nx, ny, cx, cy);
    const cross = (cx - px) * (ny - cy) - (cy - py) * (nx - cx);
    const isConvex = clockwise ? cross > 1e-6 : cross < -1e-6;
    const chamfer = Math.min(maxChamfer, inLen / 4, outLen / 4);

    if (!isConvex || chamfer <= 0.1 || inLen <= 0 || outLen <= 0) {
      outline.push(cx, cy);
      continue;
    }

    outline.push(
      cx + ((px - cx) / inLen) * chamfer,
      cy + ((py - cy) / inLen) * chamfer,
      cx + ((nx - cx) / outLen) * chamfer,
      cy + ((ny - cy) / outLen) * chamfer
    );
  }
  return outline;
}

/** 多边形闭合提示：屏幕像素命中半径（仅视觉提示） */
export const POLYGON_CLOSE_THRESHOLD_SCREEN = 12;
/** 点击闭合：更小的命中半径，避免连续打点误闭合 */
export const POLYGON_CLOSE_CLICK_THRESHOLD_SCREEN = 10;
/** 双击闭合：两次点击的最大间隔（毫秒） */
export const POLYGON_DBLCLICK_INTERVAL_MS = 450;
/** 双击闭合：两次点击的最大屏幕距离（像素） */
export const POLYGON_DBLCLICK_DISTANCE_SCREEN = 10;
/** 返回原点闭合时的提示圆放大倍数 */
export const POLYGON_CLOSE_HINT_SCALE = 1.25;

export function getPolygonCloseThresholdImage(zoom: number): number {
  return imageSizeForZoom(POLYGON_CLOSE_THRESHOLD_SCREEN, zoom);
}

export function getPolygonCloseClickThresholdImage(zoom: number): number {
  return imageSizeForZoom(POLYGON_CLOSE_CLICK_THRESHOLD_SCREEN, zoom);
}

export function getPolygonDblClickDistanceImage(zoom: number): number {
  return imageSizeForZoom(POLYGON_DBLCLICK_DISTANCE_SCREEN, zoom);
}

/** 角点屏幕直径：随框线线宽变化，最大 zoom 时 = SHAPE_POINT_SIZE */
export function getVertexScreenDiameter(
  zoom: number,
  baseDiameter = SHAPE_POINT_SIZE
): number {
  const lineScreenPx = getShapeStrokeWidthScreenPixels(zoom, SHAPE_LINE_WIDTH);
  const refLineAtMaxZoom = getShapeStrokeWidthScreenPixels(VIEW_ZOOM_MAX, SHAPE_LINE_WIDTH);
  const calibratedRatio = (baseDiameter / refLineAtMaxZoom) * VERTEX_LINE_MATCH_SCALE;
  return Math.max(VERTEX_MIN_SCREEN_DIAMETER, lineScreenPx * calibratedRatio);
}

/** shape.py draw_vertex: d = point_size / scale（图像坐标直径） */
export function getVertexSizeScreen(zoom: number, highlighted = false, moving = false): number {
  let screenDiameter = getVertexScreenDiameter(zoom);
  if (moving) screenDiameter *= MOVE_VERTEX_SCALE;
  else if (highlighted) screenDiameter *= HIGHLIGHT_VERTEX_SCALE;
  return imageSizeForZoom(screenDiameter, zoom);
}

/** 手柄外圈半径（图像坐标） */
export function getHandleOuterRadiusImage(zoom: number, highlighted = false): number {
  return (getVertexSizeScreen(zoom, highlighted, false) * HANDLE_SIZE_SCALE) / 2;
}

/**
 * 关键点圆点半径（图像坐标）：默认=手柄外径；悬停/拖动=手柄强调外径。
 */
export function getKeypointDotRadiusImage(zoom: number, emphasized = false): number {
  const outerRadius = getHandleOuterRadiusImage(zoom);
  return emphasized ? outerRadius * VERTEX_HOVER_SCALE : outerRadius;
}

/** OBB 中心白点半径（图像坐标） */
export function getObbCenterDotRadius(zoom: number): number {
  return getHandleOuterRadiusImage(zoom) * OBB_CENTER_DOT_RADIUS_RATIO;
}

export interface ObRotateHandleRadii {
  outerRadius: number;
  holeRadius: number;
  whiteOuterRadius: number;
}

/** OBB 旋转手柄各层半径（图像坐标） */
export function getObbRotateHandleRadii(
  zoom: number,
  emphasized = false
): ObRotateHandleRadii {
  let outerRadius = getHandleOuterRadiusImage(zoom) * OBB_ROTATE_HANDLE_SIZE_SCALE;
  if (emphasized) {
    outerRadius *= OBB_ROTATE_HANDLE_HOVER_SCALE;
  }
  return {
    outerRadius,
    holeRadius: outerRadius * OBB_ROTATE_HANDLE_HOLE_RADIUS_RATIO,
    whiteOuterRadius: outerRadius * OBB_ROTATE_HANDLE_WHITE_OUTER_RATIO,
  };
}

/** 框顶 → 手柄垂向命中带半宽（图像坐标）；手柄圆盘半径仍用 outerRadius */
export function getObbRotateCorridorHitHalfWidth(zoom: number): number {
  const { outerRadius } = getObbRotateHandleRadii(zoom, false);
  return outerRadius * OBB_ROTATE_CORRIDOR_HIT_HALF_WIDTH_SCALE;
}

/** 鞋带公式有符号面积；屏幕坐标 y 向下时，顺时针多边形 > 0 */
export function getPolygonSignedArea(points: number[]): number {
  const n = points.length / 2;
  if (n < 3) return 0;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    sum += points[k * 2] * points[j * 2 + 1] - points[j * 2] * points[k * 2 + 1];
  }
  return sum / 2;
}

export function imageSizeForZoom(screenPixels: number, zoom: number): number {
  return screenPixels / Math.max(zoom, 1e-6);
}

/** 关键点/独立点选中命中半径（图像坐标，悬停/多选判定） */
export function getPointHitRadiusImage(zoom: number): number {
  return imageSizeForZoom(POINT_HIT_SIZE, zoom) / 2;
}

/** 关键点/独立点拖动命中半径（图像坐标，与 dragHitRect 一致） */
export function getPointDragHitRadiusImage(zoom: number): number {
  return imageSizeForZoom(POINT_DRAG_HIT_SIZE, zoom) / 2;
}

/**
 * 画布标签目标屏幕字号（px）。
 * - zoom ≤ 200%：固定 LABEL_SCREEN_FONT_SIZE（放大过程中标签不变）
 * - zoom > 200%：随 zoom 同比放大（跟随图片，不跟随边框线宽）
 */
export function getLabelScreenFontSize(zoom: number): number {
  const safeZoom = Math.max(zoom, 1e-6);

  if (safeZoom <= LABEL_ZOOM_CAP) {
    return LABEL_SCREEN_FONT_SIZE;
  }

  return LABEL_SCREEN_FONT_SIZE * (safeZoom / LABEL_ZOOM_CAP);
}

/**
 * 画布标签反缩放系数（Konva：localFont × inverseScale × stageZoom = 屏幕字号）。
 */
export function getScreenSpaceLabelInverseScale(zoom: number): number {
  const safeZoom = Math.max(zoom, 1e-6);
  const targetScreen = getLabelScreenFontSize(zoom);
  return targetScreen / (LABEL_SCREEN_FONT_SIZE * safeZoom);
}

let labelMeasureCanvas: HTMLCanvasElement | null = null;

/** canvas.py: fm.tightBoundingRect + padding_x * 2 */
export function measureLabelTextWidth(
  labelName: string,
  fontSize = LABEL_SCREEN_FONT_SIZE,
  fontFamily = LABEL_FONT_FAMILY
): number {
  if (typeof document !== 'undefined') {
    labelMeasureCanvas ??= document.createElement('canvas');
    const ctx = labelMeasureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = `${fontSize}px ${fontFamily}`;
      return Math.ceil(ctx.measureText(labelName).width);
    }
  }
  return estimateLabelTextWidth(labelName, fontSize);
}

export function estimateLabelTextWidth(
  labelName: string,
  fontSize = LABEL_FONT_SIZE
): number {
  let textWidth = 0;
  for (const ch of labelName) {
    const code = ch.codePointAt(0) ?? 0;
    textWidth += code > 0xff ? fontSize : fontSize * 0.55;
  }
  return Math.ceil(textWidth);
}

export function estimateLabelBgWidth(
  labelName: string,
  fontSize = LABEL_FONT_SIZE,
  paddingX = LABEL_PADDING_X
): number {
  return measureLabelTextWidth(labelName, fontSize) + paddingX * 2;
}

/** canvas.py: fm.height() + padding_y * 2 */
export function getLabelBgHeight(
  fontSize = LABEL_FONT_SIZE,
  paddingY = LABEL_PADDING_Y
): number {
  const lineHeight =
    fontSize <= LABEL_FONT_SIZE ? LABEL_LINE_HEIGHT : Math.ceil(fontSize * 1.25);
  return lineHeight + paddingY * 2;
}

export function getLabelScreenBgSize(labelName: string): { width: number; height: number } {
  return {
    width: measureLabelTextWidth(labelName, LABEL_SCREEN_FONT_SIZE) + LABEL_SCREEN_PADDING_X * 2,
    height: getLabelBgHeight(LABEL_SCREEN_FONT_SIZE, LABEL_SCREEN_PADDING_Y),
  };
}

/** 侧栏标签背景：标签色 + LABEL_OPACITY（unique_label_qlist_widget） */
export function labelColorWithListOpacity(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${LABEL_LIST_OPACITY / 255})`;
}
