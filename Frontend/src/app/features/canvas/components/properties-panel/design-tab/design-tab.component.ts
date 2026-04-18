import { Component, ViewEncapsulation, input, output } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '@app/core';
import { FrameTemplateSelection } from '../../../canvas.types';
import { ExtrasSectionComponent } from './sections/extras-section.component';
import { DimensionsSectionComponent } from './sections/dimensions-section.component';
import { LayoutSectionComponent } from './sections/layout-section.component';
import { AppearanceSectionComponent } from './sections/appearance-section.component';
import { TypographySectionComponent } from './sections/typography-section.component';
import { TransformsEffectsSectionComponent } from './sections/transforms-effects-section.component';

@Component({
  selector: 'app-design-tab',
  standalone: true,
  imports: [
    ExtrasSectionComponent,
    DimensionsSectionComponent,
    LayoutSectionComponent,
    AppearanceSectionComponent,
    TypographySectionComponent,
    TransformsEffectsSectionComponent,
  ],
  templateUrl: './design-tab.component.html',
  styleUrl: './design-tab.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class DesignTabComponent {
  readonly selectedElement = input<CanvasElement | null>(null);
  readonly projectId = input<number | null>(null);
  readonly autoOpenFillPopupElementId = input<string | null>(null);
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);
  readonly currentTool = input<CanvasElementType | 'select'>('select');

  readonly elementPatch = output<Partial<CanvasElement>>();
  readonly numberInputGestureStarted = output<void>();
  readonly numberInputGestureCommitted = output<void>();
  readonly frameTemplateSelected = output<FrameTemplateSelection>();

  readonly frameTemplates: FrameTemplateSelection[] = [
    { name: 'iPhone', sizeLabel: '390 × 844', width: 390, height: 844 },
    { name: 'Tablet', sizeLabel: '820 × 1180', width: 820, height: 1180 },
    { name: 'Desktop', sizeLabel: '1440 × 900', width: 1440, height: 900 },
  ];

  isFrameToolSelected(): boolean {
    return this.currentTool() === 'frame';
  }

  isText(type: CanvasElement['type']): boolean {
    return type === 'text';
  }

  isImage(type: CanvasElement['type']): boolean {
    return type === 'image';
  }

  applyFrameTemplate(template: FrameTemplateSelection): void {
    this.frameTemplateSelected.emit(template);
  }

  onTextChange(field: 'text' | 'imageUrl', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.elementPatch.emit({ [field]: value } as Partial<CanvasElement>);
  }
}