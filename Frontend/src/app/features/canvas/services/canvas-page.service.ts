import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CanvasElement, CanvasPageModel, CanvasPageViewportPreset } from '@app/core';
import type { ContextMenuItem, DialogBoxField } from '@app/shared';
import { roundToTwoDecimals, clamp } from '../utils/canvas-math.util';
import { mutateNormalizeElement } from '../utils/canvas-interaction.util';
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from './canvas-viewport.constants';
import { getFrameTitle } from '../utils/canvas-text.util';
import { DeviceFramePreset, PageCanvasLayout, VIEWPORT_PRESET_OPTIONS } from '../canvas.types';
import type { Point } from '../canvas.types';
import { CanvasEditorStateService } from './canvas-editor-state.service';
import { CanvasElementService } from './canvas-element.service';
import { CanvasPageGeometryService } from './canvas-page-geometry.service';
import { CanvasViewportService } from './canvas-viewport.service';
import { CanvasHistoryService } from './canvas-history.service';

const DEVICE_FRAME_OPTIONS = VIEWPORT_PRESET_OPTIONS;

const MIN_CUSTOM_VIEWPORT_SIZE = 100;
const PAGE_CANVAS_GAP = 120;
const PAGE_SHELL_HEADER_HEIGHT = 32;
const PAGE_SHELL_HEADER_HORIZONTAL_INSET = 8;

@Injectable()
export class CanvasPageService {
  private readonly editorState = inject(CanvasEditorStateService);
  private readonly el = inject(CanvasElementService);
  private readonly layout = inject(CanvasPageGeometryService);
  private readonly viewport = inject(CanvasViewportService);
  private readonly history = inject(CanvasHistoryService);
  private readonly router = inject(Router);

  // ── Signals (page-management exclusive) ───────────────────

  readonly editingCanvasHeaderPageId = signal<string | null>(null);
  readonly layersFocusedPageId = signal<string | null>(null);
  readonly selectedPageLayerId = signal<string | null>(null);
  readonly copiedPageSnapshot = signal<CanvasPageModel | null>(null);
  readonly isViewportMenuOpen = signal(false);
  readonly isDeviceMenuOpen = signal(false);
  readonly deviceMenuX = signal(0);
  readonly deviceMenuY = signal(0);
  readonly deviceMenuItems = signal<ContextMenuItem[]>([]);
  readonly deviceMenuTargetPageId = signal<string | null>(null);
  readonly isCustomFrameDialogOpen = signal(false);
  readonly customFrameWidth = signal(480);
  readonly customFrameHeight = signal(800);
  readonly editingCanvasHeaderPageName = signal('');
  readonly apiError = signal<string | null>(null);

  // ── Computed Signals ──────────────────────────────────────

  readonly selectedCanvasPageId = computed<string | null>(
    () => this.layersFocusedPageId() ?? this.selectedPageLayerId(),
  );
  readonly hasCopiedPage = computed(() => this.copiedPageSnapshot() !== null);
  readonly customFrameDialogFields = computed<DialogBoxField[]>(() => [
    {
      key: 'width',
      label: 'Width',
      type: 'number',
      initialValue: String(this.customFrameWidth()),
    },
    {
      key: 'height',
      label: 'Height',
      type: 'number',
      initialValue: String(this.customFrameHeight()),
    },
  ]);

  readonly pageLayouts = computed<PageCanvasLayout[]>(() => {
    const pages = this.editorState.pages();
    let cursorX = 0;
    return pages.map((page) => {
      const width = this.normalizeViewportSize(page.viewportWidth, 1280);
      const height = this.normalizeViewportSize(page.viewportHeight, 720);
      const pageX =
        typeof page.canvasX === 'number' && Number.isFinite(page.canvasX) ? page.canvasX : cursorX;
      const pageY =
        typeof page.canvasY === 'number' && Number.isFinite(page.canvasY) ? page.canvasY : 0;
      const layout: PageCanvasLayout = {
        pageId: page.id,
        x: pageX,
        y: pageY,
        width,
        height,
      };
      cursorX = Math.max(cursorX, pageX + width + PAGE_CANVAS_GAP);
      return layout;
    });
  });

  readonly activePageLayout = computed<PageCanvasLayout | null>(() => {
    const activeId = this.editorState.currentPageId();
    if (!activeId) {
      return null;
    }
    return this.pageLayouts().find((layout) => layout.pageId === activeId) ?? null;
  });

  readonly inactivePageLayouts = computed<PageCanvasLayout[]>(() => {
    const activeId = this.editorState.currentPageId();
    return this.pageLayouts().filter((layout) => layout.pageId !== activeId);
  });

  readonly deviceFrameOptions = DEVICE_FRAME_OPTIONS;
  readonly viewportPresetOptions = VIEWPORT_PRESET_OPTIONS;

  readonly currentViewportPreset = computed<CanvasPageViewportPreset>(
    () => this.editorState.currentPage()?.viewportPreset ?? 'desktop',
  );
  readonly currentViewportWidth = computed<number>(() =>
    this.normalizeViewportSize(this.editorState.currentPage()?.viewportWidth, 1280),
  );
  readonly currentViewportHeight = computed<number>(() =>
    this.normalizeViewportSize(this.editorState.currentPage()?.viewportHeight, 720),
  );
  readonly currentViewportLabel = computed<string>(() => {
    const preset = this.currentViewportPreset();
    const matchedOption = this.viewportPresetOptions.find((option) => option.id === preset);
    return matchedOption ? matchedOption.label : 'Custom';
  });

  // ── Page CRUD ─────────────────────────────────────────────

  addPage(): void {
    this.runWithHistory(() => {
      const pages = this.editorState.pages;
      const position = this.getNextPageCanvasPosition();
      const basePage = this.el.createPage(this.el.getNextPageName(pages()));
      const desktopWidth = this.normalizeViewportSize(basePage.viewportWidth, 1280);
      const desktopHeight = this.normalizeViewportSize(basePage.viewportHeight, 720);
      const desktopFrame = {
        ...this.el.createFrameAtCenter(
          {
            x: desktopWidth / 2,
            y: desktopHeight / 2,
          },
          desktopWidth,
          desktopHeight,
          'Desktop',
          [],
        ),
        name: 'Desktop',
        x: 0,
        y: 0,
        isPrimary: true,
      };
      const page = {
        ...basePage,
        canvasX: position.x,
        canvasY: position.y,
        elements: [desktopFrame],
      };
      pages.update((p) => [...p, page]);
      this.editorState.currentPageId.set(page.id);
      this.layersFocusedPageId.set(page.id);
      this.editorState.selectedElementId.set(null);
      this.editorState.currentTool.set('select');
    });
  }

  duplicatePage(pageId: string): void {
    const sourcePage = this.getPageById(pageId);
    if (!sourcePage) {
      return;
    }

    this.apiError.set(null);
    this.runWithHistory(() => {
      const position = this.getNextPageCanvasPosition();
      const duplicatedPage: CanvasPageModel = {
        ...sourcePage,
        id: crypto.randomUUID(),
        name: this.getNextDuplicatedPageName(sourcePage.name),
        canvasX: position.x,
        canvasY: position.y,
        elements: this.clonePageElements(sourcePage.elements),
      };

      this.editorState.pages.update((pages) => {
        const sourceIndex = pages.findIndex((entry) => entry.id === pageId);
        if (sourceIndex === -1) {
          return [...pages, duplicatedPage];
        }

        const nextPages = [...pages];
        nextPages.splice(sourceIndex + 1, 0, duplicatedPage);
        return nextPages;
      });

      this.editorState.currentPageId.set(duplicatedPage.id);
      this.layersFocusedPageId.set(duplicatedPage.id);
      this.editorState.selectedElementId.set(null);
      this.editorState.currentTool.set('select');
    });
  }

  copyPage(pageId: string): void {
    const page = this.getPageById(pageId);
    if (!page) {
      return;
    }

    this.copiedPageSnapshot.set(structuredClone(page));
    this.apiError.set(null);
  }

  pastePage(targetPageId: string): void {
    const sourcePage = this.copiedPageSnapshot();
    if (!sourcePage) {
      return;
    }

    this.apiError.set(null);
    this.runWithHistory(() => {
      const position = this.getNextPageCanvasPosition();
      const pastedPage: CanvasPageModel = {
        ...structuredClone(sourcePage),
        id: crypto.randomUUID(),
        name: this.getNextDuplicatedPageName(sourcePage.name),
        canvasX: position.x,
        canvasY: position.y,
        elements: this.clonePageElements(sourcePage.elements),
      };

      this.editorState.pages.update((pages) => {
        const targetIndex = pages.findIndex((entry) => entry.id === targetPageId);
        if (targetIndex === -1) {
          return [...pages, pastedPage];
        }

        const nextPages = [...pages];
        nextPages.splice(targetIndex + 1, 0, pastedPage);
        return nextPages;
      });

      const shouldPreserveAllPagesView = this.layersFocusedPageId() === null;
      this.editorState.currentPageId.set(pastedPage.id);

      if (shouldPreserveAllPagesView) {
        this.selectedPageLayerId.set(pastedPage.id);
      } else {
        this.layersFocusedPageId.set(pastedPage.id);
        this.clearSelectedPageLayer();
      }

      this.editorState.selectedElementId.set(null);
      this.editorState.currentTool.set('select');
    });
  }

  deletePage(pageId: string): void {
    const pages = this.editorState.pages();
    if (pages.length <= 1) {
      this.apiError.set('A project must contain at least one page.');
      return;
    }

    const page = pages.find((entry) => entry.id === pageId);
    if (!page) {
      return;
    }

    const shouldDelete = window.confirm(`Delete page "${page.name}"?`);
    if (!shouldDelete) {
      return;
    }

    this.apiError.set(null);
    this.runWithHistory(() => {
      const currentPages = this.editorState.pages();
      const pageIndex = currentPages.findIndex((entry) => entry.id === pageId);
      const nextPages = currentPages.filter((entry) => entry.id !== pageId);
      const fallbackPage =
        nextPages[Math.min(pageIndex, nextPages.length - 1)] ?? nextPages[0] ?? null;

      this.editorState.pages.set(nextPages);
      if (this.editorState.currentPageId() === pageId) {
        this.editorState.currentPageId.set(fallbackPage?.id ?? null);
      }

      if (this.layersFocusedPageId() === pageId) {
        this.layersFocusedPageId.set(fallbackPage?.id ?? null);
      }

      if (this.selectedPageLayerId() === pageId) {
        this.selectedPageLayerId.set(fallbackPage?.id ?? null);
      }

      this.editorState.selectedElementId.set(null);
      this.editorState.editingTextElementId.set(null);
      this.editorState.currentTool.set('select');
    });
  }

  // ── Page Selection ────────────────────────────────────────

  selectPage(pageId: string): void {
    this.applyPageSelection(pageId, true);
  }

  selectPageWithoutFocus(pageId: string): void {
    if (this.layersFocusedPageId() === null) {
      if (pageId !== this.editorState.currentPageId()) {
        this.editorState.currentPageId.set(pageId);
      }

      this.selectedPageLayerId.set(pageId);
      this.closeViewportMenu();
      this.closeDeviceFrameMenu();
      this.editorState.selectedElementId.set(null);
      this.editorState.currentTool.set('select');
      return;
    }

    this.clearSelectedPageLayer();
    this.applyPageSelection(pageId, false);
  }

  onActivePageShellClick(pageId: string): void {
    this.clearSelectedPageLayer();
    this.layersFocusedPageId.set(pageId);
    this.editorState.selectedElementId.set(null);
  }

  clearSelectedPageLayer(): void {
    if (this.selectedPageLayerId() !== null) {
      this.selectedPageLayerId.set(null);
    }
  }

  // ── Page Naming ───────────────────────────────────────────

  onCanvasHeaderPageNameDoubleClick(event: MouseEvent, pageId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const page = this.getPageById(pageId);
    if (!page) {
      return;
    }

    this.editingCanvasHeaderPageId.set(pageId);
    this.editingCanvasHeaderPageName.set(page.name);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-canvas-page-name-id="${pageId}"]`,
      );
      input?.focus();
      input?.select();
    });
  }

  onCanvasHeaderPageNameInput(event: Event): void {
    this.editingCanvasHeaderPageName.set((event.target as HTMLInputElement).value);
  }

  onCanvasHeaderPageNameBlur(pageId: string): void {
    this.commitCanvasHeaderPageRename(pageId);
  }

  onCanvasHeaderPageNameKeyDown(pageId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.editingCanvasHeaderPageId.set(null);
      this.editingCanvasHeaderPageName.set('');
    }
  }

  onPageNameChanged(change: { id: string; name: string }): void {
    this.runWithHistory(() => {
      this.editorState.pages.update((pages) =>
        pages.map((p) => (p.id === change.id ? { ...p, name: change.name } : p)),
      );
    });

    if (this.editingCanvasHeaderPageId() === change.id) {
      this.editingCanvasHeaderPageId.set(null);
      this.editingCanvasHeaderPageName.set('');
    }
  }

  // ── Viewport Menu ─────────────────────────────────────────

  toggleViewportMenu(): void {
    this.isViewportMenuOpen.update((open) => !open);
  }

  closeViewportMenu(): void {
    this.isViewportMenuOpen.set(false);
  }

  applyViewportPreset(preset: CanvasPageViewportPreset): void {
    const option = this.viewportPresetOptions.find((entry) => entry.id === preset);
    if (!option) {
      return;
    }

    this.runWithHistory(() => {
      this.editorState.updateCurrentPage((page) => ({
        ...page,
        viewportPreset: preset,
        viewportWidth: option.width,
        viewportHeight: option.height,
      }));
    });

    this.closeViewportMenu();
  }

  updateCustomViewportWidth(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.runWithHistory(() => {
      this.editorState.updateCurrentPage((page) => ({
        ...page,
        viewportPreset: 'custom',
        viewportWidth: this.normalizeViewportSize(parsed, this.currentViewportWidth()),
      }));
    });
  }

  updateCustomViewportWidthFromEvent(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.updateCustomViewportWidth(value);
  }

  updateCustomViewportHeight(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.runWithHistory(() => {
      this.editorState.updateCurrentPage((page) => ({
        ...page,
        viewportPreset: 'custom',
        viewportHeight: this.normalizeViewportSize(parsed, this.currentViewportHeight()),
      }));
    });
  }

  updateCustomViewportHeightFromEvent(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.updateCustomViewportHeight(value);
  }

  // ── Device Frame Menu ─────────────────────────────────────

  openDeviceFrameMenu(event: MouseEvent, pageId?: string): void {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      return;
    }

    const bounds = target.getBoundingClientRect();
    this.openDeviceFrameMenuAt(bounds.left, bounds.bottom, pageId);
  }

  openDeviceFrameMenuAt(screenX: number, screenBottom: number, pageId?: string): void {
    const targetId = pageId ?? this.editorState.currentPageId();
    this.deviceMenuTargetPageId.set(targetId);
    const targetPage = targetId ? this.getPageById(targetId) : null;
    const rootFrames = targetPage?.elements.filter((e) => e.type === 'frame' && !e.parentId) ?? [];
    const hasMobile = rootFrames.some((f) => (f.name ?? '').toLowerCase().startsWith('mobile'));
    const hasTablet = rootFrames.some((f) => (f.name ?? '').toLowerCase().startsWith('tablet'));
    this.deviceMenuItems.set([
      {
        id: 'device-mobile',
        label: 'Mobile',
        disabled: hasMobile,
        action: () => this.addDeviceFrame('mobile'),
      },
      {
        id: 'device-tablet',
        label: 'Tablet',
        disabled: hasTablet,
        action: () => this.addDeviceFrame('tablet'),
      },
      {
        id: 'device-custom',
        label: 'Custom...',
        action: () => this.addDeviceFrame('custom'),
      },
    ]);
    this.deviceMenuX.set(Math.round(screenX));
    this.deviceMenuY.set(Math.round(screenBottom + 6));
    this.isDeviceMenuOpen.set(true);
  }

  closeDeviceFrameMenu(clearTarget = true): void {
    this.isDeviceMenuOpen.set(false);
    this.deviceMenuItems.set([]);
    if (clearTarget) {
      this.deviceMenuTargetPageId.set(null);
    }
  }

  addDeviceFrame(preset: DeviceFramePreset): void {
    const targetPageId = this.deviceMenuTargetPageId() ?? this.editorState.currentPageId();
    if (!targetPageId) {
      this.closeDeviceFrameMenu();
      return;
    }

    if (preset === 'custom') {
      this.closeDeviceFrameMenu(false);
      this.openCustomFrameDialog();
      return;
    }

    this.closeDeviceFrameMenu();

    const option = this.deviceFrameOptions.find((entry) => entry.id === preset);
    if (!option) {
      return;
    }

    const desktopFrame = this.getDesktopFrameForPage(targetPageId);
    const forcedHeight = desktopFrame
      ? desktopFrame.height
      : this.normalizeViewportSize(this.getPageById(targetPageId)?.viewportHeight, option.height);
    const forcedY = desktopFrame ? desktopFrame.y : 0;

    this.insertFrameIntoPage(targetPageId, option.label, option.width, option.height, {
      forcedHeight,
      forcedY,
    });
  }

  // ── Custom Frame Dialog ───────────────────────────────────

  openCustomFrameDialog(): void {
    this.customFrameWidth.set(480);
    this.customFrameHeight.set(800);
    this.isCustomFrameDialogOpen.set(true);
  }

  closeCustomFrameDialog(): void {
    this.isCustomFrameDialogOpen.set(false);
  }

  onCustomFrameWidthInput(event: Event): void {
    const value = Number.parseInt((event.target as HTMLInputElement | null)?.value ?? '', 10);
    if (!Number.isFinite(value)) {
      return;
    }
    this.customFrameWidth.set(this.normalizeViewportSize(value, this.customFrameWidth()));
  }

  onCustomFrameHeightInput(event: Event): void {
    const value = Number.parseInt((event.target as HTMLInputElement | null)?.value ?? '', 10);
    if (!Number.isFinite(value)) {
      return;
    }
    this.customFrameHeight.set(this.normalizeViewportSize(value, this.customFrameHeight()));
  }

  submitCustomFrameDialog(): void {
    const targetPageId = this.deviceMenuTargetPageId() ?? this.editorState.currentPageId();
    if (targetPageId) {
      this.insertFrameIntoPage(
        targetPageId,
        'Custom',
        this.customFrameWidth(),
        this.customFrameHeight(),
      );
    }
    this.deviceMenuTargetPageId.set(null);
    this.closeCustomFrameDialog();
  }

  onCustomFrameDialogPrimary(values: Record<string, string>): void {
    const width = Number.parseInt(values['width'] ?? '', 10);
    const height = Number.parseInt(values['height'] ?? '', 10);

    if (Number.isFinite(width)) {
      this.customFrameWidth.set(this.normalizeViewportSize(width, this.customFrameWidth()));
    }

    if (Number.isFinite(height)) {
      this.customFrameHeight.set(this.normalizeViewportSize(height, this.customFrameHeight()));
    }

    this.submitCustomFrameDialog();
  }

  // ── Preview ───────────────────────────────────────────────

  openPreview(projectId: string): void {
    const currentPageId = this.editorState.currentPageId();
    const urlTree = this.router.createUrlTree(['project', projectId, 'preview'], {
      queryParams: currentPageId ? { pageId: currentPageId } : undefined,
    });
    const url = this.router.serializeUrl(urlTree);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  openPreviewForPage(projectId: string, pageId: string): void {
    const urlTree = this.router.createUrlTree(['project', projectId, 'preview'], {
      queryParams: { pageId },
    });
    const url = this.router.serializeUrl(urlTree);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Page Queries ──────────────────────────────────────────

  getPageById(pageId: string): CanvasPageModel | null {
    return this.editorState.pages().find((page) => page.id === pageId) ?? null;
  }

  getPageLayoutById(pageId: string): PageCanvasLayout | null {
    return this.pageLayouts().find((layout) => layout.pageId === pageId) ?? null;
  }

  // ── Focus ─────────────────────────────────────────────────

  focusPageSmooth(pageId: string, canvasElement: HTMLElement | null): void {
    if (!canvasElement) {
      return;
    }

    // Use shell bounds so all device frames are visible
    const layouts = this.pageLayouts();
    const shellLeft = this.layout.getPageShellLeft(pageId, layouts);
    const shellTop = this.layout.getPageShellTop(pageId, layouts) - PAGE_SHELL_HEADER_HEIGHT - 8;
    const shellWidth = this.layout.getPageShellWidth(pageId, layouts);
    const shellHeight =
      this.layout.getPageShellHeight(pageId, layouts) + PAGE_SHELL_HEADER_HEIGHT + 8;

    if (!shellWidth || !shellHeight) {
      return;
    }

    // Insets for the overlapping panels so focused content is not hidden behind them
    const leftInset = 316; // project-panel: 12 + 280 + 24 gap
    const rightInset = 316; // properties-panel: 12 + 280 + 24 gap
    const topInset = 84; // header: 60 + 24 margin
    const bottomInset = 24;

    const safeWidth = canvasElement.clientWidth - leftInset - rightInset;
    const safeHeight = canvasElement.clientHeight - topInset - bottomInset;
    const safeCenterX = leftInset + safeWidth / 2;
    const safeCenterY = topInset + safeHeight / 2;

    const padding = 40;
    const minSize = 24;
    const horizontalZoom = (safeWidth - padding) / Math.max(shellWidth, minSize);
    const verticalZoom = (safeHeight - padding) / Math.max(shellHeight, minSize);
    const targetZoom = clamp(
      Math.min(horizontalZoom, verticalZoom),
      CANVAS_MIN_ZOOM,
      CANVAS_MAX_ZOOM,
    );
    const targetOffset: Point = {
      x: roundToTwoDecimals(safeCenterX - (shellLeft + shellWidth / 2) * targetZoom),
      y: roundToTwoDecimals(safeCenterY - (shellTop + shellHeight / 2) * targetZoom),
    };

    const startZoom = this.viewport.zoomLevel();
    const startOffset = this.viewport.viewportOffset();
    const durationMs = 240;
    const startTs = performance.now();

    const animate = (now: number) => {
      const t = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      const zoom = startZoom + (targetZoom - startZoom) * eased;
      const x = startOffset.x + (targetOffset.x - startOffset.x) * eased;
      const y = startOffset.y + (targetOffset.y - startOffset.y) * eased;

      this.viewport.zoomLevel.set(roundToTwoDecimals(zoom));
      this.viewport.viewportOffset.set({
        x: roundToTwoDecimals(x),
        y: roundToTwoDecimals(y),
      });

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  // ── Utility ───────────────────────────────────────────────

  normalizeViewportSize(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(MIN_CUSTOM_VIEWPORT_SIZE, Math.round(value));
  }

  // ── Private Helpers ───────────────────────────────────────

  private runWithHistory(action: () => void): void {
    this.history.runWithHistory(() => this.editorState.createHistorySnapshot(), action);
  }

  private applyPageSelection(pageId: string, shouldFocus: boolean): void {
    if (pageId !== this.editorState.currentPageId()) {
      this.editorState.currentPageId.set(pageId);
    }

    this.clearSelectedPageLayer();
    this.closeViewportMenu();
    this.closeDeviceFrameMenu();
    this.layersFocusedPageId.set(pageId);
    this.editorState.selectedElementId.set(null);
    this.editorState.currentTool.set('select');

    if (shouldFocus) {
      this.focusPageSmooth(pageId, this.getCanvasElement());
    }
  }

  private getNextPageCanvasPosition(): Point {
    const layouts = this.pageLayouts();
    if (layouts.length === 0) {
      return { x: 0, y: 0 };
    }

    const rightMost = layouts.reduce((acc, layout) => {
      const currentRight = layout.x + layout.width;
      const bestRight = acc.x + acc.width;
      return currentRight > bestRight ? layout : acc;
    }, layouts[0]);

    return {
      x: Math.round(rightMost.x + rightMost.width + PAGE_CANVAS_GAP),
      y: Math.round(rightMost.y),
    };
  }

  private clonePageElements(elements: CanvasElement[]): CanvasElement[] {
    const idMap = new Map<string, string>();
    for (const element of elements) {
      idMap.set(element.id, crypto.randomUUID());
    }

    return elements.map((element) => ({
      ...element,
      id: idMap.get(element.id) ?? crypto.randomUUID(),
      parentId: element.parentId ? (idMap.get(element.parentId) ?? null) : null,
      primarySyncId: element.primarySyncId ? idMap.get(element.primarySyncId) : undefined,
    }));
  }

  private getNextDuplicatedPageName(sourceName: string): string {
    const trimmed = sourceName.trim() || 'Page';
    const baseName = `${trimmed} Copy`;
    const names = new Set(this.editorState.pages().map((page) => page.name.trim().toLowerCase()));

    if (!names.has(baseName.toLowerCase())) {
      return baseName;
    }

    let suffix = 2;
    while (names.has(`${baseName} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }

    return `${baseName} ${suffix}`;
  }

  private commitCanvasHeaderPageRename(pageId: string): void {
    if (this.editingCanvasHeaderPageId() !== pageId) {
      return;
    }

    const trimmed = this.editingCanvasHeaderPageName().trim();
    if (trimmed) {
      this.onPageNameChanged({ id: pageId, name: trimmed });
      return;
    }

    this.editingCanvasHeaderPageId.set(null);
    this.editingCanvasHeaderPageName.set('');
  }

  private insertFrameIntoPage(
    pageId: string,
    name: string,
    width: number,
    height: number,
    options?: {
      forcedHeight?: number;
      forcedY?: number;
    },
  ): void {
    const normalizedWidth = this.normalizeViewportSize(width, 1280);
    const normalizedHeight = this.normalizeViewportSize(
      options?.forcedHeight ?? height,
      options?.forcedHeight ?? 720,
    );
    const page = this.getPageById(pageId);
    if (!page) {
      return;
    }

    this.runWithHistory(() => {
      const currentElements = page.elements;
      const position = this.el.getNextFramePosition(
        currentElements,
        normalizedWidth,
        normalizedHeight,
      );
      const frame = this.el.createFrameAtCenter(
        {
          x: position?.x ?? 80 + normalizedWidth / 2,
          y:
            options?.forcedY != null
              ? options.forcedY + normalizedHeight / 2
              : (position?.y ?? 60 + normalizedHeight / 2),
        },
        normalizedWidth,
        normalizedHeight,
        name,
        currentElements,
      );
      frame.name = name;

      if (options?.forcedY != null) {
        frame.y = roundToTwoDecimals(options.forcedY);
      }

      this.editorState.updatePageElements(pageId, (elements) => {
        return this.populateNewRootFrameFromPrimary(frame, [...elements, frame]);
      });
      if (this.editorState.currentPageId() === pageId) {
        this.editorState.selectedElementId.set(frame.id);
      }
      this.editorState.currentTool.set('select');
    });
  }

  private getDesktopFrameForPage(pageId: string): CanvasElement | null {
    const page = this.getPageById(pageId);
    if (!page) {
      return null;
    }

    return (
      page.elements.find(
        (element) =>
          element.type === 'frame' && !element.parentId && getFrameTitle(element) === 'Desktop',
      ) ??
      page.elements.find((element) => element.type === 'frame' && !element.parentId) ??
      null
    );
  }

  private getPrimaryFrame(elements: CanvasElement[]): CanvasElement | null {
    const rootFrames = elements.filter((el) => el.type === 'frame' && !el.parentId);
    return (
      rootFrames.find((el) => el.isPrimary) ??
      rootFrames.find((el) => el.name?.toLowerCase() === 'desktop') ??
      rootFrames[0] ??
      null
    );
  }

  private populateNewRootFrameFromPrimary(
    targetFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const primaryFrame = this.getPrimaryFrame(elements);
    if (!primaryFrame || primaryFrame.id === targetFrame.id) {
      return elements;
    }

    let nextElements = this.syncRootFrameFromPrimary(primaryFrame, targetFrame, elements);
    const nextTargetFrame =
      nextElements.find((element) => element.id === targetFrame.id) ?? targetFrame;
    const createdBySourceId = new Map<string, CanvasElement>();
    const sourceElements = elements
      .filter(
        (element) =>
          !element.primarySyncId &&
          this.isElementWithinPrimaryFrame(element, elements, primaryFrame.id),
      )
      .sort(
        (left, right) =>
          this.getElementNestingDepth(left, elements) -
          this.getElementNestingDepth(right, elements),
      );

    for (const sourceElement of sourceElements) {
      if (!sourceElement.parentId) {
        continue;
      }

      const sourceParent = this.el.findElementById(sourceElement.parentId, elements);
      if (!sourceParent) {
        continue;
      }

      const targetParent =
        sourceElement.parentId === primaryFrame.id
          ? nextTargetFrame
          : (createdBySourceId.get(sourceElement.parentId) ?? null);
      if (!targetParent) {
        continue;
      }

      const syncedElement = this.buildSyncedElementFromSource(
        sourceElement,
        sourceParent,
        targetParent,
        nextElements,
      );

      nextElements = [...nextElements, syncedElement];
      createdBySourceId.set(sourceElement.id, syncedElement);
    }

    return nextElements;
  }

  private syncRootFrameFromPrimary(
    primaryFrame: CanvasElement,
    targetFrame: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement[] {
    const syncedFrame: CanvasElement = {
      ...primaryFrame,
      id: targetFrame.id,
      name: targetFrame.name,
      x: targetFrame.x,
      y: targetFrame.y,
      width: targetFrame.width,
      height: targetFrame.height,
      parentId: null,
      isPrimary: false,
      primarySyncId: undefined,
    };

    return elements.map((element) => (element.id === targetFrame.id ? syncedFrame : element));
  }

  private buildSyncedElementFromSource(
    sourceElement: CanvasElement,
    sourceParent: CanvasElement,
    targetParent: CanvasElement,
    elements: CanvasElement[],
  ): CanvasElement {
    const scaleX = sourceParent.width > 0 ? targetParent.width / sourceParent.width : 1;
    const scaleY = sourceParent.height > 0 ? targetParent.height / sourceParent.height : 1;
    const shouldScalePosition =
      !this.isLayoutContainer(targetParent) || !this.isChildInFlow(sourceElement);
    const syncedSize = this.getSyncedElementSize(sourceElement, scaleX, scaleY);
    const syncedElement: CanvasElement = {
      ...sourceElement,
      id: crypto.randomUUID(),
      parentId: targetParent.id,
      primarySyncId: sourceElement.id,
      isPrimary: false,
      x: shouldScalePosition ? roundToTwoDecimals(sourceElement.x * scaleX) : 0,
      y: shouldScalePosition ? roundToTwoDecimals(sourceElement.y * scaleY) : 0,
      width: syncedSize.width,
      height: syncedSize.height,
    };

    mutateNormalizeElement(syncedElement, elements);
    return syncedElement;
  }

  private getSyncedElementSize(
    sourceElement: CanvasElement,
    scaleX: number,
    scaleY: number,
  ): { width: number; height: number } {
    let width = this.getSyncedAxisSize(sourceElement.width, sourceElement.widthMode, scaleX);
    let height = this.getSyncedAxisSize(sourceElement.height, sourceElement.heightMode, scaleY);
    const sourceAspectRatio =
      sourceElement.width > 0 && sourceElement.height > 0
        ? sourceElement.width / sourceElement.height
        : null;

    if (sourceAspectRatio && sourceAspectRatio > 0) {
      if (sourceElement.widthMode === 'fit-image') {
        width = roundToTwoDecimals(height * sourceAspectRatio);
      }

      if (sourceElement.heightMode === 'fit-image') {
        height = roundToTwoDecimals(width / sourceAspectRatio);
      }
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  private isLayoutContainer(element: CanvasElement): boolean {
    return !!element.display && (element.type === 'frame' || element.type === 'rectangle');
  }

  private isChildInFlow(element: CanvasElement): boolean {
    const position = element.position;
    return !position || position === 'static' || position === 'relative' || position === 'sticky';
  }

  private isElementWithinPrimaryFrame(
    element: CanvasElement,
    elements: CanvasElement[],
    primaryFrameId: string,
  ): boolean {
    let parentId = element.parentId ?? null;

    while (parentId) {
      if (parentId === primaryFrameId) {
        return true;
      }

      parentId = this.el.findElementById(parentId, elements)?.parentId ?? null;
    }

    return false;
  }

  private getElementNestingDepth(element: CanvasElement, elements: CanvasElement[]): number {
    let depth = 0;
    let parentId = element.parentId ?? null;

    while (parentId) {
      const parent = this.el.findElementById(parentId, elements);
      if (!parent) {
        break;
      }

      depth += 1;
      parentId = parent.parentId ?? null;
    }

    return depth;
  }

  private scaleAxisValue(value: number | undefined, scale: number): number | undefined {
    if (typeof value !== 'number') {
      return value;
    }

    return roundToTwoDecimals(value * scale);
  }

  private getSyncedAxisSize(
    value: number,
    mode: CanvasElement['widthMode'] | CanvasElement['heightMode'] | undefined,
    scale: number,
  ): number {
    if ((mode ?? 'fixed') === 'fixed') {
      return roundToTwoDecimals(value);
    }

    return roundToTwoDecimals(value * scale);
  }

  private scaleScalarValue(value: number | undefined, scale: number): number | undefined {
    if (typeof value !== 'number') {
      return value;
    }

    return roundToTwoDecimals(value * scale);
  }

  private scaleSpacing(
    spacing: CanvasElement['padding'] | CanvasElement['margin'],
    scaleX: number,
    scaleY: number,
  ): CanvasElement['padding'] | CanvasElement['margin'] {
    if (!spacing) {
      return spacing;
    }

    return {
      top: roundToTwoDecimals(spacing.top * scaleY),
      right: roundToTwoDecimals(spacing.right * scaleX),
      bottom: roundToTwoDecimals(spacing.bottom * scaleY),
      left: roundToTwoDecimals(spacing.left * scaleX),
    };
  }

  private scaleCornerRadii(
    radii: CanvasElement['cornerRadii'],
    scale: number,
  ): CanvasElement['cornerRadii'] {
    if (!radii) {
      return radii;
    }

    return {
      topLeft: roundToTwoDecimals(radii.topLeft * scale),
      topRight: roundToTwoDecimals(radii.topRight * scale),
      bottomRight: roundToTwoDecimals(radii.bottomRight * scale),
      bottomLeft: roundToTwoDecimals(radii.bottomLeft * scale),
    };
  }

  /** Used internally by applyPageSelection — requires canvas DOM reference. */
  private getCanvasElement(): HTMLElement | null {
    // The canvas element reference is held by the component.
    // The service accesses it through focusPageSmooth's parameter.
    // For internal calls (applyPageSelection), we store it transiently.
    return this._canvasElement;
  }

  /** The component sets this so internal focus calls can reach the DOM. */
  private _canvasElement: HTMLElement | null = null;

  setCanvasElement(el: HTMLElement | null): void {
    this._canvasElement = el;
  }
}
