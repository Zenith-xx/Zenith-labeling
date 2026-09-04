import Konva from 'konva';
import { formatCanvasLabel } from '../../../utils/annotationDisplay';
import {
  getHandleOuterRadiusImage,
  getLabelScreenBgSize,
  getObbRotateHandleRadii,
  getScreenSpaceLabelInverseScale,
  getStrokeWidthScreen,
  imageSizeForZoom,
  LABEL_FONT_FAMILY,
  LABEL_SCREEN_FONT_SIZE,
  LABEL_TEXT_COLOR,
  SHAPE_POINT_SIZE,
  VERTEX_HOVER_SCALE,
} from '../../../utils/shapeStyle';

export type BoxCornerKey = 'tl' | 'tr' | 'br' | 'bl';

const HANDLE_PROPS = {
  strokeScaleEnabled: false,
  perfectDrawEnabled: false,
  listening: false,
};

export interface LabelSyncOptions {
  labelName: string;
  groupId?: number;
  color: string;
  zoom: number;
  showLabels: boolean;
  x?: number;
  y?: number;
}

export interface LabelNodes {
  group: Konva.Group;
  bg: Konva.Rect;
  text: Konva.Text;
}

export function ensureLabelNodes(
  parent: Konva.Group,
  existing: LabelNodes | null
): LabelNodes {
  if (existing) return existing;

  const group = new Konva.Group({ listening: false });
  const bg = new Konva.Rect({ perfectDrawEnabled: false, listening: false });
  const text = new Konva.Text({
    fontSize: LABEL_SCREEN_FONT_SIZE,
    fontFamily: LABEL_FONT_FAMILY,
    fontStyle: 'normal',
    fill: LABEL_TEXT_COLOR,
    align: 'center',
    verticalAlign: 'middle',
    wrap: 'none',
    perfectDrawEnabled: true,
    listening: false,
  });
  group.add(bg);
  group.add(text);
  parent.add(group);
  return { group, bg, text };
}

export function syncAnnotationLabel(
  parent: Konva.Group,
  nodes: LabelNodes | null,
  options: LabelSyncOptions
): LabelNodes | null {
  if (!options.showLabels) {
    nodes?.group.visible(false);
    return nodes;
  }

  const labelNodes = ensureLabelNodes(parent, nodes);
  const screenScale = getScreenSpaceLabelInverseScale(options.zoom);
  const displayText =
    options.groupId != null
      ? formatCanvasLabel(options.groupId, options.labelName)
      : options.labelName;
  const { width: bgWidth, height: bgHeight } = getLabelScreenBgSize(displayText);

  labelNodes.group.visible(true);
  if (options.x !== undefined) labelNodes.group.x(options.x);
  if (options.y !== undefined) labelNodes.group.y(options.y);
  labelNodes.group.scaleX(screenScale);
  labelNodes.group.scaleY(screenScale);
  labelNodes.bg.width(bgWidth);
  labelNodes.bg.height(bgHeight);
  labelNodes.bg.fill(options.color);
  labelNodes.text.width(bgWidth);
  labelNodes.text.height(bgHeight);
  labelNodes.text.text(displayText);
  return labelNodes;
}

export interface VertexHandleOptions {
  zoom: number;
  emphasized?: boolean;
}

export function renderVertexHandle(parent: Konva.Group, options: VertexHandleOptions): void {
  parent.destroyChildren();

  const outerRadius = getHandleOuterRadiusImage(options.zoom);
  const radius = options.emphasized ? outerRadius * VERTEX_HOVER_SCALE : outerRadius;
  parent.add(
    new Konva.Circle({
      radius,
      fill: '#ffffff',
      ...HANDLE_PROPS,
    })
  );
}

export function renderRotateHandle(
  parent: Konva.Group,
  zoom: number,
  emphasized = false
): void {
  parent.destroyChildren();
  const { outerRadius, holeRadius, whiteOuterRadius } = getObbRotateHandleRadii(zoom, emphasized);
  parent.add(
    new Konva.Arc({
      innerRadius: holeRadius,
      outerRadius: whiteOuterRadius,
      angle: 360,
      rotation: 0,
      fill: '#ffffff',
      ...HANDLE_PROPS,
    })
  );
  parent.add(
    new Konva.Arc({
      innerRadius: whiteOuterRadius,
      outerRadius,
      angle: 360,
      rotation: 0,
      fill: '#000000',
      ...HANDLE_PROPS,
    })
  );
}

export interface PoseKeypointMarkerOptions {
  zoom: number;
  color: string;
  name?: string;
  groupId?: number;
  isSelected?: boolean;
  showLabel?: boolean;
}

export function renderPoseKeypointMarker(
  parent: Konva.Group,
  options: PoseKeypointMarkerOptions
): void {
  parent.destroyChildren();
  const outerRadius = getHandleOuterRadiusImage(options.zoom);
  if (options.isSelected) {
    renderVertexHandle(parent, { zoom: options.zoom, emphasized: false });
  } else {
    parent.add(
      new Konva.Circle({
        radius: outerRadius,
        fill: options.color,
        perfectDrawEnabled: false,
        listening: false,
      })
    );
  }

  if (!options.showLabel || !options.name) return;

  const screenScale = getScreenSpaceLabelInverseScale(options.zoom);
  const labelText = options.name;
  const displayText =
    options.groupId != null ? formatCanvasLabel(options.groupId, labelText) : labelText;
  const labelBgHeight = getLabelScreenBgSize(displayText).height;

  const labelGroup = new Konva.Group({
    x: outerRadius + imageSizeForZoom(SHAPE_POINT_SIZE, options.zoom),
    y: -(labelBgHeight * screenScale) / 2,
    listening: false,
  });
  syncAnnotationLabel(labelGroup, null, {
    labelName: options.name,
    groupId: options.groupId,
    color: options.color,
    zoom: options.zoom,
    showLabels: true,
  });
  parent.add(labelGroup);
}

/** 选中时在边框上叠加完整白色描边（与主线同路径、同线宽） */
export function syncOuterHighlightLines(
  highlightGroup: Konva.Group,
  highlightLines: Konva.Line[],
  points: number[],
  closed: boolean,
  zoom: number,
  isSelected: boolean
): Konva.Line[] {
  if (!isSelected || points.length < 4) {
    for (const line of highlightLines) line.visible(false);
    return highlightLines;
  }

  const strokeWidth = getStrokeWidthScreen(isSelected, zoom);

  if (highlightLines.length === 0) {
    const line = new Konva.Line({
      closed,
      stroke: '#ffffff',
      lineJoin: 'round',
      lineCap: 'round',
      perfectDrawEnabled: false,
      fill: 'transparent',
      listening: false,
    });
    highlightGroup.add(line);
    highlightLines.push(line);
  }

  const line = highlightLines[0];
  line.points(points);
  line.closed(closed);
  line.strokeWidth(strokeWidth);
  line.visible(true);

  for (let i = 1; i < highlightLines.length; i++) {
    highlightLines[i].visible(false);
  }

  return highlightLines;
}

export function applyObbGroupTransform(
  group: Konva.Group,
  x: number,
  y: number,
  width: number,
  height: number,
  angleRad: number
): void {
  const cx = x + width / 2;
  const cy = y + height / 2;
  group.position({ x: cx, y: cy });
  group.offset({ x: width / 2, y: height / 2 });
  group.rotation((angleRad * 180) / Math.PI);
}
