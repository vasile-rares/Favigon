import { Component, ViewEncapsulation, input, output } from '@angular/core';
import {
  CanvasElement,
  CanvasElementType,
  CanvasPageModel,
} from '@app/core';
import { FrameTemplateSelection } from '../../../canvas.types';
import { LinkSectionComponent } from './sections/link/link-section.component';
import { PositionSectionComponent } from './sections/position/position-section.component';
import { DimensionsSectionComponent } from './sections/dimensions/dimensions-section.component';
import { LayoutSectionComponent } from './sections/layout/layout-section.component';
import { AppearanceSectionComponent } from './sections/appearance/appearance-section.component';
import { TypographySectionComponent } from './sections/typography/typography-section.component';
import { TransformsSectionComponent } from './sections/transforms/transforms-section.component';
import { EffectsSectionComponent } from './sections/effects/effects-section.component';
import { CursorSectionComponent } from './sections/cursor/cursor-section.component';
import { AccessibilitySectionComponent } from './sections/accessibility/accessibility-section.component';

@Component({
  selector: 'app-design-tab',
  standalone: true,
  imports: [
    LinkSectionComponent,
    PositionSectionComponent,
    DimensionsSectionComponent,
    LayoutSectionComponent,
    AppearanceSectionComponent,
    TypographySectionComponent,
    TransformsSectionComponent,
    EffectsSectionComponent,
    CursorSectionComponent,
    AccessibilitySectionComponent,
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