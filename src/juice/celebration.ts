/**
 * A jubilant, skippable celebration card (Peggle-style): a giant stamp that slams in, a score tally that counts up,
 * and a "press to continue" hint once it may be skipped. DOM only; the game supplies fireworks, music and shake by
 * listening to `onBeat` and the returned timings. Reusable by any game.
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
  private readonly stamp: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly tally: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private spec: Required<CelebrationSpec> | null = null;
  private age = 0;
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'juice-celebration';
    this.stamp = document.createElement('div');
    this.stamp.className = 'juice-stamp';
    this.sub = document.createElement('div');
    this.sub.className = 'juice-stamp-sub';
    this.tally = document.createElement('div');
    this.tally.className = 'juice-tally';
    this.hint = document.createElement('div');
    this.hint.className = 'juice-hint';
    this.hint.textContent = 'PRESS TO CONTINUE';
    this.el.append(this.stamp, this.sub, this.tally, this.hint);
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
    // Stamp: slams from 4x with a tilt, overshoots, settles, then wobbles slightly while the tally runs.
    const inT = Math.min(1, u / 0.18);
    const scale = u < 0.18 ? 4 - 3 * inT * inT : u < 0.32 ? 1 - 0.12 * Math.sin(((u - 0.18) / 0.14) * Math.PI) : 1 + 0.02 * Math.sin(u * 9);
    this.stamp.style.transform = `rotate(${u < 0.18 ? -25 * (1 - inT) - 8 : -8}deg) scale(${scale})`;
    this.stamp.style.opacity = String(Math.min(1, inT * 2));
    // Tally: counts up over 0.4–2.6 s with an ease-out, ticking digits fast at first.
    const tu = Math.max(0, Math.min(1, (u - 0.4) / 2.2));
    const value = Math.round(s.total * (1 - (1 - tu) ** 3));
    if (value !== this.shown) {
      this.shown = value;
      this.tally.textContent = `${s.label}${value.toLocaleString('en-US')}`;
    }
    this.tally.style.opacity = String(Math.min(1, Math.max(0, (u - 0.3) * 4)));
    this.tally.style.transform = `scale(${tu < 1 ? 1 + 0.05 * Math.sin(u * 40) : 1 + 0.15 * Math.exp(-(u - 2.6) * 6)})`;
    this.hint.style.opacity = u >= s.skipAfter ? String(0.6 + 0.4 * Math.sin(u * 6)) : '0';
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
