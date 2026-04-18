import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ToggleGroupComponent, ContextMenuComponent } from '@app/shared';
import type { DropdownSelectOption, ToggleGroupOption, ContextMenuItem } from '@app/shared';
import {
  CanvasCursorType,
  CanvasElement,
  CanvasLinkType,
  CanvasPageModel,
  CanvasPositionMode,
  CanvasSemanticTag,
} from '@app/core';
import {
  getAllowedCustomAccessibilityTags,
  getDefaultAccessibilityTag,
  getResolvedCanvasTag,
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
  supportsCustomAccessibilityTag,
} from '../../../../utils/element/canvas-accessibility.util';

type AccessibilityField = 'tag' | 'ariaLabel';

interface AccessibilityFieldDefinition {
  id: AccessibilityField;
  label: string;
}

const ACCESSIBILITY_FIELD_DEFINITIONS: readonly AccessibilityFieldDefinition[] = [
  { id: 'tag', label: 'Tag' },
  { id: 'ariaLabel', label: 'Aria Label' },
] as const;

@Component({
  selector: 'app-dt-extras-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent, ToggleGroupComponent, ContextMenuComponent],
  templateUrl: './extras-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class ExtrasSectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly pages = input<readonly CanvasPageModel[]>([]);
  readonly currentPageId = input<string | null>(null);

  readonly elementPatch = output<Partial<CanvasElement>>();

  accessibilityMenuItems: ContextMenuItem[] = [];
  accessibilityMenuX = 0;
  accessibilityMenuY = 0;

  private readonly accessibilityFieldOverrides = new Map<string, Set<AccessibilityField>>();

  readonly linkTypeOptions: readonly ToggleGroupOption[] = [
    { label: 'Page', value: 'page' },
    { label: 'URL', value: 'url' },
  ];

  readonly positionOptions: DropdownSelectOption[] = [
    { label: 'Static', value: 'static' },
    { label: 'Relative', value: 'relative' },
    { label: 'Absolute', value: 'absolute' },
    { label: 'Fixed', value: 'fixed' },
    { label: 'Sticky', value: 'sticky' },
  ];

  readonly cursorOptions: DropdownSelectOption[] = [
    { label: 'Auto (inherit)', value: 'auto' },
    { label: 'Default', value: 'default' },
    { label: 'Pointer', value: 'pointer' },
    { label: 'Text', value: 'text' },
    { label: 'Move', value: 'move' },
    { label: 'Grab', value: 'grab' },
    { label: 'Grabbing', value: 'grabbing' },
    { label: 'Not Allowed', value: 'not-allowed' },
    { label: 'Wait', value: 'wait' },
    { label: 'Progress', value: 'progress' },
    { label: 'Crosshair', value: 'crosshair' },
    { label: 'Zoom In', value: 'zoom-in' },
    { label: 'Zoom Out', value: 'zoom-out' },
    { label: 'Help', value: 'help' },
    { label: 'N/S Resize', value: 'ns-resize' },
    { label: 'E/W Resize', value: 'ew-resize' },
    { label: 'Col Resize', value: 'col-resize' },
    { label: 'Row Resize', value: 'row-resize' },
    { label: 'None', value: 'none' },
  ];

  // -- Link --

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

  // -- Position --

  supportsPosition(type: CanvasElement['type']): boolean {
    return type !== 'frame';
  }

  positionValue(element: CanvasElement): CanvasPositionMode {
    return element.position ?? 'static';
  }

  onPositionChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({
      position: value === 'static' ? undefined : (value as CanvasPositionMode),
    });
  }

  // -- Cursor --

  hasCursor(element: CanvasElement): boolean {
    return !!element.cursor;
  }

  onCursorSectionHeaderClick(): void {
    if (this.hasCursor(this.element())) {
      this.removeCursor();
      return;
    }
    this.addCursor();
  }

  onCursorSectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onCursorSectionHeaderClick();
  }

  addCursor(): void {
    this.elementPatch.emit({ cursor: 'pointer' });
  }

  removeCursor(): void {
    this.elementPatch.emit({ cursor: undefined });
  }

  cursorValue(element: CanvasElement): CanvasCursorType | null {
    return element.cursor ?? null;
  }

  onCursorChange(value: string | number | boolean | null): void {
    if (typeof value !== 'string') return;
    this.elementPatch.emit({ cursor: (value as CanvasCursorType) || undefined });
  }

  // -- Accessibility --

  hasAccessibilityFields(element: CanvasElement): boolean {
    return (
      this.hasAccessibilityField(element, 'tag') || this.hasAccessibilityField(element, 'ariaLabel')
    );
  }

  hasAccessibilityField(element: CanvasElement, field: AccessibilityField): boolean {
    if (field === 'tag') {
      return this.hasLink(element) || !!getResolvedCanvasTag(element);
    }
    return (
      !!normalizeCanvasAccessibilityLabel(element.ariaLabel) ||
      this.hasAccessibilityFieldOverride(element.id, field)
    );
  }

  supportsAccessibilityTag(element: CanvasElement): boolean {
    return this.hasLink(element) || supportsCustomAccessibilityTag(element.type);
  }

  accessibilityTagOptions(element: CanvasElement): DropdownSelectOption[] {
    if (this.hasLink(element)) {
      return [{ label: 'a', value: 'a' }];
    }
    return getAllowedCustomAccessibilityTags(element.type).map((tag) => ({
      label: tag,
      value: tag,
    }));
  }

  accessibilityTagValue(element: CanvasElement): CanvasSemanticTag | '' {
    return getResolvedCanvasTag(element) ?? '';
  }

  isAccessibilityTagLocked(element: CanvasElement): boolean {
    return this.hasLink(element);
  }

  accessibilityLabelValue(element: CanvasElement): string {
    return element.ariaLabel ?? '';
  }

  accessibilityLabelPlaceholder(element: CanvasElement): string {
    return element.type === 'image' ? 'Image alt' : 'Short label';
  }

  accessibilityTagPlaceholder(element: CanvasElement): string {
    return this.supportsAccessibilityTag(element) ? 'Select tag' : 'Unavailable';
  }

  onAccessibilitySectionHeaderClick(event: MouseEvent): void {
    this.openAccessibilityMenu(event, this.resolveSectionHeaderTrigger(event));
  }

  onAccessibilitySectionToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.onAccessibilitySectionHeaderClick(event);
  }

  closeAccessibilityMenu(): void {
    this.accessibilityMenuItems = [];
  }

  onAccessibilityTagChange(value: string | number | boolean | null): void {
    if (this.hasLink(this.element()) || typeof value !== 'string') return;
    this.elementPatch.emit({ tag: normalizeStoredCanvasTag(this.element().type, value, false) });
  }

  onAccessibilityLabelChange(event: Event): void {
    this.setAccessibilityFieldOverride(this.element().id, 'ariaLabel', true);
    this.elementPatch.emit({
      ariaLabel: normalizeCanvasAccessibilityLabel((event.target as HTMLInputElement).value),
    });
  }

  private openAccessibilityMenu(event: MouseEvent | null, trigger: HTMLElement | null): void {
    const position = this.resolveMenuPosition(event, trigger);
    if (!position) return;

    if (this.accessibilityMenuItems.length > 0) return;

    this.accessibilityMenuItems = this.buildAccessibilityMenuItems(this.element());
    this.accessibilityMenuX = position.x;
    this.accessibilityMenuY = position.y;
  }

  private buildAccessibilityMenuItems(element: CanvasElement): ContextMenuItem[] {
    return ACCESSIBILITY_FIELD_DEFINITIONS.map((field) => ({
      id: field.id,
      label: field.label,
      checked: this.hasAccessibilityField(element, field.id),
      showCheckSlot: true,
      disabled: field.id === 'tag' && this.hasLink(element),
      action: () => this.toggleAccessibilityField(field.id),
    }));
  }

  private toggleAccessibilityField(field: AccessibilityField): void {
    if (field === 'tag') {
      if (this.hasLink(this.element())) {
        this.closeAccessibilityMenu();
        return;
      }
      if (this.hasAccessibilityField(this.element(), 'tag')) {
        this.elementPatch.emit({ tag: undefined });
      } else {
        this.elementPatch.emit({ tag: getDefaultAccessibilityTag(this.element().type) });
      }
      this.closeAccessibilityMenu();
      return;
    }
    const isActive = this.hasAccessibilityField(this.element(), field);
    this.setAccessibilityFieldOverride(this.element().id, field, !isActive);
    if (isActive) {
      this.elementPatch.emit({ ariaLabel: undefined });
    }
    this.closeAccessibilityMenu();
  }

  private hasAccessibilityFieldOverride(elementId: string, field: AccessibilityField): boolean {
    return this.accessibilityFieldOverrides.get(elementId)?.has(field) ?? false;
  }

  private setAccessibilityFieldOverride(
    elementId: string,
    field: AccessibilityField,
    isActive: boolean,
  ): void {
    const current = this.accessibilityFieldOverrides.get(elementId);
    const next = new Set<AccessibilityField>(current ?? []);
    if (isActive) {
      next.add(field);
    } else {
      next.delete(field);
    }
    if (next.size === 0) {
      this.accessibilityFieldOverrides.delete(elementId);
      return;
    }
    this.accessibilityFieldOverrides.set(elementId, next);
  }

  private resolveMenuPosition(
    event: MouseEvent | null,
    trigger: HTMLElement | null,
  ): { x: number; y: number } | null {
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    return { x: rect.left, y: rect.top - 6 };
  }

  private resolveSectionHeaderTrigger(event: MouseEvent): HTMLElement | null {
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return null;
    return (
      (currentTarget.closest('.properties-section-header') as HTMLElement | null) ??
      (currentTarget.querySelector('.properties-section-header') as HTMLElement | null)
    );
  }
}
