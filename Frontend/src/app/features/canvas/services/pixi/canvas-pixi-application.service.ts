import { Injectable, OnDestroy, signal } from '@angular/core';
import { Application, Container } from 'pixi.js';

@Injectable()
export class CanvasPixiApplicationService implements OnDestroy {
  private app: Application | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private hostElement: HTMLElement | null = null;

  readonly ready = signal(false);

  /** Root container — receives translate(pan offset) */
  readonly worldContainer = new Container({ label: 'world' });

  /** Child of world — receives scale(zoom). Holds page shells + elements. */
  readonly sceneContainer = new Container({ label: 'scene' });

  /** Child of world — panned but NOT scaled. Selection handles, hover outlines, snap lines. */
  readonly overlayContainer = new Container({ label: 'overlay' });

  get pixiApp(): Application | null {
    return this.app;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }

  async init(host: HTMLElement): Promise<void> {
    if (this.app) {
      return;
    }

    this.hostElement = host;

    const app = new Application();

    await app.init({
      background: 0x0f0f0f,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: host,
      eventMode: 'static',
      eventFeatures: {
        move: true,
        globalMove: true,
        click: true,
        wheel: true,
      },
    });

    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.style.position = 'absolute';
    app.canvas.style.inset = '0';
    app.canvas.style.zIndex = '1';

    this.worldContainer.addChild(this.sceneContainer);
    this.worldContainer.addChild(this.overlayContainer);
    app.stage.addChild(this.worldContainer);

    // Enable pointer events on stage for pan/click on empty space
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;

    this.app = app;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.app) {
        this.app.renderer.resize(host.clientWidth, host.clientHeight);
        this.app.stage.hitArea = this.app.screen;
      }
    });
    this.resizeObserver.observe(host);

    this.ready.set(true);
  }

  /** Update viewport transform: pan offset + zoom level. */
  syncViewport(offsetX: number, offsetY: number, zoom: number): void {
    this.worldContainer.position.set(offsetX, offsetY);
    this.sceneContainer.scale.set(zoom, zoom);
    // Overlay is panned with world but not scaled — keeps handle sizes constant
  }

  /** Convert a screen point (relative to canvas element) to world (scene) coordinates. */
  screenToWorld(
    screenX: number,
    screenY: number,
    zoom: number,
    offsetX: number,
    offsetY: number,
  ): { x: number; y: number } {
    return {
      x: (screenX - offsetX) / zoom,
      y: (screenY - offsetY) / zoom,
    };
  }

  getCanvasRect(): DOMRect | null {
    return this.app?.canvas.getBoundingClientRect() ?? null;
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.app) {
      this.app.stage.removeChildren();
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }

    this.hostElement = null;
    this.ready.set(false);
  }
}
