import { Injectable, inject, signal } from '@angular/core';
import {
  ConverterPageRequest,
  ConverterService,
  GeneratedFile,
  extractApiErrorMessage,
} from '@app/core';
import { SupportedFramework } from '../canvas.types';

@Injectable()
export class CanvasGenerationService {
  private readonly converterService = inject(ConverterService);

  readonly selectedFramework = signal<SupportedFramework>('html');
  readonly validationResult = signal<boolean | null>(null);
  readonly isValidating = signal(false);
  readonly isGenerating = signal(false);
  readonly generatedHtml = signal('');
  readonly generatedCss = signal('');
  readonly generatedFiles = signal<GeneratedFile[]>([]);
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
    this.generatedFiles.set([]);
    this.isGenerating.set(true);

    const request = { framework: this.selectedFramework(), pages };

    this.converterService.generateFiles(request).subscribe({
      next: (response) => {
        this.generatedFiles.set(response.files);
        this.validationResult.set(response.isValid);

        const firstHtml = response.files.find(
          (f) => f.path.endsWith('.html') || f.path.endsWith('.jsx'),
        );
        const firstCss = response.files.find((f) => f.path.endsWith('.css'));
        this.generatedHtml.set(firstHtml?.content ?? '');
        this.generatedCss.set(firstCss?.content ?? '');

        this.isGenerating.set(false);
      },
      error: (err: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.error.set(extractApiErrorMessage(err, 'Code generation failed.'));
        this.isGenerating.set(false);
      },
    });
  }
}
