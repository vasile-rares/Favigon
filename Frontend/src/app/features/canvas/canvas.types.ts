import { CanvasElement, CanvasPageModel, CanvasPageViewportPreset } from '@app/core';

export type SupportedFramework = 'html' | 'react' | 'angular';
export type HandlePosition = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
export type CornerHandle = 'nw' | 'ne' | 'sw' | 'se';
export type EdgeHandle = 'n' | 's' | 'e' | 'w';
export type DeviceFramePreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

export interface ViewportPresetOption {
  id: CanvasPageViewportPreset;
  label: string;
  width: number;
  height: number;
}

export interface PageCanvasLayout {
  pageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageDragState {
  pageId: string;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
}

export const VIEWPORT_PRESET_OPTIONS: ViewportPresetOption[] = [
  { id: 'desktop', label: 'Desktop', width: 1280, height: 720 },
  { id: 'tablet', label: 'Tablet', width: 800, height: 1100 },
  { id: 'mobile', label: 'Mobile', width: 375, height: 812 },
];

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
  selectedElementIds: string[];
}

export interface SnapLine {
  type: 'vertical' | 'horizontal';
  position: number;
}

export interface CanvasClipboardSnapshot {
  rootIds: string[];
  sourcePageId: string | null;
  pasteCount: number;
  elements: CanvasElement[];
}

export interface CanvasClipboardPasteResult {
  elements: CanvasElement[];
  rootIds: string[];
}
