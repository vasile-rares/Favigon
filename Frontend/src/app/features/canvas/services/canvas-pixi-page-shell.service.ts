import { Injectable, inject } from '@angular/core';
import { Container, Graphics, Rectangle, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import { CanvasPixiApplicationService } from './canvas-pixi-application.service';
import { CanvasPageGeometryService } from './canvas-page-geometry.service';
import { CanvasEditorStateService } from './canvas-editor-state.service';
import { CanvasPageLayout } from '../canvas.types';
import { getFrameTitle } from '../utils/element/canvas-text.util';

const FRAME_TITLE_FONT_SIZE = 13;
const FRAME_TITLE_COLOR_ACTIVE = 0xffffff;
const FRAME_TITLE_COLOR_INACTIVE = 0x888888;
/** px above the frame's top edge in overlay space */
const FRAME_TITLE_OFFSET_Y = 6;
const FRAME_TITLE_MIN_ZOOM = 0.3;

// ── Page header constants ──────────────────────────────────
const HEADER_HEIGHT = 44;
const HEADER_MIN_ZOOM = 0.25;
const HEADER_PANEL_RADIUS = 14;
const HEADER_PANEL_FILL = 0x111215;
const HEADER_PANEL_FILL_ALPHA = 0.92;
const HEADER_PANEL_BORDER = 0xffffff;
const HEADER_PANEL_BORDER_ALPHA_ACTIVE = 0.12;
const HEADER_PANEL_BORDER_ALPHA_INACTIVE = 0.06;
const HEADER_PANEL_SELECTED_FILL = 0x3b82f6;
const HEADER_PANEL_SELECTED_FILL_ALPHA = 0.16;
const HEADER_PANEL_SELECTED_BORDER_ALPHA = 0.55;
const HEADER_INNER_PADDING_X = 10;
const HEADER_BUTTON_SIZE = 28;
const HEADER_BUTTON_TOP = 8;
const HEADER_BUTTON_RADIUS = 9;
const HEADER_BUTTON_FILL_ALPHA_ACTIVE = 0.1;
const HEADER_BUTTON_FILL_ALPHA_INACTIVE = 0.06;
const HEADER_BUTTON_FILL_ALPHA_HOVER = 0.2;
const HEADER_BUTTON_BORDER_ALPHA = 0.08;
const HEADER_BUTTON_BORDER_ALPHA_HOVER = 0.35;
const HEADER_BUTTON_HOVER_COLOR = 0x3b82f6;
/** Left offset for the page name text (after play button + gap). */
const NAME_TEXT_LEFT = 50;
const NAME_TEXT_FONT_SIZE = 13;
const NAME_TEXT_Y = 9;
const NAME_TEXT_ALPHA_ACTIVE = 0.92;
const NAME_TEXT_ALPHA_INACTIVE = 0.72;
const META_TEXT_FONT_SIZE = 10;
const META_TEXT_Y = 25;
const META_TEXT_ALPHA_ACTIVE = 0.6;
const META_TEXT_ALPHA_INACTIVE = 0.42;
const ADD_BTN_WIDTH = HEADER_BUTTON_SIZE;

interface PageHeaderNode {
  container: Container;
  background: Graphics;
  nameText: Text;
  metaText: Text;
  playButtonBg: Graphics;
  playShape: Graphics;
  addButtonBg: Graphics;
  addText: Text;
  isActive: boolean;
  playHovered: boolean;
  addHovered: boolean;
}

@Injectable()
export class CanvasPixiPageShellService {
  private readonly pixiApp = inject(CanvasPixiApplicationService);
  private readonly pageGeometry = inject(CanvasPageGeometryService);
  private readonly editorState = inject(CanvasEditorStateService);

  private readonly shellGraphics = new Map<string, Graphics>();
  private readonly frameTitleTexts = new Map<string, Text>(); // keyed by element.id
  private readonly pageHeaderNodes = new Map<string, PageHeaderNode>();

  /** Both containers live in overlayContainer (panned, NOT scaled) */
  private readonly shellContainer = new Container({ label: 'page-shells' });
  private readonly frameTitleContainer = new Container({ label: 'frame-titles' });
  private readonly headerContainer = new Container({ label: 'page-headers' });

  private initialized = false;
  private shellPointerDownCb: ((pageId: string, e: FederatedPointerEvent) => void) | null = null;
  private shellClickCb: ((pageId: string) => void) | null = null;
  private headerPlayClickCb: ((pageId: string) => void) | null = null;
  private headerPointerDownCb: ((pageId: string, e: FederatedPointerEvent) => void) | null = null;
  private headerNamePointerDownCb: ((pageId: string, e: FederatedPointerEvent) => void) | null =
    null;
  private headerNameDblClickCb: ((pageId: string) => void) | null = null;
  private headerAddDeviceClickCb: ((pageId: string) => void) | null = null;
  private frameTitlePointerDownCb:
    | ((pageId: string, frameId: string, e: FederatedPointerEvent) => void)
    | null = null;

  init(): void {
    if (this.initialized) return;
    // Shells and titles in overlay: rendered on top of all scene elements, not scaled
    this.pixiApp.overlayContainer.addChild(this.shellContainer);
    this.pixiApp.overlayContainer.addChild(this.frameTitleContainer);
    this.pixiApp.overlayContainer.addChild(this.headerContainer);
    this.initialized = true;
  }

  syncPageShells(
    pageLayouts: CanvasPageLayout[],
    activePageId: string | null,
    zoom: number,
    pageNames: Map<string, string>,
    selectedPageId: string | null,
    editingPageId: string | null = null,
  ): void {
    if (!this.initialized) this.init();

    const activeIds = new Set(pageLayouts.map((p) => p.pageId));

    // Remove stale shells
    for (const [id, g] of this.shellGraphics) {
      if (!activeIds.has(id)) {
        this.shellContainer.removeChild(g);
        g.destroy();
        this.shellGraphics.delete(id);
      }
    }

    for (const layout of pageLayouts) {
      // Padded shell bounds (overlay = world * zoom, not scaled by sceneContainer)
      const sx = this.pageGeometry.getPageShellLeft(layout.pageId, pageLayouts) * zoom;
      const sy = this.pageGeometry.getPageShellTop(layout.pageId, pageLayouts) * zoom;
      const sw = this.pageGeometry.getPageShellWidth(layout.pageId, pageLayouts) * zoom;
      const sh = this.pageGeometry.getPageShellHeight(layout.pageId, pageLayouts) * zoom;

      let shell = this.shellGraphics.get(layout.pageId);
      if (!shell) {
        shell = new Graphics();
        shell.label = `shell-${layout.pageId}`;
        shell.eventMode = 'none';
        (shell as any).__pageId = layout.pageId;
        this.shellContainer.addChild(shell);
        this.shellGraphics.set(layout.pageId, shell);
      }

      shell.clear();
      shell.hitArea = null;
    }

    this.syncFrameTitles(pageLayouts, activePageId, zoom);
    this.syncPageHeaders(pageLayouts, activePageId, zoom, pageNames, selectedPageId, editingPageId);
  }

  private syncFrameTitles(
    pageLayouts: CanvasPageLayout[],
    activePageId: string | null,
    zoom: number,
  ): void {
    const seenIds = new Set<string>();

    if (zoom >= FRAME_TITLE_MIN_ZOOM) {
      const pages = this.editorState.pages();

      for (const layout of pageLayouts) {
        const page = pages.find((p) => p.id === layout.pageId);
        if (!page) continue;
        const pageId = layout.pageId;
        const isActivePage = layout.pageId === activePageId;

        const rootFrames = page.elements.filter((el) => el.type === 'frame' && !el.parentId);

        for (const frame of rootFrames) {
          seenIds.add(frame.id);

          let titleText = this.frameTitleTexts.get(frame.id);
          if (!titleText) {
            titleText = new Text({
              text: getFrameTitle(frame),
              style: new TextStyle({
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: FRAME_TITLE_FONT_SIZE,
                fill: FRAME_TITLE_COLOR_INACTIVE,
                fontWeight: '500',
              }),
            });
            titleText.label = `frame-title-${frame.id}`;
            titleText.eventMode = 'static';
            titleText.cursor = 'pointer';
            titleText.on('pointerdown', (event: FederatedPointerEvent) => {
              event.stopPropagation();
              this.frameTitlePointerDownCb?.(pageId, frame.id, event);
            });
            this.frameTitleContainer.addChild(titleText);
            this.frameTitleTexts.set(frame.id, titleText);
          }

          titleText.visible = true;
          titleText.text = getFrameTitle(frame);
          (titleText.style as TextStyle).fill = isActivePage
            ? FRAME_TITLE_COLOR_ACTIVE
            : FRAME_TITLE_COLOR_INACTIVE;

          // Position above the frame top in overlay (zoom-compensated) space
          const fx = (layout.x + frame.x) * zoom;
          const fy = (layout.y + frame.y) * zoom - FRAME_TITLE_OFFSET_Y - FRAME_TITLE_FONT_SIZE;
          titleText.position.set(fx, fy);
        }
      }
    }

    // Hide titles for frames no longer present
    for (const [id, text] of this.frameTitleTexts) {
      if (!seenIds.has(id)) {
        text.visible = false;
      }
    }
  }

  private syncPageHeaders(
    pageLayouts: CanvasPageLayout[],
    activePageId: string | null,
    zoom: number,
    pageNames: Map<string, string>,
    selectedPageId: string | null,
    editingPageId: string | null = null,
  ): void {
    const activeIds = new Set(pageLayouts.map((p) => p.pageId));

    // Remove stale header nodes
    for (const [id, node] of this.pageHeaderNodes) {
      if (!activeIds.has(id)) {
        this.headerContainer.removeChild(node.container);
        node.container.destroy({ children: true });
        this.pageHeaderNodes.delete(id);
      }
    }

    const visible = zoom >= HEADER_MIN_ZOOM;
    const pages = this.editorState.pages();

    for (const layout of pageLayouts) {
      const pageId = layout.pageId;
      const isActive = pageId === activePageId;
      const isSelected = pageId === selectedPageId;
      const pageName = pageNames.get(pageId) ?? '';
      const page = pages.find((entry) => entry.id === pageId) ?? null;
      const rootFrames =
        page?.elements.filter((element) => element.type === 'frame' && !element.parentId) ?? [];
      const deviceCount = rootFrames.length;
      const metaLabel = `${deviceCount} Device${deviceCount === 1 ? '' : 's'}`;

      const hx = this.pageGeometry.getPageShellHeaderScreenLeft(pageId, pageLayouts);
      const hy = this.pageGeometry.getPageShellHeaderScreenTop(pageId, pageLayouts);
      const shellWidth = this.pageGeometry.getPageShellHeaderScreenWidth(pageId, pageLayouts);
      const toolbarWidth = this.getToolbarWidth(shellWidth);

      let node = this.pageHeaderNodes.get(pageId);
      if (!node) {
        node = this.createHeaderNode(pageId);
        this.headerContainer.addChild(node.container);
        this.pageHeaderNodes.set(pageId, node);
      }

      node.container.visible = visible;
      node.container.position.set(hx, hy);

      node.isActive = isActive;
      this.redrawHeaderBackground(node.background, toolbarWidth, isActive, isSelected);
      this.redrawHeaderButtonBackground(node.playButtonBg, isActive, node.playHovered);
      this.redrawHeaderButtonBackground(node.addButtonBg, isActive, node.addHovered);

      // Update name text (hide it when DOM input is active)
      const isEditing = pageId === editingPageId;
      node.nameText.visible = !isEditing;
      node.nameText.text = pageName;
      const nameAlpha = isActive ? NAME_TEXT_ALPHA_ACTIVE : NAME_TEXT_ALPHA_INACTIVE;
      (node.nameText.style as TextStyle).fill = `rgba(255,255,255,${nameAlpha})`;
      node.metaText.text = metaLabel;
      const metaAlpha = isActive ? META_TEXT_ALPHA_ACTIVE : META_TEXT_ALPHA_INACTIVE;
      (node.metaText.style as TextStyle).fill = `rgba(255,255,255,${metaAlpha})`;

      const availableNameWidth = Math.max(80, toolbarWidth - NAME_TEXT_LEFT - 70);
      this.fitTextToWidth(node.nameText, pageName, availableNameWidth);
      this.fitTextToWidth(node.metaText, metaLabel, availableNameWidth);

      // Redraw play button triangle (alpha depends on active state)
      const playAlpha = node.playHovered ? 0.96 : isActive ? 0.7 : 0.45;
      node.playShape.clear();
      node.playShape
        .poly([10, 7, 10, 21, 20, 14], true)
        .fill({ color: 0xffffff, alpha: playAlpha });

      // Move add-device button to right edge of the header
      const addContainer = node.container.getChildByLabel('add-btn') as Container | null;
      if (addContainer) {
        addContainer.position.set(
          toolbarWidth - HEADER_INNER_PADDING_X - ADD_BTN_WIDTH,
          HEADER_BUTTON_TOP,
        );
      }
      node.addText.position.set(ADD_BTN_WIDTH / 2, ADD_BTN_WIDTH / 2);
      const addAlpha = node.addHovered ? 0.96 : isActive ? 0.6 : 0.4;
      (node.addText.style as TextStyle).fill = `rgba(255,255,255,${addAlpha})`;

      // Update hit areas so they reflect the current header width
      const nameContainer = node.container.getChildByLabel('name-part') as Container | null;
      if (nameContainer) {
        const nameHitWidth = Math.max(
          0,
          toolbarWidth - NAME_TEXT_LEFT - ADD_BTN_WIDTH - HEADER_INNER_PADDING_X,
        );
        nameContainer.hitArea = new Rectangle(0, 0, nameHitWidth, HEADER_HEIGHT);
      }
    }
  }

  private getToolbarWidth(shellWidth: number): number {
    return Math.round(shellWidth);
  }

  private redrawHeaderBackground(
    background: Graphics,
    width: number,
    isActive: boolean,
    isSelected: boolean,
  ): void {
    background.clear();
    background.hitArea = new Rectangle(0, 0, width, HEADER_HEIGHT);
    background.roundRect(0, 0, width, HEADER_HEIGHT, HEADER_PANEL_RADIUS).fill({
      color: HEADER_PANEL_FILL,
      alpha: HEADER_PANEL_FILL_ALPHA,
    });
    if (isSelected) {
      background.roundRect(0, 0, width, HEADER_HEIGHT, HEADER_PANEL_RADIUS).fill({
        color: HEADER_PANEL_SELECTED_FILL,
        alpha: HEADER_PANEL_SELECTED_FILL_ALPHA,
      });
    }
    background.roundRect(0, 0, width, HEADER_HEIGHT, HEADER_PANEL_RADIUS).stroke({
      width: 1,
      color: isSelected ? HEADER_PANEL_SELECTED_FILL : HEADER_PANEL_BORDER,
      alpha: isSelected
        ? HEADER_PANEL_SELECTED_BORDER_ALPHA
        : isActive
          ? HEADER_PANEL_BORDER_ALPHA_ACTIVE
          : HEADER_PANEL_BORDER_ALPHA_INACTIVE,
    });
  }

  private redrawHeaderButtonBackground(
    background: Graphics,
    isActive: boolean,
    isHovered: boolean,
  ): void {
    background.clear();
    background.roundRect(0, 0, HEADER_BUTTON_SIZE, HEADER_BUTTON_SIZE, HEADER_BUTTON_RADIUS).fill({
      color: isHovered ? HEADER_BUTTON_HOVER_COLOR : 0xffffff,
      alpha: isHovered
        ? HEADER_BUTTON_FILL_ALPHA_HOVER
        : isActive
          ? HEADER_BUTTON_FILL_ALPHA_ACTIVE
          : HEADER_BUTTON_FILL_ALPHA_INACTIVE,
    });
    background
      .roundRect(0, 0, HEADER_BUTTON_SIZE, HEADER_BUTTON_SIZE, HEADER_BUTTON_RADIUS)
      .stroke({
        width: 1,
        color: isHovered ? HEADER_BUTTON_HOVER_COLOR : 0xffffff,
        alpha: isHovered ? HEADER_BUTTON_BORDER_ALPHA_HOVER : HEADER_BUTTON_BORDER_ALPHA,
      });
  }

  private refreshHeaderActionButtonVisuals(node: PageHeaderNode): void {
    this.redrawHeaderButtonBackground(node.playButtonBg, node.isActive, node.playHovered);
    this.redrawHeaderButtonBackground(node.addButtonBg, node.isActive, node.addHovered);

    const playAlpha = node.playHovered ? 0.96 : node.isActive ? 0.7 : 0.45;
    node.playShape.clear();
    node.playShape.poly([10, 7, 10, 21, 20, 14], true).fill({ color: 0xffffff, alpha: playAlpha });

    const addAlpha = node.addHovered ? 0.96 : node.isActive ? 0.6 : 0.4;
    (node.addText.style as TextStyle).fill = `rgba(255,255,255,${addAlpha})`;
  }

  private fitTextToWidth(textNode: Text, sourceText: string, maxWidth: number): void {
    textNode.text = sourceText;
    if (textNode.width <= maxWidth) {
      return;
    }

    let truncated = sourceText;
    while (truncated.length > 1) {
      truncated = truncated.slice(0, -1);
      textNode.text = `${truncated}…`;
      if (textNode.width <= maxWidth) {
        return;
      }
    }
  }

  private createHeaderNode(pageId: string): PageHeaderNode {
    const container = new Container({ label: `page-header-${pageId}` });
    const background = new Graphics();
    background.eventMode = 'static';
    background.cursor = 'default';
    (background as any).__pageId = pageId;
    background.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
      this.headerPointerDownCb?.(pageId, e);
    });
    background.on('click', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
    });
    container.addChild(background);

    // ── Play button ───────────────────────────────────────
    let node!: PageHeaderNode;
    const playContainer = new Container({ label: 'play-btn', eventMode: 'static' });
    playContainer.position.set(HEADER_INNER_PADDING_X, HEADER_BUTTON_TOP);
    playContainer.hitArea = new Rectangle(0, 0, HEADER_BUTTON_SIZE, HEADER_BUTTON_SIZE);
    playContainer.cursor = 'pointer';
    playContainer.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
      this.headerPlayClickCb?.(pageId);
    });
    playContainer.on('click', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
    });
    playContainer.on('pointerover', () => {
      node.playHovered = true;
      this.refreshHeaderActionButtonVisuals(node);
    });
    playContainer.on('pointerout', () => {
      node.playHovered = false;
      this.refreshHeaderActionButtonVisuals(node);
    });

    const playButtonBg = new Graphics();
    playButtonBg.eventMode = 'none';
    playContainer.addChild(playButtonBg);
    const playShape = new Graphics();
    playShape.eventMode = 'none';
    playContainer.addChild(playShape);

    // ── Page name ─────────────────────────────────────────
    const nameContainer = new Container({ label: 'name-part', eventMode: 'static' });
    nameContainer.position.set(NAME_TEXT_LEFT, 0);
    nameContainer.cursor = 'grab';
    nameContainer.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
      this.headerNamePointerDownCb?.(pageId, e);
    });
    nameContainer.on('click', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
    });
    nameContainer.on('dblclick', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
      this.headerNameDblClickCb?.(pageId);
    });

    const nameText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: NAME_TEXT_FONT_SIZE,
        fill: 'rgba(255,255,255,0.7)',
        fontWeight: '600',
      }),
    });
    nameText.position.set(0, NAME_TEXT_Y);
    nameContainer.addChild(nameText);

    const metaText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: META_TEXT_FONT_SIZE,
        fill: 'rgba(255,255,255,0.45)',
        fontWeight: '500',
      }),
    });
    metaText.position.set(0, META_TEXT_Y);
    nameContainer.addChild(metaText);

    // ── Add device button ─────────────────────────────────
    const addContainer = new Container({ label: 'add-btn', eventMode: 'static' });
    addContainer.hitArea = new Rectangle(0, 0, ADD_BTN_WIDTH, ADD_BTN_WIDTH);
    addContainer.position.set(0, 0); // X is set in syncPageHeaders
    addContainer.cursor = 'pointer';
    addContainer.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
      this.headerAddDeviceClickCb?.(pageId);
    });
    addContainer.on('click', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event)?.stopPropagation();
    });
    addContainer.on('pointerover', () => {
      node.addHovered = true;
      this.refreshHeaderActionButtonVisuals(node);
    });
    addContainer.on('pointerout', () => {
      node.addHovered = false;
      this.refreshHeaderActionButtonVisuals(node);
    });

    const addButtonBg = new Graphics();
    addButtonBg.eventMode = 'none';
    addContainer.addChild(addButtonBg);
    const addText = new Text({
      text: '+',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 19,
        fill: 'rgba(255,255,255,0.6)',
        fontWeight: '500',
      }),
    });
    addText.eventMode = 'none';
    addText.anchor.set(0.5, 0.5);
    addContainer.addChild(addText);

    container.addChild(playContainer, nameContainer, addContainer);

    node = {
      container,
      background,
      nameText,
      metaText,
      playButtonBg,
      playShape,
      addButtonBg,
      addText,
      isActive: false,
      playHovered: false,
      addHovered: false,
    };

    return node;
  }

  // ── Public callback registration ─────────────────────────

  onHeaderPlayClick(cb: (pageId: string) => void): void {
    this.headerPlayClickCb = cb;
  }

  onHeaderPointerDown(cb: (pageId: string, e: FederatedPointerEvent) => void): void {
    this.headerPointerDownCb = cb;
  }

  onHeaderNamePointerDown(cb: (pageId: string, e: FederatedPointerEvent) => void): void {
    this.headerNamePointerDownCb = cb;
  }

  onHeaderNameDblClick(cb: (pageId: string) => void): void {
    this.headerNameDblClickCb = cb;
  }

  onHeaderAddDeviceClick(cb: (pageId: string) => void): void {
    this.headerAddDeviceClickCb = cb;
  }

  onFrameTitlePointerDown(
    cb: (pageId: string, frameId: string, e: FederatedPointerEvent) => void,
  ): void {
    this.frameTitlePointerDownCb = cb;
  }

  getPageIdFromTarget(target: any): string | null {
    let current = target;
    while (current) {
      const id = (current as any).__pageId;
      if (typeof id === 'string') return id;
      current = current.parent ?? null;
    }
    return null;
  }

  onShellPointerDown(cb: (pageId: string, e: FederatedPointerEvent) => void): void {
    this.shellPointerDownCb = cb;
  }

  onShellClick(cb: (pageId: string) => void): void {
    this.shellClickCb = cb;
  }

  private wireShellEvents(target: Graphics | Container, pageId: string): void {
    target.on('pointerdown', (e: FederatedPointerEvent) => {
      this.shellPointerDownCb?.(pageId, e);
    });
    target.on('click', () => {
      this.shellClickCb?.(pageId);
    });
  }

  destroy(): void {
    for (const [, g] of this.shellGraphics) g.destroy();
    for (const [, t] of this.frameTitleTexts) t.destroy();
    for (const [, n] of this.pageHeaderNodes) n.container.destroy({ children: true });
    this.shellGraphics.clear();
    this.frameTitleTexts.clear();
    this.pageHeaderNodes.clear();
    this.shellContainer.destroy({ children: true });
    this.frameTitleContainer.destroy({ children: true });
    this.headerContainer.destroy({ children: true });
    this.initialized = false;
  }
}
