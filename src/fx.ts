import * as THREE from 'three';
import type { Sound } from './audio/sound';
import { DROPPER, PUSHER, TRAY } from './config';
import { Juice, Overlay, ParticlePool, PopupPool, type Recipe, type Weight } from './juice';
import { PALETTE } from './render/toon';
import type { PressureEvent, Tier } from './rules/pressure';

/** Coin Quake's recipe table: every event at every weight (GAME_DESIGN.md §4.1). */
export const RECIPES: Record<string, Partial<Record<Weight, Recipe>>> = {
  drop: { 1: { trauma: 0.05 } },
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
  feverEnd: { 1: { trauma: 0.25, flash: { color: '#9ff3ff', opacity: 0.3, fade: 0.6 } } },
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
  private readonly v = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    parent: HTMLElement,
    private readonly sound: Sound,
    private readonly rand: () => number,
  ) {
    scene.add(this.particles.mesh, this.popups.group);
    this.overlay = new Overlay(parent);
  }

  drop(x: number, hot: boolean): void {
    this.juice.fire('drop');
    this.sound.drop();
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
        this.juice.fire('quake', 5);
        this.sound.quake();
        this.overlay.titleCard('QUAKE!!!', '#ff3d2e', 'EVERYTHING x3', 1.8, 10);
        this.confetti(400);
        this.particles.burst({ at: { x: 0, y: 10, z: 0 }, count: 220, color: '#ffffff', speed: 90, size: 1.1, life: 0.7, drag: 3 }, this.rand);
        break;
      case 'feverEnd':
        this.juice.fire('feverEnd');
        this.sound.feverEnd();
        this.steam(3);
        this.overlay.titleCard('COOL DOWN', '#9ff3ff', '', 1.1, 5);
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

  update(realDt: number, camera: THREE.Camera): void {
    this.juice.update(realDt);
    this.particles.update(realDt, camera);
    this.popups.update(realDt);
    this.overlay.update(this.juice, realDt);
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
