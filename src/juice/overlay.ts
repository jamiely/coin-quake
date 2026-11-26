import type { Juice } from './core';

/**
 * DOM overlay for screen-space juice: the full-screen flash, and big title cards ("QUAKE!!!") that slam in with an
 * overshoot. Cheap: CSS transforms and opacity, no extra render pass.
 */
export class Overlay {
  readonly el: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private titleAge = Infinity;
  private titleLife = 1.4;
  private titlePriority = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'juice-overlay';
    this.flash = document.createElement('div');
    this.flash.className = 'juice-flash';
    this.title = document.createElement('div');
    this.title.className = 'juice-title';
    this.el.append(this.flash, this.title);
    parent.appendChild(this.el);
  }

  /**
   * Slams a title card in; `sub` is an optional smaller second line. A card never replaces a showing card of higher
   * `priority`. Returns whether it showed.
   */
  titleCard(text: string, color: string, sub = '', life = 1.4, priority = 0): boolean {
    if (this.titleAge < this.titleLife && priority < this.titlePriority) return false;
    this.titlePriority = priority;
    this.title.replaceChildren();
    const main = document.createElement('span');
    main.textContent = text;
    this.title.append(main);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      this.title.append(s);
    }
    this.title.style.setProperty('--title-color', color);
    this.titleAge = 0;
    this.titleLife = life;
    return true;
  }

  update(juice: Juice, dt: number): void {
    const f = juice.flash;
    this.flash.style.opacity = f ? f.opacity.toFixed(3) : '0';
    if (f) this.flash.style.background = f.color;
    this.titleAge += dt;
    const u = this.titleAge / this.titleLife;
    if (u >= 1) {
      this.title.style.opacity = '0';
      return;
    }
    // Slam: start huge and tilted, snap to 1 with an overshoot, hold, then zoom away.
    const inT = Math.min(1, u / 0.12);
    const scale = u < 0.12 ? 3 - 2 * inT : u < 0.2 ? 1 - 0.1 * Math.sin(((u - 0.12) / 0.08) * Math.PI) : u > 0.85 ? 1 + ((u - 0.85) / 0.15) * 0.6 : 1;
    const rot = u < 0.12 ? -12 * (1 - inT) : -3;
    this.title.style.opacity = String(u > 0.85 ? 1 - (u - 0.85) / 0.15 : Math.min(1, inT * 1.5));
    this.title.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
  }

  dispose(): void {
    this.el.remove();
  }
}
