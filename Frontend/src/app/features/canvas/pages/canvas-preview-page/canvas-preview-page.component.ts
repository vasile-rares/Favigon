import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CanvasPageModel,
  ConverterService,
  ProjectService,
  extractApiErrorMessage,
} from '@app/core';
import { DropdownSelectComponent } from '../../../../shared/components/dropdown-select/dropdown-select.component';
import type { DropdownSelectOption } from '../../../../shared/components/dropdown-select/dropdown-select.component';
import { HeaderBarComponent } from '../../../../shared/components/header-bar/header-bar.component';
import { CanvasPersistenceService } from '../../services/canvas-persistence.service';
import { buildCanvasIRPages } from '../../mappers/canvas-to-ir.mapper';
import { VIEWPORT_PRESET_OPTIONS } from '../../canvas.types';
import { NumberInputComponent } from '../../components/properties-panel/number-input/number-input.component';

interface FrameSizeOption {
  label: string;
  width: number;
  height: number;
}

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap';

@Component({
  selector: 'app-canvas-preview-page',
  standalone: true,
  imports: [FormsModule, HeaderBarComponent, DropdownSelectComponent, NumberInputComponent],
  providers: [CanvasPersistenceService],
  templateUrl: './canvas-preview-page.component.html',
  styleUrl: './canvas-preview-page.component.css',
})
export class CanvasPreviewPage {
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasPersistenceService = inject(CanvasPersistenceService);
  private readonly converterService = inject(ConverterService);
  private readonly projectApiService = inject(ProjectService);

  private projectIdAsNumber = NaN;

  readonly pages = signal<CanvasPageModel[]>([]);
  readonly currentPageId = signal<string | null>(null);
  readonly selectedFrameIndex = signal(0);
  readonly isLoading = signal(false);
  readonly isGenerating = signal(false);
  readonly error = signal<string | null>(null);
  readonly pageSearchQuery = signal('');
  readonly isPageDropdownOpen = signal(false);

  readonly generatedHtml = signal('');
  readonly generatedCss = signal('');

  
  readonly resizeWidth = signal<number | null>(null);
  readonly resizeHeight = signal<number | null>(null);
  readonly isResizing = signal(false);

  private resizeDragAxis: 'right' | 'bottom' | 'corner' | null = null;
  private resizeDragStartX = 0;
  private resizeDragStartY = 0;
  private resizeDragStartW = 0;
  private resizeDragStartH = 0;
  private resizeMaxWidth = Infinity;
  private resizeMaxHeight = Infinity;

  private readonly onResizePointerMove = (e: PointerEvent): void => {
    const dx = e.clientX - this.resizeDragStartX;
    const dy = e.clientY - this.resizeDragStartY;

    if (this.resizeDragAxis === 'right' || this.resizeDragAxis === 'corner') {
      this.resizeWidth.set(
        Math.max(120, Math.min(this.resizeMaxWidth, Math.round(this.resizeDragStartW + 2 * dx))),
      );
    }
    if (this.resizeDragAxis === 'bottom' || this.resizeDragAxis === 'corner') {
      this.resizeHeight.set(
        Math.max(120, Math.min(this.resizeMaxHeight, Math.round(this.resizeDragStartH + 2 * dy))),
      );
    }
  };

  private readonly onResizePointerUp = (): void => {
    this.isResizing.set(false);
    this.resizeDragAxis = null;
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', this.onResizePointerMove);
    document.removeEventListener('pointerup', this.onResizePointerUp);
  };

  readonly projectSlug = this.route.snapshot.paramMap.get('slug') ?? '';

  readonly currentPage = computed<CanvasPageModel | null>(() => {
    const activePageId = this.currentPageId();
    if (!activePageId) {
      return this.pages()[0] ?? null;
    }

    return this.pages().find((page) => page.id === activePageId) ?? this.pages()[0] ?? null;
  });

  readonly frameSizeOptions = computed<FrameSizeOption[]>(() => {
    const page = this.currentPage();
    const options: FrameSizeOption[] = [];

    const elements = page?.elements ?? [];
    const rootFrames = elements.filter((el) => el.type === 'frame' && !el.parentId);
    for (const frame of rootFrames) {
      // frame.width is already border-box (content + padding)
      const w = Math.round(frame.width);
      const h = Math.round(frame.height);
      options.push({ label: frame.name || `Frame ${w}×${h}`, width: w, height: h });
    }

    if (options.length === 0) {
      for (const preset of VIEWPORT_PRESET_OPTIONS) {
        options.push({
          label: `${preset.label} (${preset.width}×${preset.height})`,
          width: preset.width,
          height: preset.height,
        });
      }
    }

    return options;
  });

  readonly selectedFrameSize = computed<FrameSizeOption | null>(() => {
    const options = this.frameSizeOptions();
    const idx = this.selectedFrameIndex();
    return options[idx] ?? options[0] ?? null;
  });

  readonly deviceSelectOptions = computed<DropdownSelectOption[]>(() => {
    return this.frameSizeOptions().map((option, index) => ({
      label: option.label,
      triggerLabel: option.label,
      value: index,
    }));
  });

  readonly viewportWidth = computed<number>(() => {
    const override = this.resizeWidth();
    if (override !== null) return override;
    const frame = this.selectedFrameSize();
    return frame ? frame.width : 1280;
  });

  readonly viewportHeight = computed<number>(() => {
    const override = this.resizeHeight();
    if (override !== null) return override;
    const frame = this.selectedFrameSize();
    return frame ? frame.height : 720;
  });

  
  readonly iframeSrcdoc = computed<SafeHtml>(() => {
    const html = this.generatedHtml();
    const css = this.generatedCss();

    if (!html && !css) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    return this.sanitizer.bypassSecurityTrustHtml(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: auto; }
${css}
</style>
</head>
<body>
${html}
</body>
</html>`);
  });

  readonly filteredPages = computed<CanvasPageModel[]>(() => {
    const query = this.pageSearchQuery().toLowerCase().trim();
    const allPages = this.pages();
    if (!query) {
      return allPages;
    }

    return allPages.filter((page) => page.name.toLowerCase().includes(query));
  });

  constructor() {
    this.loadPreview(this.route.snapshot.queryParamMap.get('pageId'));

    // Re-generate whenever the current page changes
    effect(() => {
      const page = this.currentPage();
      if (page && !this.isLoading()) {
        this.generateForCurrentPage();
      }
    });
  }

  goBack(): void {
    void this.router.navigate(['/project', this.projectSlug]);
  }

  onFrameSizeChange(index: number | string | boolean | null): void {
    const nextIndex = typeof index === 'number' ? index : Number(index);
    if (!Number.isFinite(nextIndex)) {
      return;
    }

    this.selectedFrameIndex.set(nextIndex);
    this.resizeWidth.set(null);
    this.resizeHeight.set(null);
  }

  onWidthInputChange(value: number): void {
    this.resizeWidth.set(
      Math.max(120, Math.min(this.getStageMaxViewportWidth(), Math.round(value))),
    );
  }

  onHeightInputChange(value: number): void {
    this.resizeHeight.set(
      Math.max(120, Math.min(this.getStageMaxViewportHeight(), Math.round(value))),
    );
  }

  onResizeHandlePointerDown(event: PointerEvent, axis: 'right' | 'bottom' | 'corner'): void {
    event.preventDefault();
    this.resizeDragAxis = axis;
    this.resizeDragStartX = event.clientX;
    this.resizeDragStartY = event.clientY;
    this.resizeDragStartW = this.viewportWidth();
    this.resizeDragStartH = this.viewportHeight();
    this.isResizing.set(true);

    document.body.style.cursor = axis === 'bottom' ? 'ns-resize' : 'ew-resize';

    if (axis === 'right' || axis === 'corner') {
      this.resizeMaxWidth = this.getStageMaxViewportWidth();
    }

    if (axis === 'bottom' || axis === 'corner') {
      const stageEl = this.stageRef()?.nativeElement;
      if (stageEl) {
        const stageRect = stageEl.getBoundingClientRect();
        // Stage is center-aligned; max viewport height = stage height minus padding on both sides.
        // The 2× factor in onResizePointerMove means the limit is symmetric around the center.
        const stagePadding = 24; // matches .preview-stage padding (1.5rem)
        this.resizeMaxHeight = Math.max(120, stageRect.height - stagePadding * 2);
      } else {
        this.resizeMaxHeight = Infinity;
      }
    }

    document.addEventListener('pointermove', this.onResizePointerMove);
    document.addEventListener('pointerup', this.onResizePointerUp);
  }

  selectPage(pageId: string): void {
    this.currentPageId.set(pageId);
    this.selectedFrameIndex.set(0);
    this.isPageDropdownOpen.set(false);
    this.pageSearchQuery.set('');
    this.syncQueryPage(pageId);
  }

  onSearchInput(value: string): void {
    this.pageSearchQuery.set(value);
    this.isPageDropdownOpen.set(true);
  }

  onSearchFocus(): void {
    this.isPageDropdownOpen.set(true);
  }

  onSearchBlur(): void {
    setTimeout(() => this.isPageDropdownOpen.set(false), 180);
  }

  refreshPreview(): void {
    this.loadPreview(this.currentPageId());
  }

  getStageMaxViewportHeight(): number {
    const stageEl = this.stageRef()?.nativeElement;
    if (!stageEl) {
      return Number.POSITIVE_INFINITY;
    }

    const stagePadding = 24;
    return Math.max(120, stageEl.getBoundingClientRect().height - stagePadding * 2);
  }

  getStageMaxViewportWidth(): number {
    const stageEl = this.stageRef()?.nativeElement;
    if (!stageEl) {
      return Number.POSITIVE_INFINITY;
    }

    const stagePadding = 24;
    return Math.max(120, stageEl.getBoundingClientRect().width - stagePadding * 2);
  }

  private generateForCurrentPage(): void {
    const page = this.currentPage();
    if (!page || page.elements.length === 0) {
      this.generatedHtml.set('');
      this.generatedCss.set('');
      return;
    }

    const irPages = buildCanvasIRPages([page], this.projectSlug);
    if (irPages.length === 0) {
      this.generatedHtml.set('');
      this.generatedCss.set('');
      return;
    }

    this.isGenerating.set(true);
    this.error.set(null);

    const request = {
      framework: 'html',
      pages: irPages,
    };

    // Use generate for responsive HTML+CSS (single response)
    if (irPages.length > 1) {
      this.converterService
        .generate(request)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.generatedHtml.set(response.html);
            this.generatedCss.set(response.css);
            this.isGenerating.set(false);
          },
          error: (err: unknown) => {
            this.error.set(extractApiErrorMessage(err, 'Failed to generate preview.'));
            this.isGenerating.set(false);
          },
        });
    } else {
      this.converterService
        .generate({ framework: 'html', ir: irPages[0].ir })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.generatedHtml.set(response.html);
            this.generatedCss.set(response.css);
            this.isGenerating.set(false);
          },
          error: (err: unknown) => {
            this.error.set(extractApiErrorMessage(err, 'Failed to generate preview.'));
            this.isGenerating.set(false);
          },
        });
    }
  }

  private loadPreview(requestedPageId: string | null): void {
    if (!this.projectSlug) {
      this.error.set('Invalid project.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.projectApiService
      .getBySlug(this.projectSlug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.projectIdAsNumber = project.projectId;
          this.canvasPersistenceService
            .loadProjectDesign(this.projectIdAsNumber)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (design) => {
                this.pages.set(design.pages);

                const preferredPageId =
                  requestedPageId && design.pages.some((page) => page.id === requestedPageId)
                    ? requestedPageId
                    : design.activePageId;

                this.currentPageId.set(preferredPageId ?? design.pages[0]?.id ?? null);
                this.selectedFrameIndex.set(0);
                this.isLoading.set(false);
              },
              error: (error: unknown) => {
                this.error.set(extractApiErrorMessage(error, 'Failed to load preview.'));
                this.isLoading.set(false);
              },
            });
        },
        error: (error: unknown) => {
          this.error.set(extractApiErrorMessage(error, 'Project not found.'));
          this.isLoading.set(false);
        },
      });
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
