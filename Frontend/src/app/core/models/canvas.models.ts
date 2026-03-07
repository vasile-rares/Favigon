import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'circle' | 'text' | 'image';
export type CanvasStrokePosition = 'inside' | 'outside';
export type CanvasTextAlign = 'left' | 'center' | 'right';
export type CanvasTextVerticalAlign = 'top' | 'middle' | 'bottom';
export type CanvasFontStyle = 'normal' | 'italic';

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
  visible?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokePosition?: CanvasStrokePosition;
  opacity?: number;
  cornerRadius?: number;
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
  irMeta?: CanvasElementIrMeta;
}

export interface CanvasPageModel {
  id: string;
  name: string;
  elements: CanvasElement[];
}

export interface CanvasProjectDocument {
  version: string;
  projectId: string;
  activePageId: string | null;
  pages: CanvasPageModel[];
}
