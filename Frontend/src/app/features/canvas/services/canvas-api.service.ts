import { Injectable, inject, signal, computed, Signal } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  buildCanvasProjectDocumentFromUnknown,
  buildPersistedCanvasDesign,
} from '../mappers/canvas-ir.mapper';
import {
  CanvasPageModel,
  CanvasProjectDocument,
  ConverterPageRequest,
  ConverterService,
  IRNode,
  ProjectDesignResponse,
  ProjectService,
  extractApiErrorMessage,
} from '@app/core';
import { withRoundedPrecision } from '../utils/canvas-interaction.util';
import { SupportedFramework } from '../canvas.types';

@Injectable()
export class CanvasPersistenceService {
  private readonly projectService = inject(ProjectService);

  loadProjectDesign(projectId: number): Observable<{
    pages: CanvasPageModel[];
    activePageId: string | null;
    updatedAt: string | null;
  }> {
    return this.projectService.getDesign(projectId).pipe(
      map((response) => {
        const parsedDesign = this.parseDesign(response.designJson);
        const projectDocument = buildCanvasProjectDocumentFromUnknown(
          parsedDesign,
          projectId.toString(),
        );

        return {
          pages: projectDocument.pages.map((page) => ({
            ...page,
            elements: page.elements.map((element) => withRoundedPrecision(element)),
          })),
          activePageId: projectDocument.activePageId,
          updatedAt: response.updatedAt ?? null,
        };
      }),
    );
  }

  saveProjectDesign(
    projectId: number,
    document: CanvasProjectDocument,
  ): Observable<ProjectDesignResponse> {
    const designJson = JSON.stringify(buildPersistedCanvasDesign(document));
    return this.projectService.saveDesign(projectId, { designJson });
  }

  saveProjectThumbnail(projectId: number, thumbnailDataUrl: string): Observable<void> {
    return this.projectService.saveThumbnail(projectId, thumbnailDataUrl);
  }

  private parseDesign(rawJson: string): unknown {
    if (!rawJson?.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as unknown;
    } catch {
      return null;
    }
  }
}

@Injectable()
export class CanvasGenerationService {
  private readonly converterService = inject(ConverterService);

  readonly selectedFramework = signal<SupportedFramework>('html');
  readonly validationResult = signal<boolean | null>(null);
  readonly isValidating = signal(false);
  readonly isGenerating = signal(false);
  readonly generatedHtml = signal('');
  readonly generatedCss = signal('');
  readonly error = signal<string | null>(null);

  setFramework(framework: SupportedFramework): void {
    this.selectedFramework.set(framework);
  }

  validate(pages: ConverterPageRequest[]): void {
    const ir = pages[0]?.ir;
    if (!ir) return;
    this.error.set(null);
    this.validationResult.set(null);
    this.isValidating.set(true);

    this.converterService.validate({ framework: this.selectedFramework(), ir }).subscribe({
      next: (response) => {
        this.validationResult.set(response.isValid);
        this.isValidating.set(false);
      },
      error: (err: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.error.set(extractApiErrorMessage(err, 'IR validation failed.'));
        this.isValidating.set(false);
      },
    });
  }

  generate(pages: ConverterPageRequest[]): void {
    if (pages.length === 0) return;
    this.error.set(null);
    this.generatedHtml.set('');
    this.generatedCss.set('');
    this.isGenerating.set(true);

    const request =
      pages.length === 1
        ? { framework: this.selectedFramework(), ir: pages[0].ir }
        : { framework: this.selectedFramework(), ir: pages[0].ir, pages };

    this.converterService.generate(request).subscribe({
      next: (response) => {
        this.generatedHtml.set(response.html);
        this.generatedCss.set(response.css);
        this.validationResult.set(response.isValid);
        this.isGenerating.set(false);
      },
      error: (err: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.error.set(extractApiErrorMessage(err, 'Code generation failed.'));
        this.isGenerating.set(false);
      },
    });
  }
}
