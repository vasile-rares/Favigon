import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CanvasElementType } from '../../../../core/models/canvas.models';

type ToolbarTool = CanvasElementType | 'select';

interface ToolbarAction {
  tool: ToolbarTool;
  label: string;
  shortcut: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  @Input() activeTool: ToolbarTool = 'select';

  @Output() toolSelected = new EventEmitter<ToolbarTool>();

  readonly actions: ToolbarAction[] = [
    { tool: 'select', label: 'Select', shortcut: 'V' },
    { tool: 'frame', label: 'Frame', shortcut: 'F' },
    { tool: 'rectangle', label: 'Rectangle', shortcut: 'R' },
    { tool: 'circle', label: 'Circle', shortcut: 'O' },
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
