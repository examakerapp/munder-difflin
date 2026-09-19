import { Container } from 'pixi.js';

// Simplified port of shahar061/the-office (office/engine/camera.ts).
// Phase targeting is dropped (we have no project phases); kept: fit-to-screen,
// map-edge clamping, smooth lerp, a manual focus(), and nudgeToward() used to
// pan toward the selected agent.

const LERP_SPEED = 0.08;

export class Camera {
  private container: Container;
  private currentX = 0;
  private currentY = 0;
  private currentZoom = 1;
  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private viewWidth = 960;
  private viewHeight = 800;
  private mapWidth = 640;
  private mapHeight = 480;
  private manualOverride = false;

  private nudgeOffsetX = 0;
  private nudgeOffsetY = 0;
  private nudgeElapsed = 0;
  private nudgeDuration = 0;
  private readonly nudgeStrength = 0.4;

  constructor(container: Container) {
    this.container = container;
  }

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    if (!this.manualOverride) this.fitToScreen();
  }

  private getMinZoom(): number {
    if (this.viewWidth === 0 || this.viewHeight === 0) return 1;
    // Math.max, not Math.min: this is a "cover" fit, not a "contain" fit. A
    // contain fit (the old behaviour) always shows the whole map, but leaves
    // letterbox bars — rendered in the canvas's own near-black clear colour —
    // on whichever axis doesn't match the viewport's aspect ratio. Now that
    // the floor is a real pannable canvas (see panBy/zoomAt below), there's no
    // reason to ever show that dead space: covering crops the excess instead,
    // and the user can drag to see whatever got cropped.
    return Math.max(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight);
  }

  /** Fit the whole map to the viewport, centered. */
  fitToScreen(): void {
    this.manualOverride = false;
    this.targetX = this.mapWidth / 2;
    this.targetY = this.mapHeight / 2;
    this.targetZoom = this.getMinZoom();
  }

  /** Pan/zoom toward a world point (used when an agent is selected). */
  focusOn(worldX: number, worldY: number, zoom?: number): void {
    this.manualOverride = true;
    this.targetX = worldX;
    this.targetY = worldY;
    this.targetZoom = Math.max(this.getMinZoom(), Math.min(4, zoom ?? this.currentZoom));
  }

  /**
   * Drag-to-pan, in screen pixels (e.g. pointermove's clientX/Y delta since the
   * last event). Applied 1:1 with no lerp — a hand-tool drag has to track the
   * cursor exactly, the smoothing used for focusOn()/nudgeToward() would just
   * read as lag here. Takes manual control like focusOn() does, so the camera
   * doesn't snap back to fit-to-screen on the next resize.
   */
  panBy(dxScreen: number, dyScreen: number): void {
    this.manualOverride = true;
    this.currentX -= dxScreen / this.currentZoom;
    this.currentY -= dyScreen / this.currentZoom;
    this.targetX = this.currentX;
    this.targetY = this.currentY;
  }

  /**
   * Scroll-to-zoom, anchored on a screen point (the cursor) so that point stays
   * under the cursor as the zoom changes, the way every other pan/zoom canvas
   * behaves. `factor` multiplies the current zoom (e.g. 1.1 to zoom in, 1/1.1 to
   * zoom out); clamped to the same [minZoom, 4] range as everything else.
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    this.manualOverride = true;
    const worldX = (screenX - this.container.x) / this.currentZoom;
    const worldY = (screenY - this.container.y) / this.currentZoom;
    const newZoom = Math.max(this.getMinZoom(), Math.min(4, this.currentZoom * factor));
    const nextX = (this.viewWidth / 2 - screenX) / newZoom + worldX;
    const nextY = (this.viewHeight / 2 - screenY) / newZoom + worldY;
    this.currentZoom = newZoom;
    this.targetZoom = newZoom;
    this.currentX = nextX;
    this.currentY = nextY;
    this.targetX = nextX;
    this.targetY = nextY;
  }

  /** A gentle, decaying pan toward a world point without taking manual control. */
  nudgeToward(worldX: number, worldY: number, duration = 1200): void {
    if (this.manualOverride) return;
    this.nudgeOffsetX = (worldX - this.targetX) * this.nudgeStrength;
    this.nudgeOffsetY = (worldY - this.targetY) * this.nudgeStrength;
    this.nudgeElapsed = 0;
    this.nudgeDuration = duration / 1000;
  }

  update(dt: number): void {
    this.currentX += (this.targetX - this.currentX) * LERP_SPEED;
    this.currentY += (this.targetY - this.currentY) * LERP_SPEED;
    this.currentZoom += (this.targetZoom - this.currentZoom) * LERP_SPEED;

    if (this.nudgeDuration > 0) {
      this.nudgeElapsed += dt;
      const t = Math.min(this.nudgeElapsed / this.nudgeDuration, 1);
      const ease = 1 - t;
      this.currentX += this.nudgeOffsetX * ease;
      this.currentY += this.nudgeOffsetY * ease;
      if (t >= 1) {
        this.nudgeDuration = 0;
        this.nudgeOffsetX = 0;
        this.nudgeOffsetY = 0;
      }
    }

    this.container.scale.set(this.currentZoom);
    this.container.x = this.viewWidth / 2 - this.currentX * this.currentZoom;
    this.container.y = this.viewHeight / 2 - this.currentY * this.currentZoom;

    const scaledW = this.mapWidth * this.currentZoom;
    const scaledH = this.mapHeight * this.currentZoom;
    if (scaledW <= this.viewWidth) {
      this.container.x = (this.viewWidth - scaledW) / 2;
    } else {
      this.container.x = Math.min(0, Math.max(this.viewWidth - scaledW, this.container.x));
    }
    if (scaledH <= this.viewHeight) {
      this.container.y = (this.viewHeight - scaledH) / 2;
    } else {
      this.container.y = Math.min(0, Math.max(this.viewHeight - scaledH, this.container.y));
    }
  }
}
