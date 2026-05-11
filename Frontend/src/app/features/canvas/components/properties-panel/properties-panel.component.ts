import { Component, effect, input, output } from '@angular/core';
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
  imports: [ToggleGroupComponent, GenerationTabComponent, DesignTabComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css',
})
export class PropertiesPanelComponent {
  readonly selectedElement = input<CanvasElement | null>(null);
  readonly liveSize = input<{ width: number; height: number } | null>(null);
  readonly projectId = input<number | null>(null);
  readonly autoOpenFillPopupElementId = input<string | null>(null);
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);
  readonly currentTool = input<CanvasElementType | 'select'>('select');
  readonly selectedFramework = input<SupportedFramework>('html');
  readonly validationResult = input<boolean | null>(null);
  readonly apiError = input<string | null>(null);
  readonly isValidating = input(false);
  readonly isGenerating = input(false);
  readonly generatedHtml = input('');
  readonly generatedCss = input('');
  readonly generatedFiles = input<GeneratedFile[]>([]);
  readonly irPreview = input<IRNode | null>(null);
  readonly designJson = input<string | null>(null);
  readonly projectName = input<string>('project');

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();
  readonly frameTemplateSelected = output<FrameTemplateSelection>();
  readonly frameworkChanged = output<SupportedFramework>();
  readonly validateRequested = output<void>();
  readonly generateRequested = output<void>();

  activeTab: PropertiesTab = 'design';

  constructor() {
    effect(() => {
      if (this.autoOpenFillPopupElementId()) {
        this.activeTab = 'design';
      }
    });
  }

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
