import { Component, input, output } from '@angular/core';
import { CanvasElementType } from '@app/core';

type ToolbarTool = CanvasElementType | 'select';

interface ToolbarAction {
  tool: ToolbarTool;
  label: string;
  shortcut: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  readonly activeTool = input<ToolbarTool>('select');
  readonly zoomLevel = input(100);

  readonly toolSelected = output<ToolbarTool>();
  readonly zoomInRequested = output<void>();
  readonly zoomOutRequested = output<void>();
  readonly zoomResetRequested = output<void>();

  readonly actions: ToolbarAction[] = [
    { tool: 'select', label: 'Select', shortcut: 'V' },
    { tool: 'frame', label: 'Page', shortcut: 'P' },
    { tool: 'rectangle', label: 'Rectangle', shortcut: 'R' },
    { tool: 'text', label: 'Text', shortcut: 'T' },
    { tool: 'image', label: 'Image', shortcut: 'I' },
  ];

  onToolSelect(tool: ToolbarTool): void {
    this.toolSelected.emit(tool);
  }

  trackByTool(_: number, action: ToolbarAction): string {
    return action.tool;
  }
}
