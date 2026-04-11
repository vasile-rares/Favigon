import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ToggleGroupComponent } from '@app/shared';
import type { ToggleGroupOption } from '@app/shared';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
  GeneratedFile,
  IRNode,
} from '@app/core';
import { GenerationTabComponent } from './generation-tab/generation-tab.component';
import { DesignTabComponent } from './design-tab/design-tab.component';
import { FrameTemplateSelection, SupportedFramework } from '../../canvas.types';

type PropertiesTab = 'design' | 'generation';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, ToggleGroupComponent, GenerationTabComponent, DesignTabComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css',
})
export class PropertiesPanelComponent {
  @Input() selectedElement: CanvasElement | null = null;
  @Input() pages: readonly CanvasPageModel[] = [];
  @Input() currentPageId: string | null = null;
  @Input() currentTool: CanvasElementType | 'select' = 'select';
  @Input() selectedFramework: SupportedFramework = 'html';
  @Input() validationResult: boolean | null = null;
  @Input() apiError: string | null = null;
  @Input() isValidating = false;
  @Input() isGenerating = false;
  @Input() generatedHtml = '';
  @Input() generatedCss = '';
  @Input() generatedFiles: GeneratedFile[] = [];
  @Input() irPreview: IRNode | null = null;

  @Output() elementPatch = new EventEmitter<Partial<CanvasElement>>();
  @Output() numberInputGestureStarted = new EventEmitter<void>();
  @Output() numberInputGestureCommitted = new EventEmitter<void>();
  @Output() frameTemplateSelected = new EventEmitter<FrameTemplateSelection>();
  @Output() frameworkChanged = new EventEmitter<SupportedFramework>();
  @Output() validateRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();

  activeTab: PropertiesTab = 'design';

  readonly propertiesTabOptions: readonly ToggleGroupOption[] = [
    {
      label: 'Design',
      value: 'design',
      ariaLabel: 'Open design tab',
      title: 'Design',
    },
    {
      label: 'Generation',
      value: 'generation',
      ariaLabel: 'Open generation tab',
      title: 'Generation',
    },
  ];

  selectTab(tab: PropertiesTab): void {
    this.activeTab = tab;
  }

  onTabValueChange(value: string | number | boolean): void {
    if (value === 'design' || value === 'generation') {
      this.selectTab(value);
    }
  }

  isTabActive(tab: PropertiesTab): boolean {
    return this.activeTab === tab;
  }
}