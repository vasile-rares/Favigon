import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent } from '@app/shared';
import type { DropdownSelectOption, ToggleGroupOption } from '@app/shared';
import { CanvasElement, CanvasLinkType, CanvasPageModel } from '@app/core';
import { hasCanvasElementLink } from '../../../../../utils/element/canvas-accessibility.util';

@Component({
  selector: 'app-dt-link-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent, ToggleGroupComponent],
  templateUrl: './link-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class LinkSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();

  readonly linkTypeOptions: readonly ToggleGroupOption[] = [
    { label: 'Page', value: 'page' },
    { label: 'URL', value: 'url' },
  ];

  hasLink(element: CanvasElement): boolean {
    return hasCanvasElementLink(element);
  }

  onLinkSectionHeaderClick(): void {
    if (this.hasLink(this.element())) {
      this.removeLink();
      return;
    }
    this.addLink();
  }

  onLinkSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onLinkSectionHeaderClick();
  }

  linkTypeValue(element: CanvasElement): CanvasLinkType {
    return element.linkType === 'page' ? 'page' : 'url';
  }

  linkPageOptions(element: CanvasElement): DropdownSelectOption[] {
    const selectedPageId =
      element.linkType === 'page' && typeof element.linkPageId === 'string'
        ? element.linkPageId
        : null;
    return this.pages()
      .filter((page) => page.id !== this.currentPageId() || page.id === selectedPageId)
      .map((page) => ({
        label: page.id === this.currentPageId() ? `${page.name} (current)` : page.name,
        value: page.id,
      }));
  }

  linkPageValue(element: CanvasElement): string | null {
    if (element.linkType !== 'page') return null;
    return typeof element.linkPageId === 'string' && element.linkPageId.trim().length > 0
      ? element.linkPageId
      : null;
  }

  linkUrlValue(element: CanvasElement): string {
    return element.linkType === 'url' ? (element.linkUrl ?? '') : '';
  }

  onLinkTypeChange(value: string | number | boolean | null): void {
    if (value === 'page') {
      this.elementPatch.emit({
        linkType: 'page',
        linkPageId: this.firstAvailableLinkPageId(),
        linkUrl: undefined,
        tag: undefined,
      });
      return;
    }
    if (value === 'url') {
      this.elementPatch.emit({
        linkType: 'url',
        linkPageId: undefined,
        linkUrl: '',
        tag: undefined,
      });
    }
  }

  onLinkPageChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string' || !this.pages().some((page) => page.id === value)) return;
    this.elementPatch.emit({
      linkType: 'page',
      linkPageId: value,
      linkUrl: undefined,
      tag: undefined,
    });
  }

  onLinkUrlChange(event: Event): void {
    this.elementPatch.emit({
      linkType: 'url',
      linkPageId: undefined,
      linkUrl: (event.target as HTMLInputElement).value,
      tag: undefined,
    });
  }

  addLink(): void {
    const pageId = this.firstAvailableLinkPageId();
    if (pageId) {
      this.elementPatch.emit({
        linkType: 'page',
        linkPageId: pageId,
        linkUrl: undefined,
        tag: undefined,
      });
      return;
    }
    this.elementPatch.emit({ linkType: 'url', linkPageId: undefined, linkUrl: '', tag: undefined });
  }

  removeLink(): void {
    this.elementPatch.emit({
      linkType: undefined,
      linkPageId: undefined,
      linkUrl: undefined,
      tag: undefined,
    });
  }

  private firstAvailableLinkPageId(): string | undefined {
    const selectedPageId =
      this.element().linkType === 'page' && typeof this.element().linkPageId === 'string'
        ? this.element().linkPageId
        : null;
    return this.pages().find(
      (page) => page.id !== this.currentPageId() || page.id === selectedPageId,
    )?.id;
  }
}
