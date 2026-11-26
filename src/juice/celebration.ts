/**
 * A jubilant, skippable celebration card (Peggle-style), drawn as a full-screen takeover: the game dims behind a
 * spinning sunburst and halftone, a giant stamp slams in, a huge tally counts up on its own plaque, and a "press to
 * continue" band rises from the bottom once it may be skipped. DOM only; the game supplies fireworks, music and
 * shake (drawn underneath, so the backdrop stays translucent). Reusable by any game.
 */
export interface CelebrationSpec {
  stamp: string;
  /** Smaller line under the stamp. */
  sub?: string;
  /** Amount the tally counts up to. */
  total: number;
  /** Text before the counting number. */
  label?: string;
  color?: string;
  /** Seconds before a press can skip it. */
  skipAfter?: number;
  /** Seconds it lasts unless skipped. */
  duration?: number;
}

export class Celebration {
  readonly el: HTMLDivElement;
  private readonly backdrop: HTMLDivElement;
  private readonly rays: HTMLDivElement;
  private readonly stamp: HTMLDivElement;
  private readonly plaque: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly tally: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private spec: Required<CelebrationSpec> | null = null;
  private age = 0;
  private shown = -1;

  constructor(parent: HTMLElement) {
    const div = (className: string, parentEl: HTMLElement): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = className;
      parentEl.appendChild(d);
      return d;
    };
    this.el = document.createElement('div');
    this.el.className = 'juice-celebration';
    this.backdrop = div('juice-cel-backdrop', this.el);
    this.rays = div('juice-rays juice-cel-rays', this.el);
    div('juice-cel-halftone', this.el);
    const stage = div('juice-cel-stage', this.el);
    this.stamp = div('juice-stamp', stage);
    this.plaque = div('juice-cel-plaque', stage);
    this.sub = div('juice-stamp-sub', this.plaque);
    this.tally = div('juice-tally', this.plaque);
    this.hint = div('juice-hint', this.el);
    const button = document.createElement('span');
    button.className = 'juice-hint-button';
    const label = document.createElement('span');
    label.textContent = 'PRESS TO CONTINUE';
    this.hint.append(button, label);
    parent.appendChild(this.el);
  }

  get active(): boolean {
    return this.spec !== null;
  }

  get skippable(): boolean {
    return this.spec !== null && this.age >= this.spec.skipAfter;
  }

  /** The tally's displayed value right now. */
  get counted(): number {
    return this.shown < 0 ? 0 : this.shown;
  }

  start(spec: CelebrationSpec): void {
    this.spec = { sub: '', label: '', color: '#ffc83a', skipAfter: 1.5, duration: 6, ...spec };
    this.age = 0;
    this.shown = -1;
    this.stamp.textContent = spec.stamp;
    this.sub.textContent = this.spec.sub;
    this.sub.hidden = !this.spec.sub;
    // Size the tally once for its final width so it never outgrows the screen or reflows while counting.
    const chars = `${this.spec.label}${spec.total.toLocaleString('en-US')}`.length;
    this.el.style.setProperty('--tally-chars', String(Math.max(4, chars)));
    this.el.style.setProperty('--stamp-color', this.spec.color);
    this.el.classList.add('on');
  }

  /** Jumps to the end of the tally and closes. Returns false if it cannot be skipped yet. */
  skip(): boolean {
    if (!this.skippable) return false;
    this.close();
    return true;
  }

  update(dt: number): void {
    const s = this.spec;
    if (!s) return;
    this.age += dt;
    const u = this.age;
    // Backdrop: dims in fast; the sunburst grows in and keeps turning.
    this.backdrop.style.opacity = String(Math.min(1, u / 0.15));
    this.rays.style.opacity = String(Math.min(1, u / 0.3));
    this.rays.style.transform = `translate(-50%, -50%) rotate(${u * 18}deg) scale(${0.5 + 0.5 * Math.min(1, u / 0.35)})`;
    // Stamp: slams from 4x with a tilt, overshoots, settles, then wobbles slightly while the tally runs.
    const inT = Math.min(1, u / 0.18);
    const scale = u < 0.18 ? 4 - 3 * inT * inT : u < 0.32 ? 1 - 0.12 * Math.sin(((u - 0.18) / 0.14) * Math.PI) : 1 + 0.02 * Math.sin(u * 9);
    this.stamp.style.transform = `rotate(${u < 0.18 ? -25 * (1 - inT) - 6 : -6}deg) scale(${scale})`;
    this.stamp.style.opacity = String(Math.min(1, inT * 2));
    // Plaque: pops up from below just after the slam.
    const pT = Math.max(0, Math.min(1, (u - 0.25) / 0.2));
    const pop = pT < 1 ? 0.6 + 0.4 * pT + 0.15 * Math.sin(pT * Math.PI) : 1;
    this.plaque.style.opacity = String(Math.min(1, pT * 2));
    this.plaque.style.transform = `translateY(${(1 - pT) * 20}%) scale(${pop})`;
    // Tally: counts up over 0.4–2.6 s with an ease-out, ticking digits fast at first.
    const tu = Math.max(0, Math.min(1, (u - 0.4) / 2.2));
    const value = Math.round(s.total * (1 - (1 - tu) ** 3));
    if (value !== this.shown) {
      this.shown = value;
      this.tally.textContent = `${s.label}${value.toLocaleString('en-US')}`;
    }
    this.tally.style.transform = `scale(${tu < 1 ? 1 + 0.04 * Math.sin(u * 40) : 1 + 0.18 * Math.exp(-(u - 2.6) * 6)})`;
    // Continue band: rises in once a press can skip, then the label breathes.
    const hT = Math.max(0, Math.min(1, (u - s.skipAfter) / 0.25));
    this.hint.style.opacity = String(hT);
    this.hint.style.transform = `translateY(${(1 - hT) ** 2 * 100}%)`;
    this.hint.style.setProperty('--pulse', hT < 1 ? '1' : String(1 + 0.06 * Math.sin((u - s.skipAfter) * 6)));
    const fade = s.duration - u;
    this.el.style.opacity = fade < 0.4 ? String(Math.max(0, fade / 0.4)) : '1';
    if (u >= s.duration) this.close();
  }

  private close(): void {
    this.spec = null;
    this.el.classList.remove('on');
    this.el.style.opacity = '0';
  }

  dispose(): void {
    this.el.remove();
  }
}
