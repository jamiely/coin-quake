import * as THREE from 'three';
import type { Sound } from './audio/sound';
import { DROPPER, PUSHER, TRAY } from './config';
import { Celebration, Juice, Overlay, ParticlePool, PopupPool, type Recipe, type Weight } from './juice';
import { PALETTE } from './render/toon';
import type { PressureEvent, Tier } from './rules/pressure';

/** Coin Quake's recipe table: every event at every weight (GAME_DESIGN.md §4.1). */
export const RECIPES: Record<string, Partial<Record<Weight, Recipe>>> = {
  drop: { 1: { trauma: 0.1, kick: 0.35 } },
  land: { 1: { trauma: 0.04 }, 2: { trauma: 0.08 } },
  payout: {
    1: { trauma: 0.08, kick: 0.3 },
    2: { trauma: 0.14, kick: 0.5, flash: { color: '#ffe27a', opacity: 0.08, fade: 0.15 } },
  },
  loss: { 1: { trauma: 0.06 } },
  milestone: {
    1: { trauma: 0.35, hitStop: 0.06, punch: -2.5, flash: { color: '#ffffff', opacity: 0.35, fade: 0.25 } },
    3: { trauma: 0.5, hitStop: 0.09, punch: -3.5, flash: { color: '#ffffff', opacity: 0.5, fade: 0.3 }, slowMo: { scale: 0.4, hold: 0.25 } },
    5: { trauma: 0.7, hitStop: 0.12, punch: -5, flash: { color: '#fff1a8', opacity: 0.7, fade: 0.4 }, slowMo: { scale: 0.3, hold: 0.4 } },
  },
  tierUp: { 1: { trauma: 0.3, flash: { color: '#ff7a3d', opacity: 0.2, fade: 0.35 } } },
  quake: {
    5: { trauma: 1, hitStop: 0.15, punch: -6, flash: { color: '#ffffff', opacity: 0.95, fade: 0.6 }, slowMo: { scale: 0.25, hold: 0.6 } },
  },
  celebrate: { 5: { trauma: 0.8, hitStop: 0.12, punch: -5, flash: { color: '#fff1a8', opacity: 0.8, fade: 0.7 }, slowMo: { scale: 0.35, hold: 0.8 } } },
  firework: { 1: { trauma: 0.12, flash: { color: '#ffffff', opacity: 0.06, fade: 0.2 } } },
  credit: { 1: { trauma: 0.15, flash: { color: '#ffd84a', opacity: 0.2, fade: 0.3 } } },
};

/** Constant micro-shake per pressure tier (Hot and Critical rattle), and much more during fever. */
const RUMBLE: Record<Tier, number> = { 0: 0, 1: 0, 2: 0.12, 3: 0.2 };
const TIER_COLORS: Record<Tier, string> = { 0: PALETTE.sky, 1: PALETTE.gold, 2: '#ff3fa4', 3: '#ff3d2e' };

/** Routes game events to every juice channel and to sound. One place to tune how the game feels. */
export class Fx {
  readonly juice = new Juice(RECIPES);
  readonly particles = new ParticlePool(4000);
  readonly popups = new PopupPool(40);
  readonly overlay: Overlay;
  readonly celebration: Celebration;
  /** Points won during the current fever, for the tally. */
  feverPoints = 0;
  private volleys: { at: number; side: number }[] = [];
  private clock = 0;
  private readonly v = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    parent: HTMLElement,
    private readonly sound: Sound,
    private readonly rand: () => number,
  ) {
    scene.add(this.particles.mesh, this.popups.group);
    this.overlay = new Overlay(parent);
    this.celebration = new Celebration(parent);
  }

  drop(x: number, hot: boolean): void {
    this.juice.fire('drop', 1, { x: 0, y: 1 });
    this.sound.drop(hot);
    // Claw steam puff and a spark from the laser tip.
    this.particles.burst({ at: { x, y: DROPPER.y - 1, z: DROPPER.z }, count: 10, color: '#ffffff', speed: 14, size: 1.4, life: 0.45, gravity: 8, drag: 4 }, this.rand);
    if (hot) this.particles.burst({ at: { x, y: DROPPER.y - 3, z: DROPPER.z + 3 }, count: 14, color: PALETTE.hot, speed: 22, size: 0.7, life: 0.4 }, this.rand);
  }

  land(x: number, z: number, speed: number): void {
    const heavy = speed > 120;
    this.juice.fire('land', heavy ? 2 : 1);
    this.sound.clink(Math.min(1, speed / 200));
    this.particles.burst({ at: { x, y: PUSHER.height + 0.6, z }, count: heavy ? 10 : 5, color: PALETTE.gold, speed: 18, dir: { x: 0, y: 1, z: 0 }, spread: 1.1, size: 0.55, life: 0.35 }, this.rand);
  }

  payout(x: number, won: number, combo: number, hot: boolean, fever: boolean): void {
    if (fever) this.feverPoints += won;
    const big = hot || fever || combo >= 5;
    this.juice.fire('payout', big ? 2 : 1, { x: x / TRAY.halfWidth, y: -1 });
    this.sound.payout(combo, hot);
    const at = this.v.set(x, -1, TRAY.front + 2);
    // A gold fountain spraying up out of the chute, bigger with the combo.
    this.particles.burst({ at, count: 8 + Math.min(combo, 20), color: fever ? '#ff7af0' : PALETTE.gold, speed: 32 + combo, dir: { x: 0, y: 1, z: 0.5 }, spread: 0.6, size: 0.8, life: 0.6, gravity: -90, shape: 'chip', spin: true }, this.rand);
    this.particles.burst({ at, count: 6, color: '#fff6c0', speed: 20, size: 0.9, life: 0.3 }, this.rand);
    this.popups.show(`+${won}`, { x, y: 2, z: TRAY.front + 3 }, { fill: hot ? '#ffb02e' : fever ? '#ff7af0' : PALETTE.gold, ink: '#2b1533', size: 2.4 + Math.min(combo, 10) * 0.12, rise: 9 });
    if (combo >= 3) this.popups.show(`COMBO x${combo}`, { x: 0, y: 12, z: TRAY.front - 4 }, { fill: TIER_COLORS[Math.min(3, Math.floor(combo / 5)) as Tier], ink: '#2b1533', size: 3 + Math.min(combo, 25) * 0.06, life: 0.7, rise: 3, tilt: 0.4 });
  }

  loss(x: number): void {
    this.juice.fire('loss');
    this.sound.loss();
    // A sad puff of grey cartoon smoke at the side.
    this.particles.burst({ at: { x: Math.sign(x) * (TRAY.halfWidth + 1), y: -2, z: TRAY.front - 2 }, count: 12, color: '#bba9c9', speed: 8, size: 2, life: 0.8, gravity: 10, drag: 3 }, this.rand);
  }

  credit(): void {
    this.juice.fire('credit');
    this.sound.credit();
    this.popups.show('+50 COINS', { x: 0, y: -10, z: TRAY.front + 6 }, { fill: PALETTE.gold, ink: '#2b1533', size: 4, life: 1.1, rise: 5 });
  }

  /** Reacts to pressure rule events. */
  pressure(e: PressureEvent): void {
    switch (e.type) {
      case 'milestone': {
        const w: Weight = e.count >= 50 ? 5 : e.count >= 25 ? 3 : 1;
        this.juice.fire('milestone', w);
        this.sound.milestone(e.count);
        this.confetti(60 + e.count * 2);
        this.overlay.titleCard(`COMBO x${e.count}!`, PALETTE.gold, e.count >= 25 ? 'UNSTOPPABLE' : 'NICE', 1);
        break;
      }
      case 'tier':
        if (e.tier > e.from) {
          this.juice.fire('tierUp');
          this.steam(e.tier);
        }
        this.sound.tier(e.tier > e.from);
        break;
      case 'quake':
        this.feverPoints = 0;
        this.juice.fire('quake', 5);
        this.sound.quake();
        this.overlay.titleCard('QUAKE!!!', '#ff3d2e', 'EVERYTHING x3', 1.8, 10);
        this.confetti(400);
        this.particles.burst({ at: { x: 0, y: 10, z: 0 }, count: 220, color: '#ffffff', speed: 90, size: 1.1, life: 0.7, drag: 3 }, this.rand);
        this.volley(4, 0.9);
        break;
      case 'feverEnd':
        this.celebrate();
        break;
      case 'combo':
      case 'comboEnd':
        break;
    }
  }

  /** Sets the pressure-driven rumble; fever shakes hard all the time. */
  setRumble(tier: Tier, fever: boolean): void {
    this.juice.rumble = fever ? 0.32 : RUMBLE[tier];
  }

  /**
   * The big jubilant moment (fever end): Ode to Joy fanfare with choir, firework volleys erupting from the bottom of
   * the screen, a confetti storm, cheering, a giant stamp and a counting tally. Skippable after 1.5 s.
   */
  celebrate(): void {
    this.juice.fire('celebrate', 5);
    this.sound.fanfare();
    this.sound.cheer();
    this.steam(3);
    this.confetti(600);
    this.volley(12, 4.5);
    for (const word of ['YEAH!', 'WOOO!', 'BRAVO!']) this.popups.show(word, { x: (this.rand() - 0.5) * 30, y: -14 + this.rand() * 6, z: TRAY.front + 6 }, { fill: '#fff1d6', ink: '#2b1533', size: 3, life: 1.6, rise: 6, tilt: 0.6 });
    this.celebration.start({ stamp: 'MEGA QUAKE!', sub: 'FEVER TALLY', total: this.feverPoints, label: '+', color: PALETTE.cherry, duration: 5.5 });
  }

  /** Skips the celebration when allowed; returns true if a press was used for that. */
  skip(): boolean {
    if (!this.celebration.active) return false;
    if (this.celebration.skip()) this.volleys = [];
    // While it plays, a press never drops a coin, even before skipping is allowed.
    return true;
  }

  /** Queues `count` firework volleys from both bottom corners over `seconds`. */
  volley(count: number, seconds: number): void {
    for (let i = 0; i < count; i++) this.volleys.push({ at: this.clock + (i * seconds) / count, side: i % 2 ? 1 : -1 });
  }

  update(realDt: number, camera: THREE.Camera): void {
    this.clock += realDt;
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      const v = this.volleys[i]!;
      if (v.at > this.clock) continue;
      this.volleys.splice(i, 1);
      this.firework(v.side);
      this.firework(-v.side);
    }
    this.celebration.update(realDt);
    this.juice.update(realDt);
    this.particles.update(realDt, camera);
    this.popups.update(realDt);
    this.overlay.update(this.juice, realDt);
  }

  /** One firework: a streak rising from the bottom of the screen, then a big burst near the top. */
  private firework(side: number): void {
    const x = side * (6 + this.rand() * 14);
    const colors = ['#ffd84a', '#ff5ad1', '#5fe0ff', '#9cff6b', '#ff8a3d', '#ffffff'];
    const color = colors[Math.floor(this.rand() * colors.length)]!;
    // Launch trail: sparks shot upward from below the counter.
    this.particles.burst({ at: { x, y: -22, z: TRAY.front + 8 }, count: 26, color: '#fff3c4', speed: 120, dir: { x: -side * 0.15, y: 1, z: -0.2 }, spread: 0.06, size: 0.7, life: 0.5, gravity: -50, drag: 1 }, this.rand);
    // Bursts spread over the whole machine, not just behind the stamp.
    const at = { x: x * 0.9, y: -6 + this.rand() * 44, z: 2 };
    this.particles.burst({ at, count: 90, color, speed: 55, size: 1, life: 1.3, gravity: -25, drag: 1.6 }, this.rand);
    this.particles.burst({ at, count: 30, color: '#ffffff', speed: 30, size: 0.6, life: 0.8, gravity: -20, drag: 2 }, this.rand);
    this.juice.fire('firework', 1);
    this.sound.firework();
  }

  /** Steam vents blasting from both side walls. */
  steam(tier: number): void {
    for (const side of [-1, 1]) {
      this.particles.burst(
        { at: { x: side * (TRAY.halfWidth + 1), y: DROPPER.y - 8, z: DROPPER.z + 5 }, count: 18 + tier * 8, color: '#f4eaff', speed: 30, dir: { x: -side, y: 0.5, z: 0.6 }, spread: 0.5, size: 2.6, life: 0.9, gravity: 12, drag: 2.5 },
        this.rand,
      );
    }
  }

  /** Confetti raining down across the machine. */
  confetti(count: number): void {
    const colors = [PALETTE.cherry, PALETTE.gold, PALETTE.mint, PALETTE.sky, '#ff7af0'];
    for (const color of colors) {
      this.particles.burst(
        { at: { x: (this.rand() - 0.5) * 30, y: DROPPER.y + 10, z: 0 }, count: Math.ceil(count / colors.length), color, speed: 60, dir: { x: 0, y: 1, z: 0.3 }, spread: 1.2, size: 0.9, life: 2.2, gravity: -40, drag: 1.2, spin: true, shape: 'chip' },
        this.rand,
      );
    }
  }
}
