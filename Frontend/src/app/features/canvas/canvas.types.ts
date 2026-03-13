import { CanvasElement, CanvasPageModel } from '../../core/models/canvas.models';

export type SupportedFramework = 'html' | 'react' | 'angular';
export type HandlePosition = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
export type CornerHandle = 'nw' | 'ne' | 'sw' | 'se';
export type EdgeHandle = 'n' | 's' | 'e' | 'w';

export interface FrameTemplateSelection {
  name: string;
  sizeLabel: string;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds extends Point {
  width: number;
  height: number;
}

export interface ResizeState {
  pointerX: number;
  pointerY: number;
  width: number;
  height: number;
  absoluteX: number;
  absoluteY: number;
  centerX: number;
  centerY: number;
  aspectRatio: number;
  elementId: string;
  handle: HandlePosition;
}

export interface RotateState {
  startAngle: number;
  initialRotation: number;
  centerX: number;
  centerY: number;
  elementId: string;
}

export interface CornerRadiusState {
  absoluteX: number;
  absoluteY: number;
  width: number;
  height: number;
  elementId: string;
}

export interface HistorySnapshot {
  pages: CanvasPageModel[];
  currentPageId: string | null;
  selectedElementId: string | null;
}

export interface SnapLine {
  type: 'vertical' | 'horizontal';
  position: number;
}

export interface CanvasClipboardSnapshot {
  rootId: string;
  sourcePageId: string | null;
  pasteCount: number;
  elements: CanvasElement[];
}
