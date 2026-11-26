/**
 * Juice: a reusable effects kit. Depends only on three.js and the DOM, never on a game.
 *
 * - `Juice` (core.ts): weighted recipes → trauma shake, hit-stop, slow-mo, flashes, FOV punch, kicks.
 * - `ParticlePool`: one instanced draw call for sparks, confetti and debris.
 * - `PopupPool`: world-anchored outlined text that springs up and fades.
 * - `Overlay`: the full-screen flash and title cards (style with `juice.css`).
 *
 * A game defines its recipe table, calls `juice.fire(event, weight)` on each event, multiplies its simulation dt by
 * `juice.timeScale`, offsets its camera by `juice.shake`/`juice.kick`/`juice.fovOffset`, and updates the pools.
 */
export { DEFAULT_TUNING, Juice, noise1, type JuiceTuning, type Recipe, type Shake, type Weight } from './core';
export { Overlay } from './overlay';
export { ParticlePool, type Burst } from './particles';
export { PopupPool, type PopupStyle } from './popups';
import './juice.css';
