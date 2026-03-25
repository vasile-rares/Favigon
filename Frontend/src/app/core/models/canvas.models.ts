import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'text' | 'image';
export type CanvasTextAlign = 'left' | 'center' | 'right';
export type CanvasTextVerticalAlign = 'top' | 'middle' | 'bottom';
export type CanvasFontStyle = 'normal' | 'italic';
export type CanvasOverflowMode = 'clip' | 'visible';
export type CanvasShadowPreset = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type CanvasPageViewportPreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

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
  height: number;
  rotation?: number;
  visible?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  cornerRadius?: number;
  overflow?: CanvasOverflowMode;
  shadow?: CanvasShadowPreset;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: CanvasFontStyle;
  textAlign?: CanvasTextAlign;
  textVerticalAlign?: CanvasTextVerticalAlign;
  letterSpacing?: number;
  lineHeight?: number;
  imageUrl?: string;
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
