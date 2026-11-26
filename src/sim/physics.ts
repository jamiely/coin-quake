import RAPIER from '@dimforge/rapier3d-simd-compat';
import { COIN, DROPPER, GRAVITY, IMPACT, MAX_COINS, PUSHER, RULES, SIM, TRAY } from '../config';
import type { CoinTag } from '../rules/economy';
import type { Rng } from '../rng';
import { Works, type WorksEvent } from './works';

export interface Coin {
  body: RAPIER.RigidBody;
  /** The drop's tag; null for coins from the starting pile. */
  tag: CoinTag | null;
  /** Which edge the coin went over first, fixed the step it crosses one. */
  edge: 'front' | 'side' | null;
  /** Position after the previous step, to order two crossings within one step. */
  prev: { x: number; z: number };
}

/**
 * The tray boundary crossed first going from `a` to `b`, or null while still over the tray. When one step crosses both
 * (an open front corner), the boundary reached earlier along the step wins.
 */
export function firstEdge(a: { x: number; z: number }, b: { x: number; z: number }): 'front' | 'side' | null {
  const hw = TRAY.halfWidth;
  const side = Math.abs(b.x) > hw;
  const front = b.z > TRAY.front;
  if (!side || !front) return side ? 'side' : front ? 'front' : null;
  const tSide = Math.abs(a.x) > hw ? 0 : (hw - Math.abs(a.x)) / Math.max(1e-9, Math.abs(b.x) - Math.abs(a.x));
  const tFront = a.z > TRAY.front ? 0 : (TRAY.front - a.z) / Math.max(1e-9, b.z - a.z);
  return tFront <= tSide ? 'front' : 'side';
}

export type SimEvent =
  | { type: 'frontExit'; tag: CoinTag | null; x: number }
  | { type: 'sideExit'; x: number }
  /** A dropped coin hit the pile: `speed` at impact, `hit` how many coins it blasted, `strength` 0..1. */
  | { type: 'landed'; x: number; y: number; z: number; speed: number; hit: number; strength: number }
  | WorksEvent;

const EXIT_Y = -4;
const SHELF_Y = PUSHER.height;

/**
 * Rapier world for the pusher: a tray, side rails with open front corners, one kinematic pusher whose top is the
 * upper shelf, and a scraper wall above it. Knows nothing about payouts.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly coins: Coin[] = [];
  pusherFront: number = PUSHER.frontMin;
  /** Milliseconds spent in the last `step()`, for the perf HUD. */
  lastStepMs = 0;
  private readonly pusher: RAPIER.RigidBody;
  private readonly coinShape = RAPIER.ColliderDesc.cylinder(COIN.halfThickness, COIN.radius);
  private time = 0;
  /** Dropped coins still in their first fall, with their fall speed last step (to detect the impact). */
  private readonly falling = new Map<RAPIER.RigidBody, number>();
  /** Bodies blasted by an impact this step, with their blast strength, for the renderer's squash. */
  readonly blasted = new Map<number, number>();
  /** The machinery between the gates and the shelf. */
  readonly works: Works;
  private readonly bodies: RAPIER.RigidBody[] = [];

  static async create(rng: Rng): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(rng);
  }

  private constructor(private readonly rng: Rng) {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = 1 / SIM.hz;
    this.world.lengthUnit = 100;
    this.world.numSolverIterations = SIM.solverIterations;
    this.buildTray();
    this.pusher = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER.height / 2, this.pusherFront - PUSHER.depth / 2),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth - 0.05, PUSHER.height / 2, PUSHER.depth / 2).setFriction(0.4), this.pusher);
    this.works = new Works(this.world, rng);
    this.fillTray();
  }

  dispose(): void {
    this.world.free();
  }

  get full(): boolean {
    return this.coins.length >= MAX_COINS;
  }

  /** Drops a coin from the carriage at `x`. Returns false at the body cap (the caller refunds the coin). */
  drop(x: number, tag: CoinTag | null): boolean {
    if (this.full) return false;
    const body = this.addCoin(x, DROPPER.y - 2, DROPPER.z + this.rng.range(-0.6, 0.6), tag);
    body.setLinvel({ x: 0, y: -80, z: 0 }, true);
    // A little wobble so coins land tilted and tumble, not as perfectly flat plates.
    body.setAngvel({ x: this.rng.range(-4, 4), y: 0, z: this.rng.range(-4, 4) }, true);
    this.falling.set(body, 80);
    return true;
  }

  /** Advances one fixed step and reports tray exits and landings. */
  step(): SimEvent[] {
    const t0 = performance.now();
    this.time += this.world.timestep;
    const phase = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.time) / PUSHER.period);
    this.pusherFront = PUSHER.frontMin + (PUSHER.frontMax - PUSHER.frontMin) * phase;
    this.pusher.setNextKinematicTranslation({ x: 0, y: PUSHER.height / 2, z: this.pusherFront - PUSHER.depth / 2 });
    // Cartoon gravity: dropped coins fall harder than physics would, so they slam into the pile.
    const dv = IMPACT.extraGravity * this.world.timestep;
    for (const body of this.falling.keys()) {
      const v = body.linvel();
      body.setLinvel({ x: v.x, y: v.y + dv, z: v.z }, true);
    }
    // `blasted` accumulates across steps until the renderer reads and clears it; cap it for headless runs.
    if (this.blasted.size > MAX_COINS) this.blasted.clear();
    const works: WorksEvent[] = [];
    this.bodies.length = 0;
    for (const c of this.coins) if (c.body.translation().y > SHELF_Y + 2) this.bodies.push(c.body);
    this.works.before(this.world.timestep, this.bodies, works);
    this.world.step();
    this.works.after(this.world.timestep, this.bodies, works);
    const events: SimEvent[] = [...works, ...this.classify()];
    this.lastStepMs = performance.now() - t0;
    return events;
  }

  private classify(): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]!;
      const p = coin.body.translation();
      const fallSpeed = this.falling.get(coin.body);
      if (fallSpeed !== undefined && !this.works.riding(coin.body)) {
        const vy = -coin.body.linvel().y;
        // Landed: its fall was stopped this step (it hit the shelf, the pile or another coin) low enough to count.
        // Below the Works (flippers sit at y ~8.4), so bumps on machinery are never taken for the landing.
        if (p.y < SHELF_Y + 3.5 && vy < fallSpeed * 0.5) {
          this.falling.delete(coin.body);
          events.push(this.impact(coin.body, p, fallSpeed));
        } else {
          this.falling.set(coin.body, Math.max(vy, 0));
        }
      }
      // The first boundary crossed decides; a coin that drifts past the other edge while falling keeps it. One that
      // only overhung an edge and was pushed back onto the tray starts over.
      if (Math.abs(p.x) <= TRAY.halfWidth && p.z <= TRAY.front) coin.edge = null;
      else coin.edge ??= firstEdge(coin.prev, p);
      coin.prev = { x: p.x, z: p.z };
      if (p.y >= EXIT_Y) continue;
      events.push(coin.edge === 'front' ? { type: 'frontExit', tag: coin.tag, x: p.x } : { type: 'sideExit', x: p.x });
      this.falling.delete(coin.body);
      this.works.remove(coin.body);
      this.world.removeRigidBody(coin.body);
      this.coins[i] = this.coins[this.coins.length - 1]!;
      this.coins.pop();
    }
    return events;
  }

  /**
   * The landing blast: every coin within `IMPACT.radius` of the impact hops up and is pushed away from it, scaled by
   * distance and by how hard the coin landed. Near a side rail the outward push is dropped, so blasts scatter the
   * pile without dumping coins off the sides.
   */
  private impact(body: RAPIER.RigidBody, p: RAPIER.Vector, speed: number): SimEvent {
    const strength = Math.min(1, speed / IMPACT.fullSpeed);
    let hit = 0;
    for (const other of this.coins) {
      if (other.body === body) continue;
      const q = other.body.translation();
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > IMPACT.radius || Math.abs(q.y - p.y) > 4) continue;
      const k = strength * (1 - d / IMPACT.radius);
      const nx = d > 1e-3 ? dx / d : 0;
      const nz = d > 1e-3 ? dz / d : 0;
      const nearRail = TRAY.halfWidth - Math.abs(q.x) < IMPACT.railMargin && Math.sign(nx) === Math.sign(q.x);
      const v = other.body.linvel();
      other.body.setLinvel({ x: v.x + (nearRail ? 0 : nx * IMPACT.push * k), y: Math.max(v.y, 0) + IMPACT.hop * k, z: v.z + nz * IMPACT.push * k }, true);
      other.body.setAngvel({ x: this.rng.range(-1, 1) * IMPACT.spin * k, y: this.rng.range(-1, 1) * IMPACT.spin * k, z: this.rng.range(-1, 1) * IMPACT.spin * k }, true);
      this.blasted.set(other.body.handle, k);
      hit++;
    }
    // The lander itself squashes and bounces a little.
    this.blasted.set(body.handle, strength);
    return { type: 'landed', x: p.x, y: p.y, z: p.z, speed, hit, strength };
  }

  private addCoin(x: number, y: number, z: number, tag: CoinTag | null): RAPIER.RigidBody {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.8));
    this.world.createCollider(this.coinShape.setDensity(COIN.density).setFriction(COIN.friction).setRestitution(COIN.restitution), body);
    this.coins.push({ body, tag, edge: null, prev: { x, z } });
    return body;
  }

  private addStaticBox(hx: number, hy: number, hz: number, x: number, y: number, z: number): void {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.5).setRestitution(0.1));
  }

  private buildTray(): void {
    const hw = TRAY.halfWidth;
    this.addStaticBox(hw, 1, (TRAY.front - TRAY.back) / 2, 0, -1, (TRAY.front + TRAY.back) / 2);
    const railFront = TRAY.front - TRAY.openCorner;
    const tallFront = PUSHER.frontMax + 2;
    for (const side of [-1, 1]) {
      // Tall walls beside the pusher and up to the dropper keep falling coins in; low rails stop short of the corners.
      this.addStaticBox(0.5, DROPPER.y / 2 + 2, (tallFront - TRAY.back) / 2, side * (hw + 0.5), DROPPER.y / 2, (tallFront + TRAY.back) / 2);
      this.addStaticBox(0.5, TRAY.railHeight / 2, (railFront - tallFront) / 2, side * (hw + 0.5), TRAY.railHeight / 2, (railFront + tallFront) / 2);
    }
    // Scraper wall above the shelf, from just over the pusher top up to the dropper; a back wall behind the drop zone.
    const scraperHalf = (DROPPER.y - SHELF_Y) / 2;
    this.addStaticBox(hw, scraperHalf, 0.3, 0, SHELF_Y + 0.4 + scraperHalf, PUSHER.scraperZ - 0.3);
    // Front glass over the drop zone, so falling coins land on the shelf instead of flying out at the player.
    this.addStaticBox(hw, scraperHalf, 0.3, 0, SHELF_Y + 6 + scraperHalf, DROPPER.z + 4);
  }

  /**
   * The machine boots with a pile on the lower tray, settled behind a temporary fence at the front edge and corners
   * (Neon Reef learned that without one a quarter of the pile slides off before play starts).
   */
  private fillTray(): void {
    const zMin = PUSHER.frontMin + COIN.radius + 0.3;
    const zMax = TRAY.front - COIN.radius - 3;
    const xMax = TRAY.halfWidth - COIN.radius - 0.5;
    const perLayer = 70;
    for (let i = 0; i < RULES.startPile; i++) {
      const layer = Math.floor(i / perLayer);
      this.addCoin(this.rng.range(-xMax, xMax), 1 + layer * 1.4 + this.rng.range(0, 0.4), this.rng.range(zMin, zMax), null);
    }
    const fence = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth + 1, 6, 0.5).setTranslation(0, 6, TRAY.front + 0.5), fence);
    for (const side of [-1, 1]) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 6, TRAY.openCorner / 2 + 0.5).setTranslation(side * (TRAY.halfWidth + 0.5), 6, TRAY.front - TRAY.openCorner / 2),
        fence,
      );
    }
    for (let i = 0; i < 240; i++) this.world.step();
    this.world.removeRigidBody(fence);
    // Run the pusher for a few strokes without the fence, discarding what spills, so the game starts on a settled
    // overhang instead of an avalanche of free coins in its first seconds.
    for (let i = 0; i < 4 * PUSHER.period * SIM.hz; i++) this.step();
    this.time = 0;
  }
}
