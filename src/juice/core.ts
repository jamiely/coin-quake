/**
 * Juice core: the engine-free part of the effects system. It turns weighted events into camera trauma, hit-stop,
 * time-scale (slow-mo) and screen flashes, driven by a recipe table. No three.js, DOM or game imports, so any game
 * can reuse it (Coin Quake, the Fast Drop edition). Channels that draw (particles, popups, flash overlay) read its
 * outputs.
 */

/** 1 tiny … 5 jackpot. Weights scale every channel. */
export type Weight = 1 | 2 | 3 | 4 | 5;

export interface Recipe {
  /** Trauma added (0..1); shake magnitude is trauma², so small hits stay subtle. */
  trauma?: number;
  /** Simulation freeze in seconds. Rendering and particles keep running. */
  hitStop?: number;
  /** Slow-mo: time scale and how long it holds before easing back to 1. */
  slowMo?: { scale: number; hold: number };
  /** Full-screen additive flash: color and peak opacity, fading over `fade` seconds. */
  flash?: { color: string; opacity: number; fade: number };
  /** Field-of-view punch in degrees (negative zooms in), recovered over 0.25 s. */
  punch?: number;
  /** Directional kick: camera nudged away from the hit, in world units. */
  kick?: number;
}

export interface Shake {
  x: number;
  y: number;
  roll: number;
}

export interface Flash {
  color: string;
  opacity: number;
  fade: number;
  age: number;
}

export interface JuiceTuning {
  /** Trauma lost per second. */
  decay: number;
  /** Max offset (world units) and roll (radians) at trauma 1. */
  maxOffset: number;
  maxRoll: number;
  /** Noise speed: how fast the shake wobbles. */
  frequency: number;
  /** Seconds to ease slow-mo back to 1 after its hold. */
  slowMoRelease: number;
  /** Global multiplier for accessibility or a calmer attract mode. */
  intensity: number;
}

export const DEFAULT_TUNING: JuiceTuning = { decay: 1.4, maxOffset: 2.2, maxRoll: 0.05, frequency: 18, slowMoRelease: 0.35, intensity: 1 };

/** Smooth 1-D value noise in [-1, 1]; `seed` decorrelates the axes. */
export function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class Juice {
  trauma = 0;
  /** Extra trauma floor, e.g. the constant micro-shake of a high-pressure tier. */
  rumble = 0;
  readonly flashes: Flash[] = [];
  readonly shake: Shake = { x: 0, y: 0, roll: 0 };
  /** Current field-of-view offset in degrees. */
  fovOffset = 0;
  /** Directional kick offset (decays quickly). */
  readonly kick = { x: 0, y: 0 };
  private stopLeft = 0;
  private slow: { scale: number; hold: number; age: number } | null = null;
  private t = 0;

  constructor(
    readonly recipes: Record<string, Partial<Record<Weight, Recipe>>>,
    readonly tuning: JuiceTuning = { ...DEFAULT_TUNING },
  ) {}

  /**
   * Plays the recipe for `event` at `weight` (falling back to the nearest lower weight defined). `dir` is the hit's
   * direction on screen (-1..1 each), for the kick. Returns the recipe used, so callers can drive their own channels.
   */
  fire(event: string, weight: Weight = 1, dir?: { x: number; y: number }): Recipe | null {
    const table = this.recipes[event];
    if (!table) return null;
    let recipe: Recipe | undefined;
    for (let w = weight; w >= 1 && !recipe; w--) recipe = table[w as Weight];
    if (!recipe) return null;
    const k = this.tuning.intensity;
    if (recipe.trauma) this.trauma = Math.min(1, this.trauma + recipe.trauma * k);
    if (recipe.hitStop) this.stopLeft = Math.max(this.stopLeft, recipe.hitStop);
    if (recipe.slowMo && (!this.slow || recipe.slowMo.scale <= this.slow.scale)) this.slow = { ...recipe.slowMo, age: 0 };
    if (recipe.flash && k > 0) this.flashes.push({ ...recipe.flash, opacity: recipe.flash.opacity * Math.min(1, k), age: 0 });
    if (recipe.punch) this.fovOffset = Math.min(this.fovOffset, recipe.punch * k);
    if (recipe.kick && dir) {
      this.kick.x -= dir.x * recipe.kick * k;
      this.kick.y -= dir.y * recipe.kick * k;
    }
    return recipe;
  }

  /** True while the simulation should be frozen (hit-stop). */
  get stopped(): boolean {
    return this.stopLeft > 0;
  }

  /** Multiplier for simulation time this frame: 0 in hit-stop, < 1 in slow-mo, else 1. */
  get timeScale(): number {
    if (this.stopLeft > 0) return 0;
    if (!this.slow) return 1;
    const { scale, hold, age } = this.slow;
    if (age <= hold) return scale;
    const u = Math.min(1, (age - hold) / this.tuning.slowMoRelease);
    return scale + (1 - scale) * u * u * (3 - 2 * u);
  }

  /** Advances by real (unscaled) seconds: decays trauma, ages flashes and timers, and computes the shake. */
  update(dt: number): void {
    this.t += dt;
    this.stopLeft = Math.max(0, this.stopLeft - dt);
    if (this.slow) {
      this.slow.age += dt;
      if (this.slow.age > this.slow.hold + this.tuning.slowMoRelease) this.slow = null;
    }
    this.trauma = Math.max(0, this.trauma - this.tuning.decay * dt);
    const level = Math.max(this.trauma, this.rumble);
    const s = level * level * this.tuning.intensity;
    const f = this.t * this.tuning.frequency;
    this.shake.x = s * this.tuning.maxOffset * noise1(f, 1);
    this.shake.y = s * this.tuning.maxOffset * noise1(f, 2);
    this.shake.roll = s * this.tuning.maxRoll * noise1(f, 3);
    this.fovOffset *= Math.exp(-dt / 0.08);
    const kd = Math.exp(-dt / 0.06);
    this.kick.x *= kd;
    this.kick.y *= kd;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]!;
      fl.age += dt;
      if (fl.age >= fl.fade) this.flashes.splice(i, 1);
    }
  }

  /** Combined flash: the brightest live flash's color and its current opacity. */
  get flash(): { color: string; opacity: number } | null {
    let best: { color: string; opacity: number } | null = null;
    for (const f of this.flashes) {
      const o = f.opacity * (1 - f.age / f.fade) ** 2;
      if (!best || o > best.opacity) best = { color: f.color, opacity: o };
    }
    return best;
  }
}
