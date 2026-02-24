import { Component, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasElement, CanvasElementType } from '../../core/models/canvas.models';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [CommonModule, HeaderBarComponent],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class ProjectPage {
  elements = signal<CanvasElement[]>([]);
  selectedElementId = signal<string | null>(null);
  currentTool = signal<CanvasElementType | 'select'>('select');

  isDragging = signal(false);
  dragOffset = { x: 0, y: 0 };

  selectTool(tool: CanvasElementType | 'select') {
    this.currentTool.set(tool);
    if (tool !== 'select') {
      this.selectedElementId.set(null);
    }
  }

  onCanvasClick(event: MouseEvent) {
    const tool = this.currentTool();
    if (tool === 'select') {
      // If we clicked directly on the canvas (not an element), deselect
      if ((event.target as HTMLElement).classList.contains('canvas-container')) {
        this.selectedElementId.set(null);
      }
      return;
    }

    // Create new element
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const newElement: CanvasElement = {
      id: crypto.randomUUID(),
      type: tool,
      x,
      y,
      width: tool === 'text' ? 150 : 100,
      height: tool === 'text' ? 40 : 100,
      fill: tool === 'frame' ? '#ffffff' : '#e0e0e0',
      text: tool === 'text' ? 'Text nou' : undefined,
      fontSize: tool === 'text' ? 16 : undefined,
    };

    this.elements.update((els) => [...els, newElement]);
    this.selectedElementId.set(newElement.id);
    this.currentTool.set('select'); // Revert to select tool after creation
  }

  onElementPointerDown(event: MouseEvent, id: string) {
    event.stopPropagation();
    this.selectedElementId.set(id);
    this.currentTool.set('select');

    const el = this.elements().find((e) => e.id === id);
    if (el) {
      this.isDragging.set(true);
      this.dragOffset = {
        x: event.clientX - el.x,
        y: event.clientY - el.y,
      };
    }
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent) {
    if (!this.isDragging()) return;

    const selectedId = this.selectedElementId();
    if (selectedId) {
      this.elements.update((els) =>
        els.map((el) => {
          if (el.id === selectedId) {
            return {
              ...el,
              x: event.clientX - this.dragOffset.x,
              y: event.clientY - this.dragOffset.y,
            };
          }
          return el;
        }),
      );
    }
  }

  @HostListener('window:pointerup')
  onPointerUp() {
    this.isDragging.set(false);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    // Tool shortcuts
    if (event.key.toLowerCase() === 'v') this.selectTool('select');
    if (event.key.toLowerCase() === 'f') this.selectTool('frame');
    if (event.key.toLowerCase() === 'r') this.selectTool('rectangle');
    if (event.key.toLowerCase() === 'o') this.selectTool('circle');
    if (event.key.toLowerCase() === 't') this.selectTool('text');

    // Delete selected element
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedId = this.selectedElementId();
      if (selectedId) {
        this.elements.update((els) => els.filter((e) => e.id !== selectedId));
        this.selectedElementId.set(null);
      }
    }
  }
}
