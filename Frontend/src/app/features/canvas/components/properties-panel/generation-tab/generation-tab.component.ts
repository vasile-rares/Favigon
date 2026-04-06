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
import { IRNode } from '@app/core';
import { SupportedFramework } from '../../../canvas.types';

type OutputTab = 'html' | 'css';
type CopyKind = OutputTab | 'ir';
type ExportFile = {
  name: string;
  content: string;
  mimeType: string;
  kind: OutputTab;
};

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
  @Input() irPreview: IRNode | null = null;

  @Output() frameworkChanged = new EventEmitter<SupportedFramework>();
  @Output() validateRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();

  activeOutputTab: OutputTab = 'html';
  copiedKind: CopyKind | null = null;
  highlightedHtml = '';
  highlightedCss = '';
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
    if (changes['generatedHtml'] || changes['generatedCss'] || changes['irPreview']) {
      this.refreshHighlightedCode();
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

  selectOutputTab(tab: OutputTab): void {
    if (
      (tab === 'html' && !this.hasGeneratedHtml()) ||
      (tab === 'css' && !this.hasGeneratedCss())
    ) {
      return;
    }

    this.activeOutputTab = tab;
  }

  isOutputTabActive(tab: OutputTab): boolean {
    return this.getResolvedOutputTab() === tab;
  }

  hasGeneratedCode(): boolean {
    return this.hasGeneratedHtml() || this.hasGeneratedCss();
  }

  hasGeneratedHtml(): boolean {
    return this.generatedHtml.trim().length > 0;
  }

  hasGeneratedCss(): boolean {
    return this.generatedCss.trim().length > 0;
  }

  hasResponsiveCss(): boolean {
    return this.generatedCss.includes('@media');
  }

  getCurrentOutputCode(): string {
    return this.getResolvedOutputTab() === 'css' ? this.generatedCss : this.generatedHtml;
  }

  getCurrentOutputLabel(): string {
    return this.getResolvedOutputTab() === 'css' ? 'CSS' : this.getMarkupOutputLabel();
  }

  getCurrentHighlightedOutput(): string {
    return this.getResolvedOutputTab() === 'css' ? this.highlightedCss : this.highlightedHtml;
  }

  getCurrentFileName(): string {
    return this.getOutputFile(this.getResolvedOutputTab()).name;
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
      return 'Code ready';
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

    if (this.hasResponsiveCss()) {
      return 'Device pages are exported as responsive breakpoints.';
    }

    return 'Validate first if you want a quick structural check.';
  }

  getCopyButtonLabel(kind: CopyKind): string {
    if (this.copiedKind === kind) {
      return 'Copied';
    }

    return kind === 'ir' ? 'Copy IR' : `Copy ${kind.toUpperCase()}`;
  }

  getCopyCurrentButtonLabel(): string {
    const current = this.getResolvedOutputTab();
    if (this.copiedKind === current) {
      return 'Copied';
    }

    return `Copy ${this.getCurrentOutputLabel()}`;
  }

  getExportCurrentButtonLabel(): string {
    return `Save ${this.getCurrentOutputLabel()}`;
  }

  getExportAllButtonLabel(): string {
    return this.hasMultipleExportFiles() ? 'Save files' : 'Save file';
  }

  lineCount(value: string): number {
    if (!value.trim()) {
      return 0;
    }

    return value.split(/\r?\n/).length;
  }

  copy(kind: CopyKind): void {
    const value = this.getCopyValue(kind);
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

  copyCurrentOutput(): void {
    this.copy(this.getResolvedOutputTab());
  }

  canExportFiles(): boolean {
    return this.getExportFiles().length > 0;
  }

  hasMultipleExportFiles(): boolean {
    return this.getExportFiles().length > 1;
  }

  exportCurrentOutput(): void {
    this.exportFiles([this.getOutputFile(this.getResolvedOutputTab())]);
  }

  exportAllOutputs(): void {
    this.exportFiles(this.getExportFiles());
  }

  private getResolvedOutputTab(): OutputTab {
    if (this.activeOutputTab === 'css' && this.hasGeneratedCss()) {
      return 'css';
    }

    if (this.hasGeneratedHtml()) {
      return 'html';
    }

    if (this.hasGeneratedCss()) {
      return 'css';
    }

    return 'html';
  }

  private getCopyValue(kind: CopyKind): string {
    if (kind === 'html') {
      return this.generatedHtml;
    }

    if (kind === 'css') {
      return this.generatedCss;
    }

    return this.irPreview ? JSON.stringify(this.irPreview, null, 2) : '';
  }

  getMarkupOutputLabel(): string {
    if (this.selectedFramework === 'react') {
      return 'JSX';
    }

    if (this.selectedFramework === 'angular') {
      return 'Template';
    }

    return 'HTML';
  }

  private getExportFiles(): ExportFile[] {
    const files: ExportFile[] = [];

    if (this.hasGeneratedHtml()) {
      files.push(this.getOutputFile('html'));
    }

    if (this.hasGeneratedCss()) {
      files.push(this.getOutputFile('css'));
    }

    return files;
  }

  private getOutputFile(kind: OutputTab): ExportFile {
    const baseSlug = this.getBaseFileSlug();

    if (kind === 'css') {
      return {
        kind,
        name:
          this.selectedFramework === 'angular' ? `${baseSlug}.component.css` : `${baseSlug}.css`,
        content: this.generatedCss,
        mimeType: 'text/css;charset=utf-8',
      };
    }

    if (this.selectedFramework === 'react') {
      return {
        kind,
        name: `${this.toPascalCase(baseSlug)}.jsx`,
        content: this.generatedHtml,
        mimeType: 'text/plain;charset=utf-8',
      };
    }

    if (this.selectedFramework === 'angular') {
      return {
        kind,
        name: `${baseSlug}.component.html`,
        content: this.generatedHtml,
        mimeType: 'text/html;charset=utf-8',
      };
    }

    return {
      kind,
      name: `${baseSlug}.html`,
      content: this.generatedHtml,
      mimeType: 'text/html;charset=utf-8',
    };
  }

  private getBaseFileSlug(): string {
    const rawName = this.irPreview?.props?.['pageName'];
    const pageName = typeof rawName === 'string' ? rawName : '';
    const normalized = pageName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || 'generation-export';
  }

  private toPascalCase(value: string): string {
    const parts = value.split('-').filter(Boolean);
    if (parts.length === 0) {
      return 'GenerationExport';
    }

    return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  }

  private exportFiles(files: ExportFile[]): void {
    files
      .filter((file) => file.content.trim().length > 0)
      .forEach((file, index) => {
        window.setTimeout(() => {
          this.downloadFile(file);
        }, index * 40);
      });
  }

  private downloadFile(file: ExportFile): void {
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  private refreshHighlightedCode(): void {
    this.highlightedHtml = this.highlightMarkup(this.generatedHtml);
    this.highlightedCss = this.highlightCss(this.generatedCss);
    this.highlightedIr = this.highlightJson(
      this.irPreview ? JSON.stringify(this.irPreview, null, 2) : '',
    );
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
