import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CanvasElement } from '@app/core';
import { CanvasBorderWidths } from '@app/core';
import { CanvasBorderSides } from '@app/core';
import { resolveEditableCanvasShadow } from '../../../utils/canvas-shadow.util';
import { DropdownMenuComponent } from '../dropdown-menu/dropdown-menu.component';

type StylePopupFieldKind = 'fill' | 'stroke' | 'shadow' | 'effect';
type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

@Component({
  selector: 'app-field-input',
  standalone: true,
  imports: [CommonModule, FormsModule, DropdownMenuComponent],
  templateUrl: './field-input.component.html',
  styleUrl: './field-input.component.css',
})
export class FieldInputComponent implements OnDestroy {
  @Input() kind: StylePopupFieldKind = 'fill';
  @Input() hasValue = true;
  @Input() triggerText = '';
  @Input() swatchColor: string | null = null;
  @Input() isTransparent = false;
  @Input() shadowValue: string | null = null;
  @Input() colorValue = '#000000';
  @Input() pickerColor = '#000000';
  @Input() strokeWidth = 1;
  @Input() strokeStyle = 'Solid';
  @Input() borderStyleOptions: string[] = [];
  @Input() strokeSides: CanvasBorderSides | null = null;
  @Input() strokeWidths: CanvasBorderWidths | null = null;
  @Input() popupTitleOverride = '';
  @Input() popupWidthOverride: number | null = null;
  @Input() inlineContentOnly = false;
  @Input() activationPatch: Partial<CanvasElement> | null = null;
  @Input() clearPatch: Partial<CanvasElement> | null = null;

  @Output() patchRequested = new EventEmitter<Partial<CanvasElement>>();
  @Output() clearRequested = new EventEmitter<void>();
  @Output() openChange = new EventEmitter<boolean>();
  @Output() numberGestureStarted = new EventEmitter<void>();
  @Output() numberGestureCommitted = new EventEmitter<void>();

  @HostBinding('style.display') readonly hostDisplay = 'block';
  @HostBinding('style.width') readonly hostWidth = '100%';
  @HostBinding('style.min-width') readonly hostMinWidth = '0';

  @ViewChild(DropdownMenuComponent) private dropdownMenu?: DropdownMenuComponent;
  @ViewChild('popupPanel') private popupPanelRef?: ElementRef<HTMLElement>;

  isOpen = false;
  popupTop: number | null = 16;
  popupBottom: number | null = null;
  popupLeft = 16;
  popupWidth = 248;

  private activePopupAnchor: HTMLElement | null = null;
  private readonly onGlobalScroll = (): void => {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  };

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {
    window.addEventListener('scroll', this.onGlobalScroll, true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onGlobalScroll, true);
  }

  get popupTitle(): string {
    if (this.popupTitleOverride.trim().length > 0) {
      return this.popupTitleOverride;
    }

    switch (this.kind) {
      case 'fill':
        return 'Fill';
      case 'stroke':
        return 'Border';
      case 'shadow':
        return 'Shadow';
      case 'effect':
        return 'Effect';
      default:
        return '';
    }
  }

  get showAddButton(): boolean {
    return this.kind !== 'fill' && !this.hasValue;
  }

  get showClearButton(): boolean {
    return this.hasValue;
  }

  get clearButtonTitle(): string {
    switch (this.kind) {
      case 'fill':
        return 'Clear fill';
      case 'stroke':
        return 'Remove stroke';
      case 'shadow':
        return 'Remove shadow';
      case 'effect':
        return 'Remove effect';
      default:
        return 'Clear';
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.closePopup();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closePopup();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isOpen || !this.activePopupAnchor) {
      return;
    }

    this.updatePopupPlacement(this.activePopupAnchor);
  }

  onTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen) {
      this.closePopup();
      return;
    }

    if (!this.hasValue && this.activationPatch) {
      this.patchRequested.emit(this.activationPatch);
    }

    this.activePopupAnchor = event.currentTarget as HTMLElement;
    this.updatePopupPlacement(this.activePopupAnchor);
    this.isOpen = true;
    this.openChange.emit(true);
    this.showPopover();
  }

  onClearClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.clearPatch) {
      this.patchRequested.emit(this.clearPatch);
    } else {
      this.clearRequested.emit();
    }

    if (this.kind !== 'fill') {
      this.closePopup();
    }
  }

  onPopupCloseClick(): void {
    this.closePopup();
  }

  get shadowSwatchColor(): string {
    return resolveEditableCanvasShadow(this.shadowValue).color;
  }

  get isShadowSwatchTransparent(): boolean {
    return (parseCssColorAlpha(this.shadowSwatchColor) ?? 1) <= 0.001;
  }

  private closePopup(): void {
    const wasOpen = this.isOpen;

    this.dropdownMenu?.finalizeGesture();
    this.hidePopover();

    this.isOpen = false;
    this.activePopupAnchor = null;

    if (wasOpen) {
      this.openChange.emit(false);
    }
  }

  private showPopover(): void {
    const el = this.popupPanelRef?.nativeElement as PopoverElement | undefined;
    if (el?.showPopover) {
      el.showPopover();
    }
  }

  private hidePopover(): void {
    const el = this.popupPanelRef?.nativeElement as PopoverElement | undefined;
    if (el?.hidePopover) {
      el.hidePopover();
    }
  }

  private updatePopupPlacement(anchor: HTMLElement): void {
    const panelElement = this.hostRef.nativeElement.closest(
      '.properties-panel',
    ) as HTMLElement | null;
    const panelBounds = (panelElement ?? this.hostRef.nativeElement).getBoundingClientRect();
    this.popupTop = null;
    this.popupBottom = 12;

    const preferredWidth = this.popupWidthOverride ?? 248;
    this.popupWidth = Math.min(preferredWidth, Math.max(220, window.innerWidth - 24));
    const desiredLeft = panelBounds.left - this.popupWidth - 12;
    const maxLeft = Math.max(12, window.innerWidth - this.popupWidth - 12);
    this.popupLeft = Math.min(maxLeft, Math.max(12, desiredLeft));
  }
}

function parseCssColorAlpha(color: string): number | null {
  const normalized = color.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'transparent') return 0;

  const hexMatch = normalized.match(/^#([0-9a-f]{8})$/);
  if (hexMatch) {
    return parseInt(hexMatch[1].slice(6, 8), 16) / 255;
  }

  const rgbaMatch = normalized.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
  if (rgbaMatch) {
    return parseFloat(rgbaMatch[1]);
  }

  return 1;
}
