import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasElement, CanvasPageModel } from '../../../core/models/canvas.models';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { CanvasElementService } from '../services/canvas-element.service';
import { CanvasPersistenceService } from '../services/canvas-persistence.service';

type PreviewDevicePreset = 'desktop' | 'tablet' | 'mobile' | 'custom';

interface PreviewDeviceOption {
  id: PreviewDevicePreset;
  label: string;
  width: number;
}

interface PreviewLinkTarget {
  kind: 'page' | 'url';
  value: string;
}

const PREVIEW_DEVICE_OPTIONS: PreviewDeviceOption[] = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 800 },
  { id: 'mobile', label: 'Mobile', width: 375 },
];

@Component({
  selector: 'app-canvas-preview-page',
  standalone: true,
  imports: [CommonModule],
  providers: [CanvasElementService, CanvasPersistenceService],
  templateUrl: './canvas-preview-page.component.html',
  styleUrl: './canvas-preview-page.component.css',
})
export class CanvasPreviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly el = inject(CanvasElementService);

  readonly pages = signal<CanvasPageModel[]>([]);
  readonly currentPageId = signal<string | null>(null);
  readonly selectedDevice = signal<PreviewDevicePreset>('desktop');
  readonly isPageMenuOpen = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly projectId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly currentPage = computed<CanvasPageModel | null>(() => {
    const activePageId = this.currentPageId();
    if (!activePageId) {
      return this.pages()[0] ?? null;
    }

    return this.pages().find((page) => page.id === activePageId) ?? this.pages()[0] ?? null;
  });

  readonly visibleElements = computed<CanvasElement[]>(() => {
    const elements = this.currentPage()?.elements ?? [];
    return elements.filter((element) => this.el.isElementEffectivelyVisible(element.id, elements));
  });

  readonly viewportWidth = computed<number>(() => {
    const mode = this.selectedDevice();
    const option = PREVIEW_DEVICE_OPTIONS.find((entry) => entry.id === mode);
    if (option) {
      return option.width;
    }

    return this.getPageViewportWidth(this.currentPage());
  });

  readonly viewportHeight = computed<number>(() => {
    const mode = this.selectedDevice();
    if (mode === 'custom') {
      return this.getPageViewportHeight(this.currentPage());
    }

    const width = this.viewportWidth();
    const pageWidth = this.getPageViewportWidth(this.currentPage());
    const pageHeight = this.getPageViewportHeight(this.currentPage());
    const ratio = pageHeight / Math.max(pageWidth, 1);

    return Math.max(120, Math.round(width * ratio));
  });

  readonly deviceOptions = PREVIEW_DEVICE_OPTIONS;

  constructor() {
    this.loadPreview(this.route.snapshot.queryParamMap.get('pageId'));
  }

  selectDevice(device: PreviewDevicePreset): void {
    this.selectedDevice.set(device);
  }

  selectPage(pageId: string): void {
    this.currentPageId.set(pageId);
    this.isPageMenuOpen.set(false);
    this.syncQueryPage(pageId);
  }

  onElementClick(event: MouseEvent, element: CanvasElement): void {
    const target = this.resolveLinkTarget(element);
    if (!target) {
      return;
    }

    event.stopPropagation();
    this.activateLinkTarget(target);
  }

  onElementKeydown(event: KeyboardEvent, element: CanvasElement): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const target = this.resolveLinkTarget(element);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateLinkTarget(target);
  }

  togglePageMenu(): void {
    this.isPageMenuOpen.update((open) => !open);
  }

  refreshPreview(): void {
    this.loadPreview(this.currentPageId());
  }

  closePageMenu(): void {
    this.isPageMenuOpen.set(false);
  }

  getRenderedX(element: CanvasElement): number {
    return this.el.getAbsoluteBounds(element, this.currentPage()?.elements ?? [], this.currentPage()).x;
  }

  getRenderedY(element: CanvasElement): number {
    return this.el.getAbsoluteBounds(element, this.currentPage()?.elements ?? [], this.currentPage()).y;
  }

  getRenderedWidthStyle(element: CanvasElement): string {
    return this.el.getRenderedWidthStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getRenderedHeightStyle(element: CanvasElement): string {
    return this.el.getRenderedHeightStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getRenderedMinWidthStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMinWidthStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getRenderedMaxWidthStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMaxWidthStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getRenderedMinHeightStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMinHeightStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getRenderedMaxHeightStyle(element: CanvasElement): string | null {
    return this.el.getRenderedMaxHeightStyle(element, this.currentPage()?.elements ?? [], this.currentPage());
  }

  getElementBorderStyle(element: CanvasElement): string {
    return this.el.getElementStrokeStyle(element);
  }

  getElementBorderRadius(element: CanvasElement): string {
    return this.el.getElementBorderRadius(element);
  }

  getElementBoxShadow(element: CanvasElement): string {
    return this.el.getElementBoxShadow(element);
  }

  getElementTransform(element: CanvasElement): string | null {
    return this.el.getElementTransform(element);
  }

  getElementTransformOrigin(element: CanvasElement): string | null {
    return this.el.getElementTransformOrigin(element);
  }

  getElementBackfaceVisibility(element: CanvasElement): string | null {
    return this.el.getElementBackfaceVisibility(element);
  }

  getElementTransformStyle(element: CanvasElement): string | null {
    return this.el.getElementTransformStyle(element);
  }

  isInteractiveElement(element: CanvasElement): boolean {
    return this.resolveLinkTarget(element) !== null;
  }

  hasDirectLink(element: CanvasElement): boolean {
    return this.getDirectLinkTarget(element) !== null;
  }

  getElementTabIndex(element: CanvasElement): number | null {
    return this.hasDirectLink(element) ? 0 : null;
  }

  getElementRole(element: CanvasElement): string | null {
    return this.hasDirectLink(element) ? 'link' : null;
  }

  getElementClipPath(element: CanvasElement): string {
    return this.el.getElementClipPath(element, this.currentPage()?.elements ?? []);
  }

  getTextFontFamily(element: CanvasElement): string {
    return this.el.getTextFontFamily(element);
  }

  getTextFontWeight(element: CanvasElement): number {
    return this.el.getTextFontWeight(element);
  }

  getTextFontStyle(element: CanvasElement): string {
    return this.el.getTextFontStyle(element);
  }

  getTextFontSize(element: CanvasElement): string {
    return this.el.getTextFontSize(element);
  }

  getTextLineHeight(element: CanvasElement): string {
    return this.el.getTextLineHeight(element);
  }

  getTextLetterSpacing(element: CanvasElement): string {
    return this.el.getTextLetterSpacing(element);
  }

  getTextAlignValue(element: CanvasElement): string {
    return this.el.getTextAlignValue(element);
  }

  trackByElementId(_: number, element: CanvasElement): string {
    return element.id;
  }

  trackByPageId(_: number, page: CanvasPageModel): string {
    return page.id;
  }

  private loadPreview(requestedPageId: string | null): void {
    const projectId = Number.parseInt(this.projectId, 10);
    if (!Number.isInteger(projectId)) {
      this.error.set('Invalid project id.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.canvasPersistenceService.loadProjectDesign(projectId).subscribe({
      next: (design) => {
        this.pages.set(design.pages);

        const preferredPageId =
          requestedPageId && design.pages.some((page) => page.id === requestedPageId)
            ? requestedPageId
            : design.activePageId;

        this.currentPageId.set(preferredPageId ?? design.pages[0]?.id ?? null);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(extractApiErrorMessage(error, 'Failed to load preview.'));
        this.isLoading.set(false);
      },
    });
  }

  private getPageViewportWidth(page: CanvasPageModel | null): number {
    const width = page?.viewportWidth;
    return typeof width === 'number' && Number.isFinite(width)
      ? Math.max(100, Math.round(width))
      : 1280;
  }

  private getPageViewportHeight(page: CanvasPageModel | null): number {
    const height = page?.viewportHeight;
    return typeof height === 'number' && Number.isFinite(height)
      ? Math.max(100, Math.round(height))
      : 720;
  }

  private activateLinkTarget(target: PreviewLinkTarget): void {
    this.closePageMenu();

    if (target.kind === 'page') {
      this.selectPage(target.value);
      return;
    }

    window.open(target.value, '_blank', 'noopener,noreferrer');
  }

  private resolveLinkTarget(element: CanvasElement): PreviewLinkTarget | null {
    const elements = this.currentPage()?.elements ?? [];
    let current: CanvasElement | undefined = element;

    while (current) {
      const directTarget = this.getDirectLinkTarget(current);
      if (directTarget) {
        return directTarget;
      }

      const parentId: string | null | undefined = current.parentId;
      current = parentId ? elements.find((entry) => entry.id === parentId) : undefined;
    }

    return null;
  }

  private getDirectLinkTarget(element: CanvasElement): PreviewLinkTarget | null {
    if (element.linkType === 'page') {
      const pageId = typeof element.linkPageId === 'string' ? element.linkPageId : '';
      if (pageId && this.pages().some((page) => page.id === pageId)) {
        return { kind: 'page', value: pageId };
      }

      return null;
    }

    if (element.linkType === 'url') {
      const url = normalizePreviewLinkUrl(element.linkUrl);
      if (url) {
        return { kind: 'url', value: url };
      }
    }

    return null;
  }

  private syncQueryPage(pageId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pageId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

function normalizePreviewLinkUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('#') ||
    normalized.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return normalized;
  }

  return `https://${normalized}`;
}
