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
import {
  CanvasElement,
  CanvasElementType,
  CanvasStrokePosition,
} from '../../core/models/canvas.models';
import { buildCanvasElementsFromIR, buildCanvasIR } from '../../core/mappers/canvas-ir.mapper';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';
import { CanvasLeftPanelComponent } from '../../components/ui/canvas-left-panel/canvas-left-panel.component';
import { CanvasDesignSidepanelComponent } from '../../components/ui/canvas-design-sidepanel/canvas-design-sidepanel.component';
import { ConverterService } from '../../core/services/converter.service';
import { IRNode } from '../../core/models/ir.models';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [
    CommonModule,
    HeaderBarComponent,
    CanvasLeftPanelComponent,
    CanvasDesignSidepanelComponent,
  ],
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
  zoomLevel = signal(1);
  viewportOffset = signal({ x: 0, y: 0 });
  isPanning = signal(false);
  isSpacePressed = signal(false);
  frameTemplate = signal({ width: 390, height: 844 });
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
  private readonly defaultFrameFill = '#3f3f46';
  private readonly defaultElementFill = '#e0e0e0';
  private readonly minZoom = 0.25;
  private readonly maxZoom = 3;
  private readonly zoomStep = 0.1;
  private readonly gridSize = 20;
  private panStart = { x: 0, y: 0 };
  private panMoved = false;
  private suppressNextCanvasClick = false;

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
    if (tool === 'select') {
      return;
    }

    const selected = this.selectedElement();
    const shouldKeepSelection = tool !== 'frame' && selected?.type === 'frame';

    if (!shouldKeepSelection) {
      this.selectedElementId.set(null);
    }
  }

  onCanvasPointerDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!this.shouldStartPanning(event, target)) {
      return;
    }

    this.startPanning(event);
  }

  onCanvasClick(event: MouseEvent) {
    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return;
    }

    if (this.isSpacePressed()) {
      return;
    }

    this.apiError.set(null);
    const tool = this.currentTool();
    if (tool === 'select') {
      // If we clicked directly on the canvas (not an element), deselect
      const target = event.target as HTMLElement;
      if (
        target.classList.contains('canvas-container') ||
        target.classList.contains('canvas-viewport')
      ) {
        this.selectedElementId.set(null);
      }
      return;
    }

    // Create new element
    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const x = pointer.x;
    const y = pointer.y;

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

    const defaultWidth =
      tool === 'frame'
        ? this.frameTemplate().width
        : tool === 'text'
          ? 150
          : tool === 'image'
            ? 180
            : 100;
    const defaultHeight =
      tool === 'frame'
        ? this.frameTemplate().height
        : tool === 'text'
          ? 40
          : tool === 'image'
            ? 120
            : 100;

    const constrainedX =
      selectedFrame && tool !== 'frame'
        ? this.clamp(x, selectedFrame.x, selectedFrame.x + selectedFrame.width - defaultWidth)
        : x;
    const constrainedY =
      selectedFrame && tool !== 'frame'
        ? this.clamp(y, selectedFrame.y, selectedFrame.y + selectedFrame.height - defaultHeight)
        : y;

    const name = this.getNextElementName(tool);

    const newElement: CanvasElement = {
      id: crypto.randomUUID(),
      type: tool,
      name,
      x: constrainedX,
      y: constrainedY,
      width: defaultWidth,
      height: defaultHeight,
      fill: tool === 'frame' ? this.defaultFrameFill : this.defaultElementFill,
      strokeWidth: tool === 'text' ? undefined : 1,
      strokePosition: tool === 'text' ? undefined : 'inside',
      opacity: 1,
      cornerRadius: tool === 'image' ? 6 : 0,
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
    const target = event.target as HTMLElement;
    if (this.shouldStartPanning(event, target)) {
      this.startPanning(event);
      return;
    }

    if (this.currentTool() !== 'select') {
      return;
    }

    if (this.isResizing()) {
      return;
    }

    event.stopPropagation();
    this.selectedElementId.set(id);
    this.currentTool.set('select');

    const el = this.elements().find((e) => e.id === id);
    if (el) {
      const pointer = this.getCanvasPoint(event);
      if (!pointer) {
        return;
      }

      this.isDragging.set(true);
      this.dragOffset = {
        x: pointer.x - el.x,
        y: pointer.y - el.y,
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

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    this.selectedElementId.set(id);
    this.isDragging.set(false);
    this.isResizing.set(true);
    this.resizeStart = {
      x: pointer.x,
      y: pointer.y,
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
    if (this.isPanning()) {
      const deltaX = event.clientX - this.panStart.x;
      const deltaY = event.clientY - this.panStart.y;

      if (deltaX !== 0 || deltaY !== 0) {
        this.panMoved = true;
        this.viewportOffset.update((offset) => ({
          x: this.roundToTwoDecimals(offset.x + deltaX),
          y: this.roundToTwoDecimals(offset.y + deltaY),
        }));
        this.panStart = {
          x: event.clientX,
          y: event.clientY,
        };
      }

      return;
    }

    if (this.isResizing()) {
      this.handleResizePointerMove(event);
      return;
    }

    if (!this.isDragging()) return;

    const selectedId = this.selectedElementId();
    if (selectedId) {
      this.elements.update((elements) => {
        const selectedElement = elements.find((element) => element.id === selectedId);
        if (!selectedElement) {
          return elements;
        }

        const pointer = this.getCanvasPoint(event);
        if (!pointer) {
          return elements;
        }

        const nextX = pointer.x - this.dragOffset.x;
        const nextY = pointer.y - this.dragOffset.y;

        if (selectedElement.type === 'frame') {
          const deltaX = this.roundToTwoDecimals(nextX - selectedElement.x);
          const deltaY = this.roundToTwoDecimals(nextY - selectedElement.y);

          if (deltaX === 0 && deltaY === 0) {
            return elements;
          }

          const descendantIds = this.collectDescendantIds(elements, selectedElement.id);
          return elements.map((element) => {
            if (element.id !== selectedElement.id && !descendantIds.has(element.id)) {
              return element;
            }

            return {
              ...element,
              x: this.roundToTwoDecimals(element.x + deltaX),
              y: this.roundToTwoDecimals(element.y + deltaY),
            };
          });
        }

        return elements.map((element) => {
          if (element.id !== selectedId) {
            return element;
          }

          const parent = element.parentId
            ? elements.find((candidate) => candidate.id === element.parentId)
            : null;

          if (parent && element.type !== 'frame') {
            return {
              ...element,
              x: this.clamp(nextX, parent.x, parent.x + parent.width - element.width),
              y: this.clamp(nextY, parent.y, parent.y + parent.height - element.height),
            };
          }

          return {
            ...element,
            x: this.roundToTwoDecimals(nextX),
            y: this.roundToTwoDecimals(nextY),
          };
        });
      });
    }
  }

  @HostListener('window:pointerup')
  onPointerUp() {
    if (this.isPanning() && this.panMoved) {
      this.suppressNextCanvasClick = true;
    }

    this.isPanning.set(false);
    this.isDragging.set(false);
    this.isResizing.set(false);
  }

  setFramework(framework: 'html' | 'react' | 'angular') {
    this.selectedFramework.set(framework);
  }

  onLayerSelected(elementId: string) {
    this.selectedElementId.set(elementId);
    this.currentTool.set('select');
  }

  onLayerNameChanged(change: { id: string; name: string }) {
    this.elements.update((elements) =>
      elements.map((element) =>
        element.id === change.id
          ? {
              ...element,
              name: change.name,
            }
          : element,
      ),
    );
  }

  onFrameTemplateSelected(template: { width: number; height: number }) {
    this.frameTemplate.set({
      width: template.width,
      height: template.height,
    });
  }

  onCanvasWheel(event: WheelEvent) {
    const canvas = event.currentTarget as HTMLElement | null;
    if (!canvas) {
      return;
    }

    event.preventDefault();
    if (event.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaY < 0 ? this.zoomStep : -this.zoomStep;
      this.setZoom(this.zoomLevel() + delta, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      return;
    }

    this.viewportOffset.update((offset) => ({
      x: this.roundToTwoDecimals(offset.x - event.deltaX),
      y: this.roundToTwoDecimals(offset.y - event.deltaY),
    }));
  }

  zoomIn() {
    this.setZoom(this.zoomLevel() + this.zoomStep);
  }

  zoomOut() {
    this.setZoom(this.zoomLevel() - this.zoomStep);
  }

  resetZoom() {
    this.zoomLevel.set(1);
  }

  zoomPercentage(): number {
    return Math.round(this.zoomLevel() * 100);
  }

  canvasViewportTransform(): string {
    const offset = this.viewportOffset();
    return `translate(${offset.x}px, ${offset.y}px) scale(${this.zoomLevel()})`;
  }

  canvasBackgroundSize(): string {
    const size = this.roundToTwoDecimals(this.gridSize * this.zoomLevel());
    return `${size}px ${size}px`;
  }

  canvasBackgroundPosition(): string {
    const offset = this.viewportOffset();
    return `${offset.x}px ${offset.y}px`;
  }

  isPanReady(): boolean {
    return this.currentTool() === 'select' || this.isSpacePressed();
  }

  getElementBorderStyle(element: CanvasElement): string {
    if (!element.stroke || element.type === 'text') {
      return 'none';
    }

    const strokeWidth = this.getStrokeWidth(element);
    if (strokeWidth <= 0) {
      return 'none';
    }

    const strokePosition = this.getStrokePosition(element);
    if (strokePosition !== 'inside') {
      return 'none';
    }

    return `${strokeWidth}px solid ${element.stroke}`;
  }

  getElementOutlineStyle(element: CanvasElement): string {
    if (!element.stroke || element.type === 'text') {
      return 'none';
    }

    const strokeWidth = this.getStrokeWidth(element);
    if (strokeWidth <= 0) {
      return 'none';
    }

    const strokePosition = this.getStrokePosition(element);
    if (strokePosition !== 'outside') {
      return 'none';
    }

    return `${strokeWidth}px solid ${element.stroke}`;
  }

  getElementOutlineOffset(element: CanvasElement): number {
    return 0;
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
        error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
          this.apiError.set(this.extractErrorMessage(error, 'IR validation failed.'));
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
        error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
          this.apiError.set(this.extractErrorMessage(error, 'Code generation failed.'));
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
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(this.extractErrorMessage(error, 'Failed to load project design.'));
        this.isLoadingDesign.set(false);

        // Keep autosave available after a load error so edits can still be persisted.
        this.canPersistDesign = true;
        if (this.elements().length > 0) {
          this.scheduleDesignSave();
        }
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
      error: (error: { error?: { message?: string; title?: string; detail?: string } }) => {
        this.apiError.set(this.extractErrorMessage(error, 'Failed to save project design.'));
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

  private extractErrorMessage(
    error: { error?: { message?: string; title?: string; detail?: string } },
    fallback: string,
  ): string {
    return error.error?.message ?? error.error?.title ?? error.error?.detail ?? fallback;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) {
      return;
    }

    const isTypingContext = this.isTypingContext(event);

    if (event.code === 'Space' && !isTypingContext) {
      this.isSpacePressed.set(true);
      event.preventDefault();
      return;
    }

    if (isTypingContext) {
      return;
    }

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

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space') {
      this.isSpacePressed.set(false);
    }
  }

  @HostListener('window:blur')
  handleWindowBlur() {
    this.isSpacePressed.set(false);
    this.isPanning.set(false);
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
      strokeWidth:
        typeof element.strokeWidth === 'number'
          ? this.roundToTwoDecimals(element.strokeWidth)
          : undefined,
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

    const normalizedOpacity = Number.isFinite(element.opacity ?? Number.NaN)
      ? (element.opacity as number)
      : 1;
    element.opacity = this.clamp(normalizedOpacity, 0, 1);

    if (element.type !== 'circle' && element.type !== 'text') {
      const normalizedCornerRadius = Number.isFinite(element.cornerRadius ?? Number.NaN)
        ? (element.cornerRadius as number)
        : element.type === 'image'
          ? 6
          : 0;
      element.cornerRadius = Math.max(0, this.roundToTwoDecimals(normalizedCornerRadius));
    }

    if (element.type !== 'text') {
      const normalizedStrokeWidth = Number.isFinite(element.strokeWidth ?? Number.NaN)
        ? (element.strokeWidth as number)
        : 1;
      element.strokeWidth = Math.max(0, this.roundToTwoDecimals(normalizedStrokeWidth));
      element.strokePosition = this.getStrokePosition(element);
    } else {
      element.strokeWidth = undefined;
      element.strokePosition = undefined;
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

    const pointer = this.getCanvasPoint(event);
    if (!pointer) {
      return;
    }

    const deltaX = pointer.x - start.x;
    const deltaY = pointer.y - start.y;
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

  private setZoom(nextZoom: number, anchor?: { x: number; y: number }) {
    const previousZoom = this.zoomLevel();
    const clampedZoom = this.clamp(nextZoom, this.minZoom, this.maxZoom);

    if (clampedZoom === previousZoom) {
      return;
    }

    if (anchor) {
      const offset = this.viewportOffset();
      const worldX = (anchor.x - offset.x) / previousZoom;
      const worldY = (anchor.y - offset.y) / previousZoom;

      this.viewportOffset.set({
        x: this.roundToTwoDecimals(anchor.x - worldX * clampedZoom),
        y: this.roundToTwoDecimals(anchor.y - worldY * clampedZoom),
      });
    }

    this.zoomLevel.set(clampedZoom);
  }

  private getCanvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const offset = this.viewportOffset();

    return {
      x: this.roundToTwoDecimals((event.clientX - rect.left - offset.x) / this.zoomLevel()),
      y: this.roundToTwoDecimals((event.clientY - rect.top - offset.y) / this.zoomLevel()),
    };
  }

  private shouldStartPanning(event: MouseEvent, target: HTMLElement): boolean {
    if (event.button === 1) {
      return true;
    }

    if (event.button !== 0) {
      return false;
    }

    if (this.isSpacePressed()) {
      return true;
    }

    return this.currentTool() === 'select' && this.isCanvasBackgroundTarget(target);
  }

  private startPanning(event: MouseEvent): void {
    this.isPanning.set(true);
    this.isDragging.set(false);
    this.isResizing.set(false);
    this.panMoved = false;
    this.panStart = {
      x: event.clientX,
      y: event.clientY,
    };
    event.preventDefault();
    event.stopPropagation();
  }

  private isCanvasBackgroundTarget(target: HTMLElement): boolean {
    return (
      target.classList.contains('canvas-container') || target.classList.contains('canvas-viewport')
    );
  }

  private getCanvasElement(): HTMLElement | null {
    return document.querySelector('.canvas-container') as HTMLElement | null;
  }

  private getNextElementName(type: CanvasElementType): string {
    const index = this.elements().filter((element) => element.type === type).length + 1;
    return `${this.toTypeLabel(type)} ${index}`;
  }

  private toTypeLabel(type: CanvasElementType): string {
    return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    const tagName = element.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  private isTypingContext(event: KeyboardEvent): boolean {
    if (this.isTypingTarget(event.target)) {
      return true;
    }

    return this.isTypingTarget(document.activeElement);
  }

  private getStrokeWidth(element: CanvasElement): number {
    if (typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth)) {
      return Math.max(0, element.strokeWidth);
    }

    return 1;
  }

  private getStrokePosition(element: CanvasElement): CanvasStrokePosition {
    return element.strokePosition === 'outside' ? 'outside' : 'inside';
  }

  private collectDescendantIds(elements: CanvasElement[], rootId: string): Set<string> {
    const descendants = new Set<string>();
    let added = true;

    while (added) {
      added = false;
      for (const element of elements) {
        if (!element.parentId) {
          continue;
        }

        const isDirectChild = element.parentId === rootId;
        const isNestedChild = descendants.has(element.parentId);

        if ((isDirectChild || isNestedChild) && !descendants.has(element.id)) {
          descendants.add(element.id);
          added = true;
        }
      }
    }

    return descendants;
  }

  private removeWithChildren(elements: CanvasElement[], rootId: string): CanvasElement[] {
    const idsToRemove = this.collectDescendantIds(elements, rootId);
    idsToRemove.add(rootId);

    return elements.filter((element) => !idsToRemove.has(element.id));
  }
}
