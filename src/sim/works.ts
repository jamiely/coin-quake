import RAPIER from '@dimforge/rapier3d-simd-compat';
import { COIN, WORKS } from '../config';
import type { Rng } from '../rng';

/** What happened in the Works this step, for juice, sound and rules. Positions are world cm. */
export type WorksEvent =
  | { type: 'peg'; index: number; x: number; y: number }
  | { type: 'gear'; x: number; y: number }
  | { type: 'loopIn'; x: number; y: number }
  | { type: 'loopOut'; x: number; y: number }
  | { type: 'flipper'; side: -1 | 1; x: number; y: number }
  | { type: 'zap'; x: number; y: number; side: -1 | 1 }
  | { type: 'bonus'; x: number; y: number };

/** A coin riding the pipe loop: parked out of the simulation while it travels the loop's path. */
interface Rider {
  body: RAPIER.RigidBody;
  t: number;
}

const Z_AXIS_TO_Y = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

/**
 * The machinery coins fall through on their way to the shelf (GAME_DESIGN.md §3.2). Pegs, the gear wheel, flippers
 * and the bonus slot are real colliders; the pipe loop and the Tesla coils are scripted effects on coins inside their
 * zones. Everything moves on simulated time and reports what it touched, so the renderer can animate the exact part
 * that was hit.
 */
export class Works {
  /** Gear angle (rad), flipper angles (rad, per side), and seconds since each part last fired, for the renderer. */
  gearAngle = 0;
  readonly flipperAngle: [number, number] = [WORKS.flippers.rest, WORKS.flippers.rest];
  readonly pegHit: number[];
  readonly flipperHit: [number, number] = [9, 9];
  readonly teslaHit: [number, number] = [9, 9];
  gearHit = 9;
  bonusHit = 9;
  loopHit = 9;
  /** Coins currently inside the loop, with their progress 0..1. */
  readonly riders: Rider[] = [];
  readonly pegs: { x: number; y: number }[] = [];
  private readonly pegColliders = new Map<number, number>();
  private readonly gear: RAPIER.RigidBody;
  private readonly flippers: RAPIER.RigidBody[] = [];
  private readonly flipperUntil: [number, number] = [0, 0];
  private readonly zapReady: [number, number] = [0, 0];
  private readonly pegCooldown = new Map<number, number>();
  private readonly lastGearKick = new Map<number, number>();
  private readonly stillFor = new Map<number, number>();
  private time = 0;

  constructor(
    private readonly world: RAPIER.World,
    private readonly rng: Rng,
  ) {
    const z = WORKS.z;
    const half = WORKS.halfDepth;
    // Peg field: staggered rows of fat brass pins spanning the slab front to back.
    const p = WORKS.pegs;
    p.rows.forEach((y, row) => {
      const offset = row % 2 ? p.spacing / 2 : 0;
      for (let x = -p.halfSpan - offset; x <= p.halfSpan + offset + 1e-6; x += p.spacing) {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(Z_AXIS_TO_Y));
        const c = world.createCollider(RAPIER.ColliderDesc.cylinder(half, p.radius).setRestitution(0.55).setFriction(0.2), body);
        this.pegColliders.set(c.handle, this.pegs.length);
        this.pegs.push({ x, y });
      }
    });
    this.pegHit = this.pegs.map(() => 9);
    // Bonus slot walls: two posts below the pegs leave a coin-sized gap.
    const b = WORKS.bonus;
    for (const side of [-1, 1]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 1.2, half).setTranslation(b.x + side * (b.halfWidth + 0.35), b.y, z).setRestitution(0.4));
    }
    // Gear wheel: a kinematic hub with paddles, spinning about Z.
    const g = WORKS.gear;
    this.gear = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(g.x, g.y, z));
    world.createCollider(RAPIER.ColliderDesc.cylinder(half, g.hub).setRotation(Z_AXIS_TO_Y).setFriction(0.6), this.gear);
    for (let i = 0; i < g.paddles; i++) {
      const a = (i / g.paddles) * Math.PI * 2;
      const r = (g.hub + g.reach) / 2;
      world.createCollider(
        RAPIER.ColliderDesc.cuboid((g.reach - g.hub) / 2, 0.35, half)
          .setTranslation(Math.cos(a) * r, Math.sin(a) * r, 0)
          .setRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) })
          .setFriction(0.8),
        this.gear,
      );
    }
    // Flippers: kinematic paddles hinged near each wall, angled down toward the middle.
    const f = WORKS.flippers;
    for (const side of [-1, 1] as const) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(side * f.x, f.y, z));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(f.length / 2, 0.45, half).setTranslation((-side * f.length) / 2, 0, 0).setRestitution(0.3).setFriction(0.3),
        body,
      );
      this.flippers.push(body);
    }
    this.setFlippers(0);
  }

  /**
   * Advances the machinery, before the world steps: spins the gear, swings flippers, moves loop riders. `coins` are
   * the live bodies, so scripted parts can act on the ones in their zones.
   */
  before(dt: number, coins: readonly RAPIER.RigidBody[], events: WorksEvent[]): void {
    this.time += dt;
    for (const k of ['gearHit', 'bonusHit', 'loopHit'] as const) this[k] += dt;
    for (let i = 0; i < this.pegHit.length; i++) this.pegHit[i]! += dt;
    for (let i = 0; i < 2; i++) {
      this.flipperHit[i]! += dt;
      this.teslaHit[i]! += dt;
    }
    this.gearAngle += WORKS.gear.spin * dt;
    const half = this.gearAngle / 2;
    this.gear.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) });
    this.setFlippers(dt);
    this.moveRiders(dt, events);
    this.scriptedZones(coins, events);
  }

  /** Reads contacts after the world steps: peg pings and gear flings, plus unsticking coins that came to rest. */
  after(dt: number, coins: readonly RAPIER.RigidBody[], events: WorksEvent[]): void {
    for (const body of coins) {
      if (this.riding(body)) continue;
      const pos = body.translation();
      if (pos.y < WORKS.flippers.y - 3 || Math.abs(pos.z - WORKS.z) > WORKS.halfDepth + COIN.radius) continue;
      const collider = body.collider(0);
      this.world.contactPairsWith(collider, (other) => {
        const peg = this.pegColliders.get(other.handle);
        if (peg !== undefined) this.pingPeg(peg, body, pos, events);
        else if (other.parent()?.handle === this.gear.handle) this.flingFromGear(body, pos, events);
      });
      this.unstick(body, dt);
    }
    for (const [handle, until] of this.pegCooldown) if (until < this.time) this.pegCooldown.delete(handle);
  }

  /** Coins riding the loop are out of the simulation; the caller must not count them as stuck or exited. */
  riding(body: RAPIER.RigidBody): boolean {
    return this.riders.some((r) => r.body === body);
  }

  /** Forgets a coin that left the machine. */
  remove(body: RAPIER.RigidBody): void {
    const i = this.riders.findIndex((r) => r.body === body);
    if (i >= 0) this.riders.splice(i, 1);
    this.stillFor.delete(body.handle);
    this.lastGearKick.delete(body.handle);
  }

  /** Point on the loop path at progress `t` (0 entry, 1 exit), for physics and for drawing the coin in the tube. */
  static loopPoint(t: number): { x: number; y: number } {
    const l = WORKS.loop;
    // Drop in from above into a full circle (counter-clockwise from the top), then out of its lower left.
    const a = Math.PI / 2 + t * Math.PI * 2.25;
    return { x: l.x + Math.cos(a) * l.radius, y: l.y + Math.sin(a) * l.radius };
  }

  private setFlippers(dt: number): void {
    const f = WORKS.flippers;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const up = this.time < this.flipperUntil[i]!;
      const target = up ? f.up : f.rest;
      // Snap up fast, fall back slower.
      const rate = up ? 28 : 7;
      const cur = this.flipperAngle[i]!;
      this.flipperAngle[i] = dt > 0 ? cur + (target - cur) * Math.min(1, rate * dt) : target;
      const a = -side * this.flipperAngle[i]!;
      this.flippers[i]!.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
    }
  }

  private scriptedZones(coins: readonly RAPIER.RigidBody[], events: WorksEvent[]): void {
    const l = WORKS.loop;
    const f = WORKS.flippers;
    const t = WORKS.tesla;
    const b = WORKS.bonus;
    for (const body of coins) {
      if (this.riding(body)) continue;
      const p = body.translation();
      if (Math.abs(p.z - WORKS.z) > WORKS.halfDepth + 1) continue;
      const v = body.linvel();
      // Pipe loop: a falling coin over its funnel is captured and rides the loop.
      if (v.y < 0 && Math.abs(p.x - l.x) < 2.2 && p.y < l.entryY && p.y > l.entryY - 2.5) {
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        this.riders.push({ body, t: 0 });
        this.loopHit = 0;
        events.push({ type: 'loopIn', x: p.x, y: p.y });
        continue;
      }
      // Flippers: a coin over a flipper fires it; the swing kicks it up and toward the middle.
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const fx = side * (f.x - f.length / 2);
        if (Math.abs(p.x - fx) < f.length / 2 + 0.5 && p.y < f.y + 2.5 && p.y > f.y - 1.5 && this.time >= this.flipperUntil[i]! + f.cooldown) {
          this.flipperUntil[i] = this.time + 0.14;
          this.flipperHit[i] = 0;
          body.setLinvel({ x: -side * f.kick.vx * (0.8 + 0.4 * this.rng.next()), y: -f.kick.vy, z: v.z }, true);
          body.setAngvel({ x: this.rng.range(-12, 12), y: 0, z: this.rng.range(-12, 12) }, true);
          events.push({ type: 'flipper', side: side as -1 | 1, x: p.x, y: p.y });
        }
      }
      // Tesla coils: zap the nearest coin in range on each side, jolting it inward.
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const dx = p.x - side * t.x;
        const dy = p.y - t.y;
        if (dx * dx + dy * dy < t.range * t.range && this.time >= this.zapReady[i]!) {
          this.zapReady[i] = this.time + t.cooldown;
          this.teslaHit[i] = 0;
          body.setLinvel({ x: v.x - side * 30, y: v.y + 25, z: v.z }, true);
          body.setAngvel({ x: this.rng.range(-20, 20), y: this.rng.range(-20, 20), z: this.rng.range(-20, 20) }, true);
          events.push({ type: 'zap', x: p.x, y: p.y, side: side as -1 | 1 });
        }
      }
      // Bonus slot: a coin dropping through the gap under the pegs.
      if (Math.abs(p.x - b.x) < b.halfWidth && Math.abs(p.y - b.y) < 0.6 && v.y < -20 && this.bonusHit > 0.4) {
        this.bonusHit = 0;
        events.push({ type: 'bonus', x: p.x, y: p.y });
      }
    }
  }

  private moveRiders(dt: number, events: WorksEvent[]): void {
    const l = WORKS.loop;
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i]!;
      r.t += dt / l.time;
      if (r.t < 1) {
        const p = Works.loopPoint(r.t);
        const a = r.t * Math.PI * 8;
        r.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: WORKS.z });
        r.body.setNextKinematicRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
        continue;
      }
      // Shoot out of the pipe's mouth.
      this.riders.splice(i, 1);
      r.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      r.body.setTranslation({ x: l.exit.x, y: l.exit.y, z: WORKS.z }, true);
      r.body.setLinvel({ x: l.exit.vx, y: l.exit.vy, z: 0 }, true);
      r.body.setAngvel({ x: 25, y: 0, z: 8 }, true);
      this.loopHit = 0;
      events.push({ type: 'loopOut', x: l.exit.x, y: l.exit.y });
    }
  }

  private pingPeg(index: number, body: RAPIER.RigidBody, pos: RAPIER.Vector, events: WorksEvent[]): void {
    if ((this.pegCooldown.get(body.handle * 64 + index) ?? -1) > this.time) return;
    this.pegCooldown.set(body.handle * 64 + index, this.time + 0.2);
    this.pegHit[index] = 0;
    const peg = this.pegs[index]!;
    // Spring kick away from the peg's centre: cartoon bumpers, not dead pins.
    const dx = pos.x - peg.x;
    const dy = pos.y - peg.y;
    const d = Math.hypot(dx, dy) || 1;
    const v = body.linvel();
    const k = WORKS.pegs.kick;
    body.setLinvel({ x: v.x + (dx / d) * k, y: Math.max(v.y + (dy / d) * k, -120), z: v.z }, true);
    events.push({ type: 'peg', index, x: peg.x, y: peg.y });
  }

  private flingFromGear(body: RAPIER.RigidBody, pos: RAPIER.Vector, events: WorksEvent[]): void {
    if ((this.lastGearKick.get(body.handle) ?? -1) > this.time) return;
    this.lastGearKick.set(body.handle, this.time + 0.35);
    this.gearHit = 0;
    // Fling tangentially (the wheel spins counter-clockwise) and outward.
    const g = WORKS.gear;
    const dx = pos.x - g.x;
    const dy = pos.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    const tx = -dy / d;
    const ty = dx / d;
    body.setLinvel({ x: (tx * 0.8 + (dx / d) * 0.4) * g.fling, y: (ty * 0.8 + (dy / d) * 0.4) * g.fling + 10, z: 0 }, true);
    body.setAngvel({ x: this.rng.range(-15, 15), y: 0, z: this.rng.range(-15, 15) }, true);
    events.push({ type: 'gear', x: pos.x, y: pos.y });
  }

  /** A coin resting in the machinery (on a peg, a paddle, a flipper) gets a shove, like cabinet vibration. */
  private unstick(body: RAPIER.RigidBody, dt: number): void {
    const v = body.linvel();
    const still = Math.hypot(v.x, v.y) < WORKS.stuckSpeed;
    const t = still ? (this.stillFor.get(body.handle) ?? 0) + dt : 0;
    if (t < WORKS.stuckTime) {
      this.stillFor.set(body.handle, t);
      return;
    }
    this.stillFor.set(body.handle, 0);
    body.setLinvel({ x: this.rng.range(-40, 40), y: 30, z: 0 }, true);
  }
}
