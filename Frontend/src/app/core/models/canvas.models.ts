import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'text' | 'image';
export type CanvasTextAlign = 'left' | 'center' | 'right' | 'justify';
export type CanvasTextVerticalAlign = 'top' | 'middle' | 'bottom';
export type CanvasFontStyle = 'normal' | 'italic';
export type CanvasFontSizeUnit = 'px' | 'rem';
export type CanvasTextSpacingUnit = 'px' | 'em';
export type CanvasOverflowMode = 'clip' | 'visible';
export type CanvasShadowPreset = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type CanvasShadow = string;
export type CanvasPageViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';
export type CanvasLinkType = 'page' | 'url';
export type CanvasSizeMode = 'fixed' | 'relative' | 'fill' | 'fit-content' | 'viewport';
export type CanvasConstraintSizeMode = 'fixed' | 'relative';
export type CanvasSemanticTag =
  | 'a'
  | 'article'
  | 'aside'
  | 'div'
  | 'footer'
  | 'header'
  | 'img'
  | 'label'
  | 'main'
  | 'nav'
  | 'p'
  | 'section'
  | 'span';
export type CanvasRotationMode = '2d' | '3d';
export type CanvasBackfaceVisibility = 'visible' | 'hidden';
export type CanvasTransformOption =
  | 'scale'
  | 'rotate'
  | 'skew'
  | 'depth'
  | 'perspective'
  | 'origin'
  | 'backface'
  | 'preserve3d';

export type CanvasDisplayMode = 'block' | 'flex' | 'grid';
export type CanvasPositionMode = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
export type CanvasFlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type CanvasFlexWrap = 'nowrap' | 'wrap';
export type CanvasJustifyContent =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
export type CanvasAlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';

export interface CanvasSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface CanvasElementIrMeta {
  type?: string;
  props?: Record<string, unknown>;
  style?: IRStyle;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  name?: string;
  x: number;
  y: number;
  width: number;
  widthMode?: CanvasSizeMode;
  widthSizingValue?: number;
  minWidth?: number;
  minWidthMode?: CanvasConstraintSizeMode;
  minWidthSizingValue?: number;
  maxWidth?: number;
  maxWidthMode?: CanvasConstraintSizeMode;
  maxWidthSizingValue?: number;
  height: number;
  heightMode?: CanvasSizeMode;
  heightSizingValue?: number;
  minHeight?: number;
  minHeightMode?: CanvasConstraintSizeMode;
  minHeightSizingValue?: number;
  maxHeight?: number;
  maxHeightMode?: CanvasConstraintSizeMode;
  maxHeightSizingValue?: number;
  rotation?: number;
  rotationMode?: CanvasRotationMode;
  scaleX?: number;
  scaleY?: number;
  skewX?: number;
  skewY?: number;
  depth?: number;
  perspective?: number;
  transformOriginX?: number;
  transformOriginY?: number;
  backfaceVisibility?: CanvasBackfaceVisibility;
  preserve3D?: boolean;
  transformOptions?: CanvasTransformOption[];
  visible?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  cornerRadius?: number;
  cornerRadii?: CanvasCornerRadii;
  overflow?: CanvasOverflowMode;
  shadow?: CanvasShadow;
  text?: string;
  fontSize?: number;
  fontSizeUnit?: CanvasFontSizeUnit;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: CanvasFontStyle;
  textAlign?: CanvasTextAlign;
  textVerticalAlign?: CanvasTextVerticalAlign;
  letterSpacing?: number;
  letterSpacingUnit?: CanvasTextSpacingUnit;
  lineHeight?: number;
  lineHeightUnit?: CanvasTextSpacingUnit;
  imageUrl?: string;
  linkType?: CanvasLinkType;
  linkPageId?: string | null;
  linkUrl?: string;
  tag?: CanvasSemanticTag;
  ariaLabel?: string;
  // Layout (frame + rectangle)
  display?: CanvasDisplayMode;
  flexDirection?: CanvasFlexDirection;
  flexWrap?: CanvasFlexWrap;
  justifyContent?: CanvasJustifyContent;
  alignItems?: CanvasAlignItems;
  gap?: number;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  padding?: CanvasSpacing;
  // Position (not for frame)
  position?: CanvasPositionMode;
  margin?: CanvasSpacing;
  parentId?: string | null;
  isPrimary?: boolean;
  primarySyncId?: string;
  irMeta?: CanvasElementIrMeta;
}

export interface CanvasPageModel {
  id: string;
  name: string;
  viewportPreset?: CanvasPageViewportPreset;
  viewportWidth?: number;
  viewportHeight?: number;
  canvasX?: number;
  canvasY?: number;
  elements: CanvasElement[];
}

export interface CanvasProjectDocument {
  version: string;
  projectId: string;
  activePageId: string | null;
  pages: CanvasPageModel[];
}
