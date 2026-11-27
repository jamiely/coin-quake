import * as THREE from 'three';
import type { Sound } from './audio/sound';
import { COIN_KINDS, DROPPER, TRAY, WORKS, type CoinKind } from './config';
import { Celebration, Juice, Overlay, ParticlePool, PopupPool, type Recipe, type Weight } from './juice';
import { PALETTE } from './render/toon';
import type { PressureEvent, Tier } from './rules/pressure';
import type { Run, RunEvent } from './rules/run';
import type { WorksEvent } from './sim/works';

/** Coin Quake's recipe table: every event at every weight (GAME_DESIGN.md §4.1). */
export const RECIPES: Record<string, Partial<Record<Weight, Recipe>>> = {
  drop: { 1: { trauma: 0.1, kick: 0.35 } },
  land: { 1: { trauma: 0.1 }, 2: { trauma: 0.2, kick: 0.4 }, 3: { trauma: 0.32, kick: 0.7, hitStop: 0.045 } },
  payout: {
    1: { trauma: 0.08, kick: 0.3 },
    2: { trauma: 0.14, kick: 0.5, flash: { color: '#ffe27a', opacity: 0.08, fade: 0.15 } },
  },
  loss: { 1: {} },
  peg: { 1: {} },
  gear: { 1: {} },
  loop: { 1: {} },
  flipper: { 1: {} },
  zap: { 1: { flash: { color: '#bff4ff', opacity: 0.12, fade: 0.12 } } },
  bonus: { 2: { trauma: 0.4, hitStop: 0.08, punch: -3, flash: { color: '#fff1a8', opacity: 0.35, fade: 0.3 } } },
  milestone: {
    1: { trauma: 0.35, hitStop: 0.06, punch: -2.5, flash: { color: '#ffffff', opacity: 0.35, fade: 0.25 } },
    3: { trauma: 0.5, hitStop: 0.09, punch: -3.5, flash: { color: '#ffffff', opacity: 0.5, fade: 0.3 }, slowMo: { scale: 0.4, hold: 0.25 } },
    5: { trauma: 0.7, hitStop: 0.12, punch: -5, flash: { color: '#fff1a8', opacity: 0.7, fade: 0.4 }, slowMo: { scale: 0.3, hold: 0.4 } },
  },
  tierUp: { 1: { flash: { color: '#ff7a3d', opacity: 0.2, fade: 0.35 } } },
  quake: {
    5: { trauma: 1, hitStop: 0.15, punch: -6, flash: { color: '#ffffff', opacity: 0.95, fade: 0.6 }, slowMo: { scale: 0.25, hold: 0.6 } },
  },
  celebrate: { 5: { trauma: 0.8, hitStop: 0.12, punch: -5, flash: { color: '#fff1a8', opacity: 0.8, fade: 0.7 }, slowMo: { scale: 0.35, hold: 0.8 } } },
  firework: { 1: { flash: { color: '#ffffff', opacity: 0.06, fade: 0.2 } } },
  credit: { 1: { flash: { color: '#ffd84a', opacity: 0.2, fade: 0.3 } } },
  prize: { 3: { trauma: 0.6, hitStop: 0.12, punch: -4, flash: { color: '#fff1a8', opacity: 0.55, fade: 0.4 }, slowMo: { scale: 0.4, hold: 0.35 } } },
  dumpWarning: { 1: { flash: { color: '#ff3d2e', opacity: 0.15, fade: 0.3 } } },
  dump: { 4: { trauma: 0.85, hitStop: 0.08, punch: -4, kick: 1.2, flash: { color: '#fff1d6', opacity: 0.4, fade: 0.35 } } },
};

const RAINBOW = ['#ff4d6d', '#ffa53d', '#ffe14a', '#5fe07a', '#4dc3ff', '#a77bff'];
const KIND_LABEL: Partial<Record<CoinKind, string>> = { jumbo: 'JUMBO!', lead: 'HEAVY!', gold: 'GOLD!', rainbow: 'RAINBOW!!' };

/** Pressure alone never moves the camera. */
const RUMBLE: Record<Tier, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
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
  private pendingWon = 0;
  private lastEmpty = -1;
  private pendingX = 0;
  private lastPayPopup = -1;
  private lastComboPopup = -1;
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

  drop(x: number, hot: boolean, kind: CoinKind = 'standard'): void {
    this.juice.fire('drop', 1, { x: 0, y: 1 });
    this.sound.drop(hot);
    // Special coins announce themselves as they leave the claw.
    const label = KIND_LABEL[kind];
    if (label) this.popups.show(label, { x, y: DROPPER.y - 6, z: DROPPER.z + 5 }, { fill: COIN_KINDS[kind].face, ink: '#2b1533', size: 2, life: 0.7, rise: 2, tilt: 0.4 });
    // Claw steam puff and a spark from the laser tip.
    this.particles.burst({ at: { x, y: DROPPER.y - 1, z: DROPPER.z }, count: 10, color: '#ffffff', speed: 14, size: 1.4, life: 0.45, gravity: 8, drag: 4 }, this.rand);
    if (hot) this.particles.burst({ at: { x, y: DROPPER.y - 3, z: DROPPER.z + 3 }, count: 14, color: PALETTE.hot, speed: 22, size: 0.7, life: 0.4 }, this.rand);
  }

  /**
   * A dropped coin slamming into the pile: shake (and a hit-stop on hard hits), a heavy layered clink, a dust puff,
   * a ring of sparks and a "CLANK!" for big blasts. `hit` is how many coins it blasted, `strength` 0..1.
   */
  land(x: number, y: number, z: number, strength: number, hit: number, kind: CoinKind = 'standard'): void {
    const weight: Weight = strength > 0.75 && hit >= 4 ? 3 : strength > 0.4 ? 2 : 1;
    this.juice.fire('land', weight, { x: 0, y: -1 });
    this.sound.slam(strength, hit, COIN_KINDS[kind].pitch);
    const at = { x, y: y + 0.4, z };
    // Puffy cartoon dust ring, low and wide.
    this.particles.burst({ at, count: 8 + hit * 2, color: '#fff1d6', speed: 20 + 25 * strength, dir: { x: 0, y: 0.25, z: 0 }, spread: 1.45, size: 2.2, life: 0.55, gravity: 6, drag: 5 }, this.rand);
    // Gold sparks spraying up and out.
    this.particles.burst({ at, count: 10 + hit * 3, color: PALETTE.gold, speed: 35 + 45 * strength, dir: { x: 0, y: 1, z: 0 }, spread: 1.2, size: 0.6, life: 0.45, gravity: -80 }, this.rand);
    this.particles.burst({ at, count: 6, color: '#ffffff', speed: 18, size: 1.1, life: 0.18, drag: 6 }, this.rand);
    if (weight === 3) this.popups.show(this.rand() < 0.5 ? 'CLANK!' : 'BONK!', { x, y: y + 4, z }, { fill: '#fff1d6', ink: '#2b1533', size: 2.2, life: 0.55, rise: 8, tilt: 0.7 });
  }

  payout(x: number, won: number, combo: number, hot: boolean, fever: boolean, kind: CoinKind = 'standard', playerCaused = true): void {
    if (fever) this.feverPoints += won;
    const bonus = COIN_KINDS[kind].value >= 5;
    const big = hot || fever || combo >= 5 || bonus;
    if (playerCaused) this.juice.fire('payout', big ? 2 : 1, { x: x / TRAY.halfWidth, y: -1 });
    this.sound.payout(combo, hot, COIN_KINDS[kind].pitch, bonus);
    const at = this.v.set(x, -1, TRAY.front + 2);
    // A gold fountain spraying up out of the chute, bigger with the combo; rainbow coins spray every colour.
    const color = kind === 'rainbow' ? RAINBOW[combo % RAINBOW.length]! : fever ? '#ff7af0' : COIN_KINDS[kind].face;
    this.particles.burst({ at, count: 8 + Math.min(combo, 20) + (bonus ? 20 : 0), color, speed: 32 + combo, dir: { x: 0, y: 1, z: 0.5 }, spread: 0.6, size: 0.8, life: 0.6, gravity: -90, shape: 'chip', spin: true }, this.rand);
    this.particles.burst({ at, count: 6, color: '#fff6c0', speed: 20, size: 0.9, life: 0.3 }, this.rand);
    // Sparkle shower along the front edge: glints raining down the chute face.
    this.particles.burst({ at: { x, y: 0.5, z: TRAY.front + 1 }, count: 10 + Math.min(combo, 12), color: '#fffbe0', speed: 12, dir: { x: 0, y: -1, z: 0.3 }, spread: 1.2, size: 0.45, life: 0.7, gravity: -30, drag: 1.5 }, this.rand);
    if (kind === 'rainbow') for (const c of RAINBOW) this.particles.burst({ at, count: 6, color: c, speed: 50, dir: { x: 0, y: 1, z: 0.4 }, spread: 0.8, size: 0.7, life: 0.7, shape: 'chip', spin: true }, this.rand);
    // In a fast chain the "+N" popups merge: one popup at most every 0.15 s shows everything won since the last.
    this.pendingWon += won;
    this.pendingX = x;
    if (this.clock - this.lastPayPopup >= 0.15 || bonus || hot) {
      this.popups.show(`+${this.pendingWon}`, { x, y: 2, z: TRAY.front + 3 }, { fill: hot ? '#ffb02e' : fever ? '#ff7af0' : bonus ? COIN_KINDS[kind].face : PALETTE.gold, ink: '#2b1533', size: 2.4 + Math.min(combo, 10) * 0.12, rise: 9 });
      this.pendingWon = 0;
      this.lastPayPopup = this.clock;
    }
    if (combo >= 3 && this.clock - this.lastComboPopup >= 0.3) {
      this.lastComboPopup = this.clock;
      this.popups.show(`COMBO x${combo}`, { x: 0, y: 12, z: TRAY.front - 4 }, { fill: TIER_COLORS[Math.min(3, Math.floor(combo / 5)) as Tier], ink: '#2b1533', size: 3 + Math.min(combo, 25) * 0.06, life: 0.7, rise: 3, tilt: 0.4 });
    }
  }

  /** The Works: every machine part a coin touches reacts with sparks, a sound and sometimes a word. */
  works(e: WorksEvent): void {
    const z = WORKS.z + WORKS.halfDepth + 0.5;
    const at = { x: e.x, y: e.y, z };
    switch (e.type) {
      case 'peg':
        this.juice.fire('peg');
        this.sound.peg(e.index);
        this.particles.burst({ at, count: 7, color: '#fff36b', speed: 22, size: 0.55, life: 0.25, drag: 5 }, this.rand);
        break;
      case 'gear':
        this.juice.fire('gear');
        this.sound.ratchet();
        this.particles.burst({ at, count: 12, color: '#ffb02e', speed: 40, size: 0.5, life: 0.35, gravity: -60 }, this.rand);
        if (this.rand() < 0.35) this.popups.show('WHEE!', { x: e.x, y: Math.min(e.y + 2, 19), z }, { fill: '#fff1d6', ink: '#2b1533', size: 1.8, life: 0.6, rise: 3, tilt: 0.6 });
        break;
      case 'loopIn':
        this.sound.whoosh(false);
        break;
      case 'loopOut':
        this.juice.fire('loop', 1, { x: -1, y: -0.5 });
        this.sound.whoosh(true);
        this.particles.burst({ at, count: 18, color: PALETTE.sky, speed: 45, dir: { x: -1, y: -0.6, z: 0 }, spread: 0.5, size: 0.7, life: 0.4 }, this.rand);
        this.popups.show('ZOOM!', { x: e.x, y: e.y + 3, z }, { fill: PALETTE.sky, ink: '#2b1533', size: 2, life: 0.6, rise: 5, tilt: 0.5 });
        break;
      case 'flipper':
        this.juice.fire('flipper', 1, { x: -e.side, y: 0 });
        this.sound.flipper();
        this.particles.burst({ at, count: 10, color: '#ffffff', speed: 30, dir: { x: -e.side, y: 1, z: 0 }, spread: 0.7, size: 0.6, life: 0.3 }, this.rand);
        break;
      case 'zap':
        this.juice.fire('zap', 1, { x: e.side, y: 0 });
        this.sound.zap();
        this.particles.burst({ at, count: 22, color: '#bff4ff', speed: 38, size: 0.45, life: 0.22, drag: 6 }, this.rand);
        if (this.rand() < 0.4) this.popups.show('ZZAP!', { x: e.x, y: Math.min(e.y + 2, 19), z }, { fill: '#bff4ff', ink: '#2b1533', size: 1.8, life: 0.5, rise: 3, tilt: 0.7 });
        break;
      case 'bonus':
        this.juice.fire('bonus', 2);
        this.sound.milestone(10);
        this.confetti(80);
        this.particles.burst({ at, count: 40, color: PALETTE.gold, speed: 55, dir: { x: 0, y: 1, z: 0.3 }, spread: 0.9, size: 0.8, life: 0.6, shape: 'chip', spin: true }, this.rand);
        this.popups.show('BONUS!', { x: e.x, y: e.y + 4, z }, { fill: PALETTE.gold, ink: '#2b1533', size: 3.2, life: 1, rise: 5, tilt: 0.4 });
        break;
    }
  }

  loss(x: number): void {
    this.juice.fire('loss');
    this.sound.loss();
    // A sad puff of grey cartoon smoke at the side.
    this.particles.burst({ at: { x: Math.sign(x) * (TRAY.halfWidth + 1), y: -2, z: TRAY.front - 2 }, count: 12, color: '#bba9c9', speed: 8, size: 2, life: 0.8, gravity: 10, drag: 3 }, this.rand);
  }

  /**
   * A prize figurine pushed off the front: the big prize moment. Freeze, flash, a confetti and gold burst, a prize
   * points popup and a squeaky fanfare. The HUD owns the toy portrait banner.
   */
  prize(x: number, won: number): void {
    this.juice.fire('prize', 3);
    this.sound.prize();
    this.confetti(220);
    const at = { x, y: -1, z: TRAY.front + 2 };
    this.particles.burst({ at, count: 80, color: PALETTE.gold, speed: 70, dir: { x: 0, y: 1, z: 0.4 }, spread: 0.7, size: 1, life: 0.9, gravity: -70, shape: 'chip', spin: true }, this.rand);
    this.particles.burst({ at, count: 40, color: '#ffffff', speed: 45, size: 1.2, life: 0.4, drag: 4 }, this.rand);
    this.volley(2, 0.6);
    this.popups.show(`+${won}`, at, { fill: PALETTE.gold, ink: '#2b1533', size: 3, life: 1.3, rise: 8 });
  }

  /** A coin dump is coming: siren and flashing warning, but no camera shake. */
  dumpWarning(seconds: number): void {
    this.sound.siren(seconds);
    this.juice.fire('dumpWarning');
    this.overlay.titleCard('COIN DUMP!', '#ffd84a', 'INCOMING', seconds, 2);
  }

  /** The dump lands: a huge crash, shake, a dust cloud across the tray, and a counted popup. */
  dump(count: number): void {
    this.juice.fire('dump', 4);
    this.sound.avalanche();
    for (let i = 0; i < 6; i++) {
      this.particles.burst({ at: { x: -15 + i * 6, y: 3, z: 3 }, count: 14, color: '#fff1d6', speed: 30, dir: { x: 0, y: 0.4, z: 0 }, spread: 1.4, size: 2.6, life: 0.8, gravity: 6, drag: 3 }, this.rand);
    }
    this.popups.show(`+${count} COINS!`, { x: 0, y: 12, z: 6 }, { fill: PALETTE.gold, ink: '#2b1533', size: 4, life: 1.3, rise: 4, tilt: 0.3 });
  }

  /** The C button: a jingle and a coin sparkle (free play: no credits to add). */
  credit(): void {
    this.juice.fire('credit');
    this.sound.credit();
  }

  /** A run starts: a coin-shower jingle and a GO! card. */
  runStart(): void {
    this.juice.fire('credit');
    this.sound.credit();
    this.overlay.titleCard('GO!', PALETTE.gold, 'DROP COINS • PUSH THEM OFF', 1, 1);
  }

  /** A fresh machine: forget the last run's pending effects. */
  reset(): void {
    this.feverPoints = 0;
    this.volleys = [];
    this.pendingWon = 0;
  }

  /** The player pressed with an empty stock: a dry click. */
  empty(): void {
    if (this.clock - this.lastEmpty < 0.5) return;
    this.lastEmpty = this.clock;
    this.sound.loss();
    this.popups.show('NO COINS!', { x: 0, y: DROPPER.y - 6, z: DROPPER.z + 5 }, { fill: '#ff5a3d', ink: '#2b1533', size: 2.4, life: 0.7, rise: 2, tilt: 0.4 });
  }

  /** Run milestones: Last Call, out of coins, a revive, the final push. */
  run(event: RunEvent, run: Run): void {
    switch (event) {
      case 'lastCall':
        this.juice.fire('tierUp');
        this.sound.siren(1.2);
        this.overlay.titleCard('LAST CALL!', '#ff5a3d', 'NO MORE REFILLS', 1.6, 4);
        break;
      case 'suddenDeath':
        this.sound.siren(0.8);
        this.overlay.titleCard('OUT OF COINS!', '#ff5a3d', `PUSH ONE OFF IN ${Math.ceil(run.graceLeft)}s`, 1.4, 4);
        break;
      case 'revive':
        this.juice.fire('credit');
        this.sound.credit();
        this.overlay.titleCard('SAVED!', PALETTE.mint, '', 0.9, 3);
        break;
      case 'sweep':
        this.juice.fire('dumpWarning');
        this.sound.siren(0.6);
        this.overlay.titleCard('FINAL PUSH!', PALETTE.gold, '', 1.2, 4);
        break;
      case 'lowStock':
        this.popups.show('LOW COINS!', { x: 0, y: DROPPER.y - 6, z: DROPPER.z + 5 }, { fill: '#ffb02e', ink: '#2b1533', size: 2.6, life: 0.9, rise: 2 });
        break;
      case 'over':
        break;
    }
  }

  /** The run is over: the big finale with the final score counting up. */
  finale(score: number): void {
    this.juice.fire('celebrate', 5);
    this.sound.fanfare();
    this.sound.cheer();
    this.confetti(700);
    this.volley(14, 5);
    this.celebration.start({ stamp: 'GAME OVER!', sub: 'FINAL SCORE', total: score, color: PALETTE.cherry, duration: 6 });
  }

  /** The starting structure topples: a timber call, a crash and a dust cloud. */
  collapse(x: number, y: number, z: number, count: number): void {
    this.juice.fire('dump', 4);
    this.sound.avalanche();
    for (let i = 0; i < 5; i++) {
      this.particles.burst({ at: { x: x - 10 + i * 5, y: y + 1, z }, count: 16, color: '#fff1d6', speed: 28, dir: { x: 0, y: 0.5, z: 0 }, spread: 1.3, size: 2.4, life: 0.8, gravity: 6, drag: 3 }, this.rand);
    }
    this.particles.burst({ at: { x, y: y + 2, z }, count: 50, color: PALETTE.mint, speed: 50, dir: { x: 0, y: 1, z: 0.3 }, spread: 1, size: 0.8, life: 0.7, shape: 'chip', spin: true }, this.rand);
    this.overlay.titleCard('TIMBER!', PALETTE.mint, `${count} COINS TOPPLE`, 1.2, 2);
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
   * The big jubilant moment (fever end): the Jackpot March, firework volleys erupting from the bottom of
   * the screen, a confetti storm, cheering, a giant stamp and a counting tally. Skippable after 1.5 s.
   */
  celebrate(): void {
    this.juice.fire('celebrate', 5);
    this.sound.fanfare();
    this.sound.cheer();
    this.steam(3);
    this.confetti(600);
    this.volley(12, 4.5);
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
    // Show the rest of a merged burst once its window closes, so the last coins of a chain are never silent.
    if (this.pendingWon > 0 && this.clock - this.lastPayPopup >= 0.15) {
      this.popups.show(`+${this.pendingWon}`, { x: this.pendingX, y: 2, z: TRAY.front + 3 }, { fill: PALETTE.gold, ink: '#2b1533', size: 2.4, rise: 9 });
      this.pendingWon = 0;
      this.lastPayPopup = this.clock;
    }
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
