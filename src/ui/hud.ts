import type { HighScore, InitialsEntry } from '../rules/arcade';
import type { RunPhase } from '../rules/run';
import './hud.css';

export interface HudState {
  phase: RunPhase;
  /** Seconds to Last Call. */
  clock: number;
  /** Seconds left in sudden death. */
  grace: number;
  stock: number;
  initials: InitialsEntry | null;
  showingTable: boolean;
  canStart: boolean;
  scores: HighScore[];
  finalScore: number;
  now: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The run's DOM layer: the clock and stock chips at the top, the LAST CALL / SUDDEN DEATH banners, the "PRESS TO PLAY"
 * prompt, one-button initials, and the high-score table. Chunky outlined cartoon text in the game's palette.
 */
export class Hud {
  private readonly el: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  private readonly stock: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly entry: HTMLDivElement;
  private readonly table: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private toastUntil = 0;
  private toastClock = 0;
  private painted = '';
  private tablePainted = '';

  constructor(parent: HTMLElement) {
    const div = (cls: string, p: HTMLElement = this.el) => {
      const d = document.createElement('div');
      d.className = cls;
      p.appendChild(d);
      return d;
    };
    this.el = document.createElement('div');
    this.el.className = 'hud';
    parent.appendChild(this.el);
    const chips = div('hud-chips');
    this.clock = div('hud-chip hud-clock', chips);
    this.stock = div('hud-chip hud-stock', chips);
    this.banner = div('hud-banner');
    this.prompt = div('hud-prompt');
    this.entry = div('hud-entry');
    this.table = div('hud-table');
    this.toastEl = div('hud-toast');
  }

  /** A short message that pops in under the chips. */
  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastUntil = this.toastClock + 1.6;
  }

  update(s: HudState): void {
    this.toastClock = performance.now() / 1000;
    this.toastEl.classList.toggle('on', this.toastClock < this.toastUntil);
    const active = s.phase === 'playing' || s.phase === 'suddenDeath' || s.phase === 'lastCall' || s.phase === 'sweep';
    const banner =
      s.phase === 'lastCall' ? 'LAST CALL!' : s.phase === 'suddenDeath' ? `OUT OF COINS ${Math.ceil(s.grace)}` : s.phase === 'sweep' ? 'FINAL PUSH!' : '';
    const prompt = s.phase === 'ready' ? 'PRESS TO PLAY' : s.showingTable && s.canStart ? 'PRESS TO PLAY AGAIN' : '';
    const key = `${active}|${Math.ceil(s.clock)}|${s.stock}|${banner}|${prompt}`;
    if (key !== this.painted) {
      this.painted = key;
      this.el.classList.toggle('active', active);
      this.clock.textContent = s.phase === 'lastCall' || s.phase === 'sweep' ? 'LAST CALL' : fmt(s.clock);
      this.clock.classList.toggle('warn', active && s.clock > 0 && s.clock <= 30);
      this.stock.textContent = `${s.stock}`;
      this.stock.classList.toggle('warn', active && s.stock <= 10);
      this.banner.textContent = banner;
      this.banner.classList.toggle('on', banner !== '');
      this.banner.classList.toggle('danger', s.phase === 'suddenDeath');
      this.prompt.textContent = prompt;
      this.prompt.classList.toggle('on', prompt !== '');
    }
    this.paintEntry(s);
    this.paintTable(s);
  }

  private paintEntry(s: HudState): void {
    const e = s.initials;
    this.entry.classList.toggle('on', e !== null);
    if (!e) return;
    const progress = e.progress(s.now);
    this.entry.replaceChildren();
    const title = document.createElement('div');
    title.className = 'hud-entry-title';
    title.textContent = `NEW HIGH SCORE ${s.finalScore.toLocaleString('en-US')}`;
    const letters = document.createElement('div');
    letters.className = 'hud-letters';
    e.text.split('').forEach((ch, i) => {
      const l = document.createElement('span');
      l.textContent = ch;
      l.className = i < e.index ? 'locked' : i === e.index ? 'current' : '';
      if (i === e.index) l.style.setProperty('--hold', String(progress));
      letters.append(l);
    });
    const help = document.createElement('div');
    help.className = 'hud-entry-help';
    help.textContent = 'TAP: NEXT LETTER  •  HOLD: LOCK IT';
    this.entry.append(title, letters, help);
  }

  private paintTable(s: HudState): void {
    this.table.classList.toggle('on', s.showingTable);
    if (!s.showingTable) return;
    const key = JSON.stringify([s.scores, s.finalScore]);
    if (key === this.tablePainted) return;
    this.tablePainted = key;
    this.table.replaceChildren();
    const title = document.createElement('div');
    title.className = 'hud-table-title';
    title.textContent = 'HIGH SCORES';
    const yours = document.createElement('div');
    yours.className = 'hud-table-yours';
    yours.textContent = `YOUR SCORE ${s.finalScore.toLocaleString('en-US')}`;
    const list = document.createElement('ol');
    let marked = false;
    for (const row of s.scores.slice(0, 8)) {
      const li = document.createElement('li');
      const mine = !marked && row.score === s.finalScore;
      if (mine) marked = true;
      li.className = mine ? 'mine' : '';
      const name = document.createElement('span');
      name.textContent = row.initials;
      const score = document.createElement('span');
      score.textContent = row.score.toLocaleString('en-US');
      li.append(name, score);
      list.append(li);
    }
    this.table.append(title, yours, list);
  }
}
