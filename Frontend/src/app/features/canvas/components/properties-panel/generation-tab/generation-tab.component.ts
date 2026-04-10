import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { GeneratedFile, IRNode } from '@app/core';
import { SupportedFramework } from '../../../canvas.types';
import JSZip from 'jszip';

type CopyKind = 'current' | 'ir';

@Component({
  selector: 'app-generation-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './generation-tab.component.html',
  styleUrl: './generation-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class GenerationTabComponent implements OnChanges, OnDestroy {
  @Input() selectedFramework: SupportedFramework = 'html';
  @Input() validationResult: boolean | null = null;
  @Input() apiError: string | null = null;
  @Input() isValidating = false;
  @Input() isGenerating = false;
  @Input() generatedHtml = '';
  @Input() generatedCss = '';
  @Input() generatedFiles: GeneratedFile[] = [];
  @Input() irPreview: IRNode | null = null;

  @Output() frameworkChanged = new EventEmitter<SupportedFramework>();
  @Output() validateRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();

  activeFileIndex = 0;
  copiedKind: CopyKind | null = null;
  highlightedCode = '';
  highlightedIr = '';

  private copyResetTimer: number | null = null;

  readonly frameworkOptions: ReadonlyArray<{
    value: SupportedFramework;
    label: string;
  }> = [
    { value: 'html', label: 'HTML' },
    { value: 'react', label: 'React' },
    { value: 'angular', label: 'Angular' },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['generatedFiles']) {
      if (this.activeFileIndex >= this.generatedFiles.length) {
        this.activeFileIndex = 0;
      }
      this.refreshHighlightedCode();
    }
    if (changes['irPreview']) {
      this.highlightedIr = this.highlightJson(
        this.irPreview ? JSON.stringify(this.irPreview, null, 2) : '',
      );
    }
  }

  ngOnDestroy(): void {
    if (this.copyResetTimer !== null) {
      window.clearTimeout(this.copyResetTimer);
    }
  }

  selectFramework(framework: SupportedFramework): void {
    if (framework === this.selectedFramework) {
      return;
    }

    this.frameworkChanged.emit(framework);
  }

  selectFile(index: number): void {
    if (index >= 0 && index < this.generatedFiles.length) {
      this.activeFileIndex = index;
      this.refreshHighlightedCode();
    }
  }

  hasGeneratedCode(): boolean {
    return this.generatedFiles.length > 0;
  }

  getActiveFile(): GeneratedFile | null {
    return this.generatedFiles[this.activeFileIndex] ?? null;
  }

  getActiveFileContent(): string {
    return this.getActiveFile()?.content ?? '';
  }

  getActiveFilePath(): string {
    return this.getActiveFile()?.path ?? '';
  }

  getActiveFileName(): string {
    const path = this.getActiveFilePath();
    return path.split('/').pop() ?? path;
  }

  getFileIcon(path: string): string {
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.ts')) return 'ts';
    return 'file';
  }

  getStatusTone(): 'idle' | 'working' | 'success' | 'error' {
    if (this.apiError || this.validationResult === false) {
      return 'error';
    }

    if (this.isValidating || this.isGenerating) {
      return 'working';
    }

    if (this.hasGeneratedCode() || this.validationResult === true) {
      return 'success';
    }

    return 'idle';
  }

  getStatusLabel(): string {
    if (this.apiError) {
      return 'Generation failed';
    }

    if (this.isGenerating) {
      return 'Generating code';
    }

    if (this.isValidating) {
      return 'Checking IR';
    }

    if (this.validationResult === false) {
      return 'IR needs attention';
    }

    if (this.hasGeneratedCode()) {
      return `${this.generatedFiles.length} files ready`;
    }

    if (this.validationResult === true) {
      return 'IR ready';
    }

    return 'Ready to generate';
  }

  getStatusHint(): string {
    if (this.apiError) {
      return this.apiError;
    }

    if (this.hasGeneratedCode()) {
      return 'Click a file to preview. Save individually or download all as ZIP.';
    }

    return 'Validate first if you want a quick structural check.';
  }

  getCopyButtonLabel(kind: CopyKind): string {
    if (this.copiedKind === kind) {
      return 'Copied';
    }

    return kind === 'ir' ? 'Copy IR' : 'Copy';
  }

  lineCount(value: string): number {
    if (!value.trim()) {
      return 0;
    }

    return value.split(/\r?\n/).length;
  }

  copy(kind: CopyKind): void {
    const value =
      kind === 'ir'
        ? this.irPreview
          ? JSON.stringify(this.irPreview, null, 2)
          : ''
        : this.getActiveFileContent();
    if (!value) {
      return;
    }

    void this.writeToClipboard(value).then(() => {
      this.copiedKind = kind;

      if (this.copyResetTimer !== null) {
        window.clearTimeout(this.copyResetTimer);
      }

      this.copyResetTimer = window.setTimeout(() => {
        this.copiedKind = null;
        this.copyResetTimer = null;
      }, 1400);
    });
  }

  exportCurrentFile(): void {
    const file = this.getActiveFile();
    if (!file) return;

    const mimeType = file.path.endsWith('.css')
      ? 'text/css;charset=utf-8'
      : file.path.endsWith('.html')
        ? 'text/html;charset=utf-8'
        : file.path.endsWith('.json')
          ? 'application/json;charset=utf-8'
          : 'text/plain;charset=utf-8';
    this.downloadBlob(file.content, this.getActiveFileName(), mimeType);
  }

  async exportAsZip(): Promise<void> {
    if (this.generatedFiles.length === 0) return;

    const zip = new JSZip();
    for (const file of this.generatedFiles) {
      zip.file(file.path, file.content);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(blob, 'generated-project.zip', 'application/zip');
  }

  private downloadBlob(content: string | Blob, fileName: string, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private refreshHighlightedCode(): void {
    const file = this.getActiveFile();
    if (!file) {
      this.highlightedCode = '';
      return;
    }

    const path = file.path;
    if (path.endsWith('.css')) {
      this.highlightedCode = this.highlightCss(file.content);
    } else if (path.endsWith('.json')) {
      this.highlightedCode = this.highlightJson(file.content);
    } else if (path.endsWith('.html') || path.endsWith('.jsx')) {
      this.highlightedCode = this.highlightMarkup(file.content);
    } else if (path.endsWith('.ts')) {
      this.highlightedCode = this.highlightMarkup(file.content);
    } else {
      this.highlightedCode = this.escapeHtml(file.content);
    }
  }

  private highlightMarkup(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .split(/\r?\n/)
      .map((line) => {
        if (!line.trim()) {
          return '';
        }

        if (line.includes('&lt;!--')) {
          return line.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>');
        }

        return line.replace(
          /(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
          (_match, open, tag, attrs, close) => {
            const highlightedAttrs = attrs.replace(
              /([\[\]\(\)\*#:@A-Za-z_][\w\-.:\[\]\(\)\*#@]*)(\s*=\s*)("[^"]*"|'[^']*')/g,
              '<span class="token-attr-name">$1</span>$2<span class="token-string">$3</span>',
            );

            return `<span class="token-punctuation">${open}</span><span class="token-tag">${tag}</span>${highlightedAttrs}<span class="token-punctuation">${close}</span>`;
          },
        );
      })
      .join('\n');
  }

  private highlightCss(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .split(/\r?\n/)
      .map((line) => this.highlightCssLine(line))
      .join('\n');
  }

  private highlightCssLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.startsWith('/*')) {
      return `<span class="token-comment">${line}</span>`;
    }

    if (trimmed === '}') {
      return line.replace('}', '<span class="token-punctuation">}</span>');
    }

    if (trimmed.startsWith('@')) {
      return line
        .replace(/(@[\w-]+)/, '<span class="token-at-rule">$1</span>')
        .replace(/(\([^)]*\))/, '<span class="token-condition">$1</span>')
        .replace('{', '<span class="token-punctuation">{</span>');
    }

    const propertyMatch = line.match(/^(\s*)([a-z-]+)(\s*:\s*)(.*?)(;\s*)?$/);
    if (propertyMatch) {
      const [, indent, property, separator, value, suffix = ''] = propertyMatch;
      const highlightedSuffix = suffix.includes(';')
        ? suffix.replace(';', '<span class="token-punctuation">;</span>')
        : suffix;

      return `${indent}<span class="token-property">${property}</span>${separator}${this.highlightCssValue(value)}${highlightedSuffix}`;
    }

    if (line.includes('{')) {
      const braceIndex = line.indexOf('{');
      const selector = line.slice(0, braceIndex);
      const rest = line.slice(braceIndex + 1);
      return `<span class="token-selector">${selector}</span><span class="token-punctuation">{</span>${rest}`;
    }

    return line;
  }

  private highlightCssValue(value: string): string {
    const stashes: string[] = [];
    let result = value;

    result = this.stashMatches(
      result,
      /("(?:\\.|[^"])*"|'(?:\\.|[^'])*')/g,
      stashes,
      (match) => `<span class="token-string">${match}</span>`,
    );

    result = this.stashMatches(
      result,
      /(#[0-9a-fA-F]{3,8})/g,
      stashes,
      (match) => `<span class="token-color">${match}</span>`,
    );

    result = result
      .replace(/\b(-?\d*\.?\d+(?:px|rem|em|vh|vw|%|fr))\b/g, '<span class="token-number">$1</span>')
      .replace(/\b(-?\d*\.?\d+)\b/g, '<span class="token-number">$1</span>')
      .replace(
        /\b(auto|none|solid|dashed|dotted|double|flex|grid|block|absolute|relative|fixed|sticky|column|row|center|stretch|space-between|space-around|space-evenly|wrap|nowrap|hidden|visible|clip|repeat|minmax)\b/g,
        '<span class="token-keyword">$1</span>',
      );

    return this.restoreStashes(result, stashes);
  }

  private highlightJson(code: string): string {
    if (!code.trim()) {
      return '';
    }

    return this.escapeHtml(code)
      .replace(/("(?:\\.|[^"])*")(?=\s*:)/g, '<span class="token-key">$1</span>')
      .replace(/:\s*("(?:\\.|[^"])*")/g, ': <span class="token-string">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(-?\d*\.?\d+)\b/g, '<span class="token-number">$1</span>');
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private stashMatches(
    value: string,
    regex: RegExp,
    stashes: string[],
    formatter: (match: string) => string,
  ): string {
    return value.replace(regex, (match) => {
      const token = `__TOK${this.toAlphabetIndex(stashes.length)}__`;
      stashes.push(formatter(match));
      return token;
    });
  }

  private restoreStashes(value: string, stashes: string[]): string {
    return stashes.reduce(
      (current, stash, index) => current.replace(`__TOK${this.toAlphabetIndex(index)}__`, stash),
      value,
    );
  }

  private toAlphabetIndex(index: number): string {
    let value = index;
    let result = '';

    do {
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);

    return result;
  }

  private async writeToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
