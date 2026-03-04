import { IRStyle } from './ir.models';

export type CanvasElementType = 'frame' | 'rectangle' | 'circle' | 'text' | 'image';

export interface CanvasElementIrMeta {
  type?: string;
  props?: Record<string, unknown>;
  style?: IRStyle;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  parentId?: string | null;
  irMeta?: CanvasElementIrMeta;
}
