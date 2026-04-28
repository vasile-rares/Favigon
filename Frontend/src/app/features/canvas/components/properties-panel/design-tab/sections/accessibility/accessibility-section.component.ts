import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DropdownSelectComponent, ContextMenuComponent } from '@app/shared';
import type { DropdownSelectOption, ContextMenuItem } from '@app/shared';
import { CanvasElement, CanvasSemanticTag } from '@app/core';
import {
  getAllowedCustomAccessibilityTags,
  getDefaultAccessibilityTag,
  getResolvedCanvasTag,
  hasCanvasElementLink,
  normalizeCanvasAccessibilityLabel,
  normalizeStoredCanvasTag,
  supportsCustomAccessibilityTag,
} from '../../../../../utils/element/canvas-accessibility.util';

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
  selector: 'app-dt-accessibility-section',
  standalone: true,
  imports: [FormsModule, DropdownSelectComponent, ContextMenuComponent],
  templateUrl: './accessibility-section.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class AccessibilitySectionComponent {
  readonly element = input.required<CanvasElement>();
  readonly elementPatch = output<Partial<CanvasElement>>();

  accessibilityMenuItems: ContextMenuItem[] = [];
  accessibilityMenuX = 0;
  accessibilityMenuY = 0;

  private readonly accessibilityFieldOverrides = new Map<string, Set<AccessibilityField>>();

  hasLink(element: CanvasElement): boolean {
    return hasCanvasElementLink(element);
  }

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
