import type { Juice } from './core';
import { fitScale, slamStart } from './fit';

/**
 * DOM overlay for screen-space juice: the full-screen flash, and big title cards ("QUAKE!!!") that slam in with an
 * overshoot onto a slanted comic band in the upper third. A card with `priority` > 0 is a big moment: it also dims the
 * screen briefly behind a spinning sunburst (a light takeover that clears quickly so the tray stays readable).
 * Cheap: CSS transforms and opacity, no extra render pass.
 */
export class Overlay {
  readonly el: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly dim: HTMLDivElement;
  private readonly rays: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private titleAge = Infinity;
  private titleLife = 1.4;
  private titlePriority = 0;
  private big = false;
  /** Rest scale that fits the card to the screen, and the capped slam start (both measured when the text changes). */
  private fit = 1;
  private slam = 3;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'juice-overlay';
    this.flash = document.createElement('div');
    this.flash.className = 'juice-flash';
    this.card = document.createElement('div');
    this.card.className = 'juice-titlecard';
    this.dim = document.createElement('div');
    this.dim.className = 'juice-titlecard-dim';
    this.rays = document.createElement('div');
    this.rays.className = 'juice-rays juice-titlecard-rays';
    this.band = document.createElement('div');
    this.band.className = 'juice-band juice-titlecard-band';
    this.title = document.createElement('div');
    this.title.className = 'juice-title';
    this.card.append(this.dim, this.rays, this.band, this.title);
    this.el.append(this.flash, this.card);
    parent.appendChild(this.el);
  }

  /**
   * Slams a title card in; `sub` is an optional smaller second line. A card never replaces a showing card of higher
   * `priority`. Returns whether it showed.
   */
  titleCard(text: string, color: string, sub = '', life = 1.4, priority = 0): boolean {
    if (this.titleAge < this.titleLife && priority < this.titlePriority) return false;
    this.titlePriority = priority;
    this.big = priority > 0;
    this.title.replaceChildren();
    const main = document.createElement('span');
    main.textContent = text;
    this.title.append(main);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      this.title.append(s);
    }
    this.card.style.setProperty('--title-color', color);
    this.card.classList.toggle('big', this.big);
    this.titleAge = 0;
    this.titleLife = life;
    this.measure();
    return true;
  }

  update(juice: Juice, dt: number): void {
    const f = juice.flash;
    this.flash.style.opacity = f ? f.opacity.toFixed(3) : '0';
    if (f) this.flash.style.background = f.color;
    this.titleAge += dt;
    const u = this.titleAge / this.titleLife;
    if (u >= 1) {
      this.card.style.opacity = '0';
      return;
    }
    this.card.style.opacity = '1';
    const t = this.titleAge;
    // Slam: start huge and tilted, snap to 1 with an overshoot, hold, then zoom away.
    const inT = Math.min(1, u / 0.12);
    const slam = this.slam;
    const scale = this.fit * (u < 0.12 ? slam - (slam - 1) * inT : u < 0.2 ? 1 - 0.1 * Math.sin(((u - 0.12) / 0.08) * Math.PI) : u > 0.85 ? 1 + ((u - 0.85) / 0.15) * 0.25 : 1);
    const rot = u < 0.12 ? -12 * (1 - inT) : -4;
    const out = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    this.title.style.opacity = String(Math.min(out, inT * 1.5));
    this.title.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;
    if (this.big) {
      // Band: swipes in across the screen just ahead of the word, then thins away with it.
      const bandIn = Math.min(1, t / 0.12);
      this.band.style.opacity = String(out);
      this.band.style.transform = `translateY(-50%) rotate(-4deg) scaleX(${1 - (1 - bandIn) ** 3}) scaleY(${out})`;
      // Dim: peaks with the slam, then backs off to a light veil in under half a second so play stays visible.
      const dim = t < 0.08 ? t / 0.08 : Math.max(0.35, 1 - (t - 0.08) / 0.45);
      this.dim.style.opacity = String(dim * out);
      this.rays.style.opacity = String(Math.min(1, t / 0.15) * out);
      this.rays.style.transform = `translate(-50%, -50%) rotate(${t * 40}deg) scale(${0.6 + 0.4 * Math.min(1, t / 0.2)})`;
    }
  }

  /** Fits the title to 92% of the screen width and caps how far its slam-in overshoots. */
  private measure(): void {
    this.title.style.transform = 'translate(-50%, -50%)';
    const screen = this.el.clientWidth || window.innerWidth;
    this.fit = fitScale(this.title, screen * 0.92);
    this.slam = slamStart(this.title.offsetWidth * this.fit, screen, 3);
  }

  dispose(): void {
    this.el.remove();
  }
}
