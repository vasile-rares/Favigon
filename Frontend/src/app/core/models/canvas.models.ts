import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'circle' | 'text' | 'image';
export type CanvasStrokePosition = 'inside' | 'outside';

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
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokePosition?: CanvasStrokePosition;
  opacity?: number;
  cornerRadius?: number;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  parentId?: string | null;
  irMeta?: CanvasElementIrMeta;
}
