import { Injectable, inject } from '@angular/core';
import { Graphics, TilingSprite, Texture, Rectangle } from 'pixi.js';
import { CanvasPixiApplicationService } from './canvas-pixi-application.service';

const GRID_SIZE = 20;
const DOT_RADIUS = 1;
const DOT_COLOR = 0x3f3f46; // zinc-700 equivalent
const GLOW_RADIUS = 170;
const GLOW_DOT_COLOR = 0xe4e4e7;
const GLOW_MAX_ALPHA = 0.9;

@Injectable()
export class CanvasPixiGridService {
  private readonly pixiApp = inject(CanvasPixiApplicationService);
  private tilingSprite: TilingSprite | null = null;
  private dotTexture: Texture | null = null;
  private glowGraphics: Graphics | null = null;
  private glowVisible = false;
  private glowScreenX = 0;
  private glowScreenY = 0;
  private currentOffsetX = 0;
  private currentOffsetY = 0;
  private currentNormalizedScale = 1;
  private initialized = false;

  setVisible(visible: boolean): void {
    if (this.tilingSprite) {
      this.tilingSprite.visible = visible;
    }

    if (this.glowGraphics) {
      this.glowGraphics.visible = visible;
    }
  }

  init(): void {
    if (this.initialized || !this.pixiApp.pixiApp) return;

    const app = this.pixiApp.pixiApp;
    const renderer = app.renderer;

    // Create a small texture with a single dot
    const dotGraphics = new Graphics();
    dotGraphics.circle(GRID_SIZE / 2, GRID_SIZE / 2, DOT_RADIUS);
    dotGraphics.fill({ color: DOT_COLOR });

    this.dotTexture = renderer.generateTexture({
      target: dotGraphics,
      resolution: window.devicePixelRatio || 1,
      frame: new Rectangle(0, 0, GRID_SIZE, GRID_SIZE),
    });

    dotGraphics.destroy();

    this.tilingSprite = new TilingSprite({
      texture: this.dotTexture as Texture,
      width: app.screen.width,
      height: app.screen.height,
    });
    this.tilingSprite.label = 'background-grid';

    this.glowGraphics = new Graphics();
    this.glowGraphics.label = 'background-grid-glow';

    // Insert behind everything (index 0 on stage)
    app.stage.addChildAt(this.tilingSprite, 0);
    app.stage.addChildAt(this.glowGraphics, 1);

    this.initialized = true;
  }

  syncGrid(offsetX: number, offsetY: number, zoom: number): void {
    if (!this.tilingSprite || !this.pixiApp.pixiApp) return;

    const app = this.pixiApp.pixiApp;
    this.tilingSprite.width = app.screen.width;
    this.tilingSprite.height = app.screen.height;

    // Tile offset follows the pan so dots appear fixed in world space
    this.tilingSprite.tilePosition.set(offsetX, offsetY);

    // Scale tiles with zoom but normalize to keep dot spacing in a reasonable range
    const rawScreen = GRID_SIZE * zoom;
    const level = Math.round(Math.log2(rawScreen / GRID_SIZE));
    const normalizedScale = rawScreen / Math.pow(2, level) / GRID_SIZE;
    this.tilingSprite.tileScale.set(normalizedScale, normalizedScale);

    this.currentOffsetX = offsetX;
    this.currentOffsetY = offsetY;
    this.currentNormalizedScale = normalizedScale;
    this.redrawGlow();
  }

  updatePointerGlow(screenX: number, screenY: number, visible = true): void {
    this.glowScreenX = screenX;
    this.glowScreenY = screenY;
    this.glowVisible = visible;
    this.redrawGlow();
  }

  hideGlow(): void {
    this.glowVisible = false;
    this.glowGraphics?.clear();
  }

  private redrawGlow(): void {
    if (!this.glowGraphics || !this.pixiApp.pixiApp) {
      return;
    }

    this.glowGraphics.clear();

    if (!this.glowVisible) {
      return;
    }

    const spacing = GRID_SIZE * this.currentNormalizedScale;
    if (spacing <= 0) {
      return;
    }

    const firstDotX = this.currentOffsetX + (GRID_SIZE / 2) * this.currentNormalizedScale;
    const firstDotY = this.currentOffsetY + (GRID_SIZE / 2) * this.currentNormalizedScale;
    const minX = this.glowScreenX - GLOW_RADIUS;
    const maxX = this.glowScreenX + GLOW_RADIUS;
    const minY = this.glowScreenY - GLOW_RADIUS;
    const maxY = this.glowScreenY + GLOW_RADIUS;
    const startColumn = Math.floor((minX - firstDotX) / spacing);
    const endColumn = Math.ceil((maxX - firstDotX) / spacing);
    const startRow = Math.floor((minY - firstDotY) / spacing);
    const endRow = Math.ceil((maxY - firstDotY) / spacing);
    const dotRadius = Math.max(0.9, DOT_RADIUS * this.currentNormalizedScale + 0.15);

    for (let column = startColumn; column <= endColumn; column += 1) {
      const x = firstDotX + column * spacing;

      for (let row = startRow; row <= endRow; row += 1) {
        const y = firstDotY + row * spacing;
        const distance = Math.hypot(x - this.glowScreenX, y - this.glowScreenY);
        if (distance > GLOW_RADIUS) {
          continue;
        }

        const alpha = Math.pow(1 - distance / GLOW_RADIUS, 1.7) * GLOW_MAX_ALPHA;
        this.glowGraphics.circle(x, y, dotRadius);
        this.glowGraphics.fill({ color: GLOW_DOT_COLOR, alpha });
      }
    }
  }

  destroy(): void {
    this.tilingSprite?.destroy();
    this.dotTexture?.destroy();
    this.glowGraphics?.destroy();
    this.tilingSprite = null;
    this.dotTexture = null;
    this.glowGraphics = null;
    this.initialized = false;
  }
}
