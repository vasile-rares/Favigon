import {
  Component,
  signal,
  HostListener,
  inject,
  computed,
  effect,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CanvasElement, CanvasElementType } from '../../core/models/canvas.models';
import { buildCanvasElementsFromIR, buildCanvasIR } from '../../core/mappers/canvas-ir.mapper';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';
import { CanvasDesignSidepanelComponent } from '../../components/ui/canvas-design-sidepanel/canvas-design-sidepanel.component';
import { ConverterService } from '../../core/services/converter.service';
import { IRNode } from '../../core/models/ir.models';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [CommonModule, HeaderBarComponent, CanvasDesignSidepanelComponent],
  templateUrl: './canvas-page.component.html',
  styleUrl: './canvas-page.component.css',
})
export class ProjectPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly converterService = inject(ConverterService);
  private readonly projectService = inject(ProjectService);

  elements = signal<CanvasElement[]>([]);
  selectedElementId = signal<string | null>(null);
  currentTool = signal<CanvasElementType | 'select'>('select');
  selectedElement = computed<CanvasElement | null>(() => {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return null;
    }

    return this.elements().find((element) => element.id === selectedId) ?? null;
  });

  selectedFramework = signal<'html' | 'react' | 'angular'>('html');
  validationResult = signal<boolean | null>(null);
  apiError = signal<string | null>(null);
  isValidating = signal(false);
  isGenerating = signal(false);
  generatedHtml = signal('');
  generatedCss = signal('');
  isLoadingDesign = signal(false);
  isSavingDesign = signal(false);
  lastSavedAt = signal<string | null>(null);

  projectId = this.route.snapshot.paramMap.get('id') ?? 'new-project';
  irPreview = computed(() => buildCanvasIR(this.elements(), this.projectId));
  private readonly projectIdAsNumber = Number.parseInt(this.projectId, 10);
  private canPersistDesign = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  isDragging = signal(false);
  isResizing = signal(false);
  dragOffset = { x: 0, y: 0 };
  resizeStart = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    elementX: 0,
    elementY: 0,
    elementId: '' as string,
  };
  private readonly imagePlaceholderUrl = 'https://placehold.co/300x200?text=Image';

  constructor() {
    this.loadProjectDesign();

    effect(() => {
      this.elements();
      if (!this.canPersistDesign) {
        return;
      }

      this.scheduleDesignSave();
    });
  }

  ngOnDestroy(): void {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
  }

  selectTool(tool: CanvasElementType | 'select') {
    this.currentTool.set(tool);
    if (tool !== 'select') {
      this.selectedElementId.set(null);
    }
  }

  onCanvasClick(event: MouseEvent) {
    this.apiError.set(null);
    const tool = this.currentTool();
    if (tool === 'select') {
      // If we clicked directly on the canvas (not an element), deselect
      if ((event.target as HTMLElement).classList.contains('canvas-container')) {
        this.selectedElementId.set(null);
      }
      return;
    }

    // Create new element
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const selectedFrame = this.getSelectedFrame();
    if (tool !== 'frame') {
      if (!selectedFrame) {
        this.apiError.set(
          'Select a frame first. Shapes, text, and images must be placed inside a frame.',
        );
        return;
      }

      if (!this.isPointInsideElement(x, y, selectedFrame)) {
        this.apiError.set('Click inside the selected frame to place the element.');
        return;
      }
    }

    const defaultWidth = tool === 'text' ? 150 : tool === 'image' ? 180 : 100;
    const defaultHeight = tool === 'text' ? 40 : tool === 'image' ? 120 : 100;

    const constrainedX =
      selectedFrame && tool !== 'frame'
        ? this.clamp(x, selectedFrame.x, selectedFrame.x + selectedFrame.width - defaultWidth)
        : x;
    const constrainedY =
      selectedFrame && tool !== 'frame'
        ? this.clamp(y, selectedFrame.y, selectedFrame.y + selectedFrame.height - defaultHeight)
        : y;

    const newElement: CanvasElement = {
      id: crypto.randomUUID(),
      type: tool,
      x: constrainedX,
      y: constrainedY,
      width: defaultWidth,
      height: defaultHeight,
      fill: tool === 'frame' ? '#ffffff' : '#e0e0e0',
      text: tool === 'text' ? 'New text' : undefined,
      fontSize: tool === 'text' ? 16 : undefined,
      imageUrl: tool === 'image' ? this.imagePlaceholderUrl : undefined,
      parentId: tool === 'frame' ? null : selectedFrame?.id,
    };

    this.elements.update((els) => [...els, newElement]);
    this.selectedElementId.set(newElement.id);
    this.currentTool.set('select'); // Revert to select tool after creation
  }

  onElementPointerDown(event: MouseEvent, id: string) {
    if (this.isResizing()) {
      return;
    }

    event.stopPropagation();
    this.selectedElementId.set(id);
    this.currentTool.set('select');

    const el = this.elements().find((e) => e.id === id);
    if (el) {
      this.isDragging.set(true);
      this.dragOffset = {
        x: event.clientX - el.x,
        y: event.clientY - el.y,
      };
    }
  }

  onResizeHandlePointerDown(event: MouseEvent, id: string) {
    event.stopPropagation();
    event.preventDefault();

    const element = this.elements().find((candidate) => candidate.id === id);
    if (!element) {
      return;
    }

    this.selectedElementId.set(id);
    this.isDragging.set(false);
    this.isResizing.set(true);
    this.resizeStart = {
      x: event.clientX,
      y: event.clientY,
      width: element.width,
      height: element.height,
      elementX: element.x,
      elementY: element.y,
      elementId: id,
    };
  }

  onSelectedElementPatch(patch: Partial<CanvasElement>) {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return;
    }

    this.elements.update((elements) =>
      elements.map((element) => {
        if (element.id !== selectedId) {
          return element;
        }

        const nextElement: CanvasElement = {
          ...element,
          ...patch,
        };

        this.normalizeElement(nextElement, elements);
        return nextElement;
      }),
    );
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: MouseEvent) {
    if (this.isResizing()) {
      this.handleResizePointerMove(event);
      return;
    }

    if (!this.isDragging()) return;

    const selectedId = this.selectedElementId();
    if (selectedId) {
      this.elements.update((els) =>
        els.map((el) => {
          if (el.id === selectedId) {
            const nextX = event.clientX - this.dragOffset.x;
            const nextY = event.clientY - this.dragOffset.y;
            const parent = el.parentId
              ? els.find((candidate) => candidate.id === el.parentId)
              : null;

            if (parent && el.type !== 'frame') {
              return {
                ...el,
                x: this.clamp(nextX, parent.x, parent.x + parent.width - el.width),
                y: this.clamp(nextY, parent.y, parent.y + parent.height - el.height),
              };
            }

            return {
              ...el,
              x: this.roundToTwoDecimals(nextX),
              y: this.roundToTwoDecimals(nextY),
            };
          }
          return el;
        }),
      );
    }
  }

  @HostListener('window:pointerup')
  onPointerUp() {
    this.isDragging.set(false);
    this.isResizing.set(false);
  }

  setFramework(framework: 'html' | 'react' | 'angular') {
    this.selectedFramework.set(framework);
  }

  validateIR() {
    this.apiError.set(null);
    this.validationResult.set(null);
    this.isValidating.set(true);

    this.converterService
      .validate({
        framework: this.selectedFramework(),
        ir: this.irPreview(),
      })
      .subscribe({
        next: (response) => {
          this.validationResult.set(response.isValid);
          this.isValidating.set(false);
        },
        error: (error: { error?: { message?: string } }) => {
          this.apiError.set(error.error?.message ?? 'IR validation failed.');
          this.isValidating.set(false);
        },
      });
  }

  generateCode() {
    this.apiError.set(null);
    this.generatedHtml.set('');
    this.generatedCss.set('');
    this.isGenerating.set(true);

    this.converterService
      .generate({
        framework: this.selectedFramework(),
        ir: this.irPreview(),
      })
      .subscribe({
        next: (response) => {
          this.generatedHtml.set(response.html);
          this.generatedCss.set(response.css);
          this.validationResult.set(response.isValid);
          this.isGenerating.set(false);
        },
        error: (error: { error?: { message?: string } }) => {
          this.apiError.set(error.error?.message ?? 'Code generation failed.');
          this.isGenerating.set(false);
        },
      });
  }

  private loadProjectDesign() {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      this.apiError.set('Invalid project id.');
      return;
    }

    this.isLoadingDesign.set(true);
    this.apiError.set(null);
    this.canPersistDesign = false;

    this.projectService.getDesign(this.projectIdAsNumber).subscribe({
      next: (response) => {
        const parsedIr = this.safeParseIr(response.designJson);
        this.elements.set(
          buildCanvasElementsFromIR(parsedIr).map((element) => this.withRoundedPrecision(element)),
        );
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.isLoadingDesign.set(false);
        this.canPersistDesign = true;
      },
      error: (error: { error?: { message?: string } }) => {
        this.apiError.set(error.error?.message ?? 'Failed to load project design.');
        this.isLoadingDesign.set(false);
      },
    });
  }

  private scheduleDesignSave() {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
    }

    this.saveTimeoutId = setTimeout(() => {
      this.persistDesign();
    }, 500);
  }

  private persistDesign() {
    if (!Number.isInteger(this.projectIdAsNumber)) {
      return;
    }

    const designJson = JSON.stringify(this.irPreview());
    this.isSavingDesign.set(true);

    this.projectService.saveDesign(this.projectIdAsNumber, { designJson }).subscribe({
      next: (response) => {
        this.lastSavedAt.set(response.updatedAt ?? null);
        this.isSavingDesign.set(false);
      },
      error: (error: { error?: { message?: string } }) => {
        this.apiError.set(error.error?.message ?? 'Failed to save project design.');
        this.isSavingDesign.set(false);
      },
    });
  }

  private safeParseIr(rawJson: string): IRNode | null {
    if (!rawJson?.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as IRNode;
    } catch {
      return null;
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    // Tool shortcuts
    if (event.key.toLowerCase() === 'v') this.selectTool('select');
    if (event.key.toLowerCase() === 'f') this.selectTool('frame');
    if (event.key.toLowerCase() === 'r') this.selectTool('rectangle');
    if (event.key.toLowerCase() === 'o') this.selectTool('circle');
    if (event.key.toLowerCase() === 't') this.selectTool('text');
    if (event.key.toLowerCase() === 'i') this.selectTool('image');

    // Delete selected element
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedId = this.selectedElementId();
      if (selectedId) {
        this.elements.update((els) => this.removeWithChildren(els, selectedId));
        this.selectedElementId.set(null);
      }
    }
  }

  private getSelectedFrame(): CanvasElement | null {
    const selectedId = this.selectedElementId();
    if (!selectedId) {
      return null;
    }

    const selected = this.elements().find((element) => element.id === selectedId);
    return selected?.type === 'frame' ? selected : null;
  }

  private isPointInsideElement(x: number, y: number, element: CanvasElement): boolean {
    return (
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return this.roundToTwoDecimals(Math.min(Math.max(value, min), max));
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private withRoundedPrecision(element: CanvasElement): CanvasElement {
    return {
      ...element,
      x: this.roundToTwoDecimals(element.x),
      y: this.roundToTwoDecimals(element.y),
      width: this.roundToTwoDecimals(element.width),
      height: this.roundToTwoDecimals(element.height),
      fontSize:
        typeof element.fontSize === 'number'
          ? this.roundToTwoDecimals(element.fontSize)
          : undefined,
    };
  }

  private normalizeElement(element: CanvasElement, elements: CanvasElement[]): void {
    const minSize = 24;

    element.width = Math.max(minSize, element.width);
    element.height = Math.max(minSize, element.height);

    if (element.type === 'text') {
      element.fontSize = Math.max(8, element.fontSize ?? 16);
    }

    if (element.type === 'circle') {
      const circleSize = Math.max(minSize, Math.min(element.width, element.height));
      element.width = circleSize;
      element.height = circleSize;
    }

    const parent = element.parentId
      ? elements.find((candidate) => candidate.id === element.parentId)
      : null;

    if (!parent || element.type === 'frame') {
      element.x = this.roundToTwoDecimals(element.x);
      element.y = this.roundToTwoDecimals(element.y);
      element.width = this.roundToTwoDecimals(element.width);
      element.height = this.roundToTwoDecimals(element.height);
      if (typeof element.fontSize === 'number') {
        element.fontSize = this.roundToTwoDecimals(element.fontSize);
      }
      return;
    }

    const maxWidth = Math.max(minSize, parent.x + parent.width - element.x);
    const maxHeight = Math.max(minSize, parent.y + parent.height - element.y);

    element.width = this.clamp(element.width, minSize, maxWidth);
    element.height = this.clamp(element.height, minSize, maxHeight);

    if (element.type === 'circle') {
      const constrainedCircleSize = Math.max(minSize, Math.min(element.width, element.height));
      element.width = constrainedCircleSize;
      element.height = constrainedCircleSize;
    }

    element.x = this.clamp(element.x, parent.x, parent.x + parent.width - element.width);
    element.y = this.clamp(element.y, parent.y, parent.y + parent.height - element.height);
    element.x = this.roundToTwoDecimals(element.x);
    element.y = this.roundToTwoDecimals(element.y);
    element.width = this.roundToTwoDecimals(element.width);
    element.height = this.roundToTwoDecimals(element.height);
    if (typeof element.fontSize === 'number') {
      element.fontSize = this.roundToTwoDecimals(element.fontSize);
    }
  }

  private handleResizePointerMove(event: MouseEvent) {
    const start = this.resizeStart;
    if (!start.elementId) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const minSize = 24;

    this.elements.update((elements) =>
      elements.map((element) => {
        if (element.id !== start.elementId) {
          return element;
        }

        const parent = element.parentId
          ? elements.find((candidate) => candidate.id === element.parentId)
          : null;

        const maxWidth = parent
          ? parent.x + parent.width - start.elementX
          : Number.POSITIVE_INFINITY;
        const maxHeight = parent
          ? parent.y + parent.height - start.elementY
          : Number.POSITIVE_INFINITY;

        let nextWidth = this.clamp(start.width + deltaX, minSize, maxWidth);
        let nextHeight = this.clamp(start.height + deltaY, minSize, maxHeight);

        if (element.type === 'circle') {
          const sizeLimit = Math.min(nextWidth, nextHeight);
          nextWidth = sizeLimit;
          nextHeight = sizeLimit;
        }

        return {
          ...element,
          width: nextWidth,
          height: nextHeight,
        };
      }),
    );
  }

  private removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
    const idsToRemove = new Set<string>([rootId]);
    let added = true;

    while (added) {
      added = false;
      for (const element of elements) {
        if (element.parentId && idsToRemove.has(element.parentId) && !idsToRemove.has(element.id)) {
          idsToRemove.add(element.id);
          added = true;
        }
      }
    }

    return elements.filter((element) => !idsToRemove.has(element.id));
  }
}
