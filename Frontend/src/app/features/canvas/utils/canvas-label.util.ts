import { CanvasElementType } from '../../../core/models/canvas.models';

export function formatCanvasElementTypeLabel(type: CanvasElementType): string {
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}
