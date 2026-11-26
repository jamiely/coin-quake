import RAPIER from '@dimforge/rapier3d-simd-compat';
import { COIN, COIN_KINDS, DECK, DROPPER, DUMP, FIGURINES, GRAVITY, IMPACT, LOWER, MAX_COINS, PUSHER, RULES, SIM, TRAY, type CoinKind } from '../config';
import type { CoinTag } from '../rules/economy';
import type { Rng } from '../rng';
import { Works, type WorksEvent } from './works';

export type FigurineKind = (typeof FIGURINES.kinds)[number];

export interface Coin {
  body: RAPIER.RigidBody;
  /** The drop's tag; null for coins from the starting pile. */
  tag: CoinTag | null;
  kind: CoinKind;
  /** Set for prize figurines, which ride the pile like coins but pay a prize. */
  figurine?: FigurineKind;
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

/** Picks a coin kind by the `odds` weights, from one uniform draw in [0, 1). */
export function pickKind(u: number): CoinKind {
  const kinds = Object.keys(COIN_KINDS) as CoinKind[];
  const total = kinds.reduce((s, k) => s + COIN_KINDS[k].odds, 0);
  let acc = 0;
  for (const k of kinds) {
    acc += COIN_KINDS[k].odds / total;
    if (u < acc) return k;
  }
  return 'standard';
}

/** The structures a session can start with on the tray (the user: "make the structure random"). */
export const STRUCTURES = ['ring', 'pyramid', 'columns', 'wall'] as const;
export type Structure = (typeof STRUCTURES)[number];

export type SimEvent =
  | { type: 'frontExit'; tag: CoinTag | null; x: number; kind: CoinKind; figurine?: FigurineKind }
  | { type: 'sideExit'; x: number; figurine?: FigurineKind }
  /** A dropped coin hit the pile: `speed` at impact, `hit` how many coins it blasted, `strength` 0..1. */
  | { type: 'landed'; x: number; y: number; z: number; speed: number; hit: number; strength: number; kind: CoinKind }
  /** A coin dump is about to fall (`in` seconds), then did fall. */
  | { type: 'dumpWarning'; in: number }
  | { type: 'dump'; count: number }
  | WorksEvent;

/** Below the lower tray's floor: a coin this low has gone over an edge. */
const EXIT_Y = TRAY.y - 4;
const SHELF_Y = PUSHER.height;

/**
 * Rapier world for the pusher: a tray, side rails with open front corners, one kinematic pusher whose top is the
 * upper shelf, a scraper wall above it, and the Works. Knows nothing about payouts.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly coins: Coin[] = [];
  pusherFront: number = PUSHER.frontMin;
  /** The lower pusher's front face. */
  lowerFront: number = LOWER.frontMin;
  /** Stroke rate multiplier (the Last Call sweep speeds both pushers up). */
  pusherSpeed = 1;
  /** Milliseconds spent in the last `step()`, for the perf HUD. */
  lastStepMs = 0;
  /** The structure this session started with. */
  readonly structure: Structure;
  private readonly pusher: RAPIER.RigidBody;
  private readonly lower: RAPIER.RigidBody;
  private time = 0;
  /** Stroke phases (radians), advanced by pusherSpeed so a speed change never jumps a pusher. */
  private upperPhase = 0;
  private lowerPhase = Math.PI * 0.7;
  /** Dropped coins still in their first fall, with their fall speed last step (to detect the impact). */
  private readonly falling = new Map<RAPIER.RigidBody, number>();
  /** Bodies blasted by an impact, with their blast strength, for the renderer's squash; the renderer clears it. */
  readonly blasted = new Map<number, number>();
  /** The machinery between the gates and the shelf. */
  readonly works: Works;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private nextDump: number;
  private dumpAt = -1;

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
    this.lower = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, TRAY.y + LOWER.height / 2, this.lowerFront - LOWER.depth / 2),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth - 0.05, LOWER.height / 2, LOWER.depth / 2).setFriction(0.4), this.lower);
    this.works = new Works(this.world, rng);
    this.structure = STRUCTURES[Math.floor(rng.next() * STRUCTURES.length)]!;
    this.fillTray();
    this.nextDump = rng.range(DUMP.minGap, DUMP.maxGap);
  }

  dispose(): void {
    // Drop every reference to bodies before the WASM world frees them.
    this.works.clear();
    this.falling.clear();
    this.blasted.clear();
    this.coins.length = 0;
    this.world.free();
  }

  get full(): boolean {
    return this.coins.length >= MAX_COINS;
  }

  /** Dropped coins still in their first fall (not landed yet). */
  get fallingCount(): number {
    return this.falling.size;
  }

  /** The tray has calmed down: nothing is moving fast enough to still go over an edge soon. */
  get settled(): boolean {
    for (const c of this.coins) {
      const v = c.body.linvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 400) return false;
    }
    return true;
  }

  get figurines(): number {
    return this.coins.filter((c) => c.figurine).length;
  }

  /**
   * Drops a coin from the carriage at `x`. Returns false at the body cap (the caller refunds the coin). Its kind is
   * random by the kind odds, unless given. Now and then a prize figurine tumbles in alongside it.
   */
  drop(x: number, tag: CoinTag | null, kind: CoinKind = pickKind(this.rng.next())): CoinKind | null {
    // A full machine makes room by retiring a resting coin from the back of the upper shelf (it is hidden there),
    // so a drop always goes in and a jammed machine can never stall a run.
    if (this.full && !this.retireOne()) return null;
    const body = this.addCoin(x, DROPPER.y - 2, DROPPER.z + this.rng.range(-0.6, 0.6), tag, kind);
    body.setLinvel({ x: 0, y: -80, z: 0 }, true);
    // A little wobble so coins land tilted and tumble, not as perfectly flat plates.
    body.setAngvel({ x: this.rng.range(-4, 4), y: 0, z: this.rng.range(-4, 4) }, true);
    this.falling.set(body, 80);
    if (!this.full && this.rng.next() < FIGURINES.dropChance && this.figurines < FIGURINES.max) {
      this.addFigurine(this.rng.range(-10, 10), DECK.y + 10, this.rng.range(PUSHER.frontMax + 2, DECK.front - 2));
    }
    return kind;
  }

  /**
   * Removes one resting coin, preferring the furthest back on the upper shelf, then the deck. Never a figurine, a
   * build coin, a falling coin or a loop rider. Returns false when nothing qualifies.
   */
  private retireOne(): boolean {
    let best = -1;
    let bestZ = Infinity;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i]!;
      if (c.figurine || c.kind === 'build' || this.falling.has(c.body) || this.works.riding(c.body)) continue;
      const p = c.body.translation();
      if (p.y < DECK.y - 0.6) continue;
      if (p.z < bestZ) {
        bestZ = p.z;
        best = i;
      }
    }
    if (best < 0) return false;
    const coin = this.coins[best]!;
    this.works.remove(coin.body);
    this.world.removeRigidBody(coin.body);
    this.coins[best] = this.coins[this.coins.length - 1]!;
    this.coins.pop();
    return true;
  }

  /** Starts a coin dump now (debug); normally they arrive at random. */
  dumpSoon(): void {
    this.nextDump = this.time;
  }

  /** Advances one fixed step and reports tray exits, landings, the Works and coin dumps. */
  step(): SimEvent[] {
    const t0 = performance.now();
    this.time += this.world.timestep;
    const dt = this.world.timestep * this.pusherSpeed;
    this.upperPhase += (2 * Math.PI * dt) / PUSHER.period;
    this.lowerPhase += (2 * Math.PI * dt) / LOWER.period;
    this.pusherFront = PUSHER.frontMin + (PUSHER.frontMax - PUSHER.frontMin) * (0.5 - 0.5 * Math.cos(this.upperPhase));
    this.lowerFront = LOWER.frontMin + (LOWER.frontMax - LOWER.frontMin) * (0.5 - 0.5 * Math.cos(this.lowerPhase));
    this.pusher.setNextKinematicTranslation({ x: 0, y: PUSHER.height / 2, z: this.pusherFront - PUSHER.depth / 2 });
    this.lower.setNextKinematicTranslation({ x: 0, y: TRAY.y + LOWER.height / 2, z: this.lowerFront - LOWER.depth / 2 });
    // Cartoon gravity: dropped coins fall harder than physics would, so they slam into the pile.
    const dv = IMPACT.extraGravity * this.world.timestep;
    for (const body of this.falling.keys()) {
      const v = body.linvel();
      body.setLinvel({ x: v.x, y: v.y + dv, z: v.z }, true);
    }
    if (this.blasted.size > MAX_COINS) this.blasted.clear();
    const works: WorksEvent[] = [];
    this.bodies.length = 0;
    for (const c of this.coins) if (c.body.translation().y > SHELF_Y + 2) this.bodies.push(c.body);
    this.works.before(this.world.timestep, this.bodies, works);
    this.world.step();
    this.works.after(this.world.timestep, this.bodies, works);
    const events: SimEvent[] = [...works, ...this.dumps(), ...this.classify()];
    this.lastStepMs = performance.now() - t0;
    return events;
  }

  /** Random coin dumps: a warning, then a load of coins crashing onto the lower tray from above. */
  private dumps(): SimEvent[] {
    if (this.dumpAt < 0 && this.time >= this.nextDump) {
      this.dumpAt = this.time + DUMP.warning;
      return [{ type: 'dumpWarning', in: DUMP.warning }];
    }
    if (this.dumpAt < 0 || this.time < this.dumpAt) return [];
    this.dumpAt = -1;
    this.nextDump = this.time + this.rng.range(DUMP.minGap, DUMP.maxGap);
    const room = Math.max(0, MAX_COINS - this.coins.length);
    const count = Math.min(DUMP.coins, room);
    // A column over the middle of the tray, clear of the rails and the open front corners, falling straight down. Dump
    // coins don't blast what they land on: 45 blasts at once threw the pile over the sides (about 70% of the dump).
    const cx = this.rng.range(-3, 3);
    for (let i = 0; i < count; i++) {
      const kind = this.rng.next() < 0.15 ? pickKind(this.rng.next()) : 'standard';
      const body = this.addCoin(cx + this.rng.range(-DUMP.spread, DUMP.spread), 26 + this.rng.range(0, 14), this.rng.range(LOWER.frontMax, TRAY.front - 6), null, kind);
      body.setLinvel({ x: 0, y: -120 - this.rng.range(0, 60), z: 0 }, true);
      body.setAngvel({ x: this.rng.range(-10, 10), y: 0, z: this.rng.range(-10, 10) }, true);
    }
    return [{ type: 'dump', count }];
  }

  private classify(): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]!;
      const p = coin.body.translation();
      const fallSpeed = this.falling.get(coin.body);
      if (fallSpeed !== undefined && !this.works.riding(coin.body)) {
        const vy = -coin.body.linvel().y;
        // Landed: its fall was stopped low enough (below the Works) to be the pile or the shelf.
        if (p.y < SHELF_Y + 3.5 && vy < fallSpeed * 0.5) {
          this.falling.delete(coin.body);
          events.push(this.impact(coin, p, fallSpeed));
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
      events.push(
        coin.edge === 'front'
          ? { type: 'frontExit', tag: coin.tag, x: p.x, kind: coin.kind, ...(coin.figurine ? { figurine: coin.figurine } : {}) }
          : { type: 'sideExit', x: p.x, ...(coin.figurine ? { figurine: coin.figurine } : {}) },
      );
      this.falling.delete(coin.body);
      this.works.remove(coin.body);
      this.world.removeRigidBody(coin.body);
      this.coins[i] = this.coins[this.coins.length - 1]!;
      this.coins.pop();
    }
    return events;
  }

  /**
   * The landing blast: every coin within reach of the impact hops up and is pushed away from it, scaled by distance,
   * by how hard the coin landed and by how heavy it is (a lead coin shoves hard, a dime barely). Near a side rail the
   * outward push is dropped, so blasts scatter the pile without dumping coins off the sides.
   */
  private impact(coin: Coin, p: RAPIER.Vector, speed: number): SimEvent {
    const k0 = COIN_KINDS[coin.kind];
    const mass = (k0.scale * k0.scale * k0.thick * k0.density) / 7;
    const strength = Math.min(1, (speed / IMPACT.fullSpeed) * Math.min(1.8, Math.sqrt(mass)));
    const radius = IMPACT.radius * Math.min(1.5, 0.7 + 0.3 * mass);
    let hit = 0;
    for (const other of this.coins) {
      if (other === coin) continue;
      const q = other.body.translation();
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || Math.abs(q.y - p.y) > 4) continue;
      const k = strength * (1 - d / radius);
      const nx = d > 1e-3 ? dx / d : 0;
      const nz = d > 1e-3 ? dz / d : 0;
      const nearRail = TRAY.halfWidth - Math.abs(q.x) < IMPACT.railMargin && Math.sign(nx) === Math.sign(q.x);
      const v = other.body.linvel();
      other.body.setLinvel({ x: v.x + (nearRail ? 0 : nx * IMPACT.push * k), y: Math.max(v.y, 0) + IMPACT.hop * k, z: v.z + nz * IMPACT.push * k }, true);
      other.body.setAngvel({ x: this.rng.range(-1, 1) * IMPACT.spin * k, y: this.rng.range(-1, 1) * IMPACT.spin * k, z: this.rng.range(-1, 1) * IMPACT.spin * k }, true);
      this.blasted.set(other.body.handle, k);
      hit++;
    }
    this.blasted.set(coin.body.handle, strength);
    return { type: 'landed', x: p.x, y: p.y, z: p.z, speed, hit, strength, kind: coin.kind };
  }

  private addCoin(x: number, y: number, z: number, tag: CoinTag | null, kind: CoinKind = 'standard'): RAPIER.RigidBody {
    const k = COIN_KINDS[kind];
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.8));
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(COIN.halfThickness * k.thick, COIN.radius * k.scale)
        .setDensity(k.density)
        .setFriction(COIN.friction)
        .setRestitution(COIN.restitution),
      body,
    );
    this.coins.push({ body, tag, kind, edge: null, prev: { x, z } });
    return body;
  }

  /** A prize figurine: a chunky, slightly bottom-heavy toy that rides and topples with the pile. */
  addFigurine(x: number, y: number, z: number, kind?: FigurineKind): RAPIER.RigidBody {
    const h = FIGURINES.halfSize;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.4).setAngularDamping(1.2).setRotation({ x: 0, y: Math.sin(this.rng.range(-0.5, 0.5)), z: 0, w: 1 }),
    );
    // A capsule body on a wide base: stands up, rocks, and falls over when hit hard.
    this.world.createCollider(RAPIER.ColliderDesc.capsule(h * 0.55, h * 0.6).setTranslation(0, h * 0.25, 0).setDensity(FIGURINES.density).setFriction(0.6).setRestitution(0.2), body);
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(h * 0.22, h * 0.85).setTranslation(0, -h * 0.85, 0).setDensity(FIGURINES.density * 2).setFriction(0.7), body);
    const fig = kind ?? FIGURINES.kinds[Math.floor(this.rng.next() * FIGURINES.kinds.length)]!;
    this.coins.push({ body, tag: null, kind: 'standard', figurine: fig, edge: null, prev: { x, z } });
    return body;
  }

  private addStaticBox(hx: number, hy: number, hz: number, x: number, y: number, z: number): void {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.5).setRestitution(0.1));
  }

  private buildTray(): void {
    const hw = TRAY.halfWidth;
    // Lower tray floor, deep and below the deck.
    this.addStaticBox(hw, 1, (TRAY.front - TRAY.back) / 2, 0, TRAY.y - 1, (TRAY.front + TRAY.back) / 2);
    // Middle deck: a raised floor from the back wall to its front step, swept by the upper pusher. The lower pusher
    // slides out from under the step, whose face scrapes coins off the lower pusher's top as it retracts.
    const deckBack = TRAY.back;
    this.addStaticBox(hw, DECK.thickness / 2, (DECK.front - deckBack) / 2, 0, DECK.y - DECK.thickness / 2, (DECK.front + deckBack) / 2);
    this.addStaticBox(hw, (DECK.y - DECK.thickness - (TRAY.y + LOWER.height) - 0.15) / 2, (DECK.front - deckBack) / 2, 0, (DECK.y - DECK.thickness + TRAY.y + LOWER.height + 0.15) / 2, (DECK.front + deckBack) / 2);
    const railFront = TRAY.front - TRAY.openCorner;
    const tallFront = DECK.front + 1;
    for (const side of [-1, 1]) {
      // Tall walls beside the pushers and up to the dropper keep falling coins in; low rails stop short of the corners.
      this.addStaticBox(0.5, (DROPPER.y - TRAY.y) / 2 + 2, (tallFront - TRAY.back) / 2, side * (hw + 0.5), (DROPPER.y + TRAY.y) / 2, (tallFront + TRAY.back) / 2);
      this.addStaticBox(0.5, TRAY.railHeight / 2 + 1.5, (railFront - tallFront) / 2, side * (hw + 0.5), TRAY.y + TRAY.railHeight / 2, (railFront + tallFront) / 2);
    }
    // Scraper wall above the shelf, from just over the pusher top up to the dropper; a back wall behind the drop zone.
    const scraperHalf = (DROPPER.y - SHELF_Y) / 2;
    this.addStaticBox(hw, scraperHalf, 0.3, 0, SHELF_Y + 0.4 + scraperHalf, PUSHER.scraperZ - 0.3);
    // Front glass over the drop zone, so falling coins land on the shelf instead of flying out at the player.
    this.addStaticBox(hw, scraperHalf, 0.3, 0, SHELF_Y + 6 + scraperHalf, DROPPER.z + 4);
  }

  /**
   * The machine boots with a pile on the lower tray, settled behind a temporary fence at the front edge and corners
   * (Neon Reef learned that without one a quarter of the pile slides off before play starts). Then a random coin
   * structure is stacked on the pile with a few prize figurines; it's built after settling so it stands, and the first
   * drops knock it over.
   */
  private fillTray(): void {
    const xMax = TRAY.halfWidth - COIN.radius - 0.5;
    const perLayer = 70;
    // Most of the pile sits on the deep lower tray; a share rides the middle deck in front of the upper pusher.
    const deckShare = 0.3;
    for (let i = 0; i < RULES.startPile; i++) {
      const onDeck = i < RULES.startPile * deckShare;
      const n = onDeck ? i : i - Math.floor(RULES.startPile * deckShare);
      const layer = Math.floor(n / perLayer);
      const kind = this.rng.next() < 0.12 ? pickKind(this.rng.next()) : 'standard';
      const [y0, zMin, zMax] = onDeck
        ? [DECK.y, PUSHER.frontMax + COIN.radius + 0.3, DECK.front - COIN.radius - 0.5]
        : [TRAY.y, LOWER.frontMin + COIN.radius + 0.5, TRAY.front - COIN.radius - 4];
      this.addCoin(this.rng.range(-xMax, xMax), y0 + 1 + layer * 1.4 + this.rng.range(0, 0.4), this.rng.range(zMin, zMax), null, kind);
    }
    const fence = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth + 1, 6, 0.5).setTranslation(0, TRAY.y + 6, TRAY.front + 0.5), fence);
    for (const side of [-1, 1]) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 6, TRAY.openCorner / 2 + 0.5).setTranslation(side * (TRAY.halfWidth + 0.5), TRAY.y + 6, TRAY.front - TRAY.openCorner / 2),
        fence,
      );
    }
    for (let i = 0; i < 240; i++) this.world.step();
    this.world.removeRigidBody(fence);
    // Run the pusher for a few strokes without the fence, discarding what spills, so the game starts on a settled
    // overhang instead of an avalanche of free coins in its first seconds.
    for (let i = 0; i < 4 * PUSHER.period * SIM.hz; i++) this.step();
    this.build(this.structure);
    for (let i = 0; i < FIGURINES.onTray; i++) this.addFigurine(this.rng.range(-13, 13), TRAY.y + 6, this.rng.range(LOWER.frontMax, TRAY.front - 5));
    // Let the build and the figurines settle onto the pile before play starts.
    for (let i = 0; i < 40; i++) this.world.step();
    this.time = 0;
  }

  /**
   * Stacks a big coin structure in plain view on the lower tray (the user: "the structure should be more visible"),
   * between the lower pusher's reach and the front edge, so coins pushing in topple it. Built from bright `build`
   * coins so it stands out from the pile.
   */
  private build(structure: Structure): void {
    const cz = (LOWER.frontMax + TRAY.front) / 2 - 1;
    const top = (x: number, z: number) => this.surfaceY(x, z);
    const t = COIN.halfThickness * 2 + 0.02;
    const place = (x: number, z: number, y: number) => {
      const body = this.addCoin(x, y, z, null, 'build');
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    };
    switch (structure) {
      case 'ring': {
        // A ring tower: rings of coins standing on their faces, stacked into a hollow cylinder.
        const n = 12;
        const r = 5.6;
        const base = top(0, cz);
        for (let level = 0; level < 10; level++) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (level % 2 ? Math.PI / n : 0);
            place(Math.cos(a) * r, cz + Math.sin(a) * r, base + 0.4 + level * t);
          }
        }
        break;
      }
      case 'pyramid': {
        const base = top(0, cz);
        for (let level = 0; level < 6; level++) {
          const side = 6 - level;
          for (let i = 0; i < side; i++) {
            for (let j = 0; j < side; j++) {
              place((i - (side - 1) / 2) * 3.05, cz + (j - (side - 1) / 2) * 3.05, base + 0.4 + level * t);
            }
          }
        }
        break;
      }
      case 'columns': {
        // Tall coin stacks dotted across the tray, wobbly and begging to be knocked over.
        for (const [x, dz] of [[-11, 0], [-5.5, -2], [0, 1], [5.5, -2], [11, 0]] as const) {
          const z = cz + dz;
          const base = top(x, z);
          for (let level = 0; level < 14; level++) place(x + this.rng.range(-0.08, 0.08), z + this.rng.range(-0.08, 0.08), base + 0.4 + level * t);
        }
        break;
      }
      case 'wall': {
        // A brick wall across the tray, staggered courses of coins edge to edge.
        const base = top(0, cz);
        for (let level = 0; level < 9; level++) {
          const off = level % 2 ? 1.5 : 0;
          for (let x = -13.5 + off; x <= 13.5; x += 3.05) place(x, cz, base + 0.4 + level * t);
        }
        break;
      }
    }
  }

  /** Height of the pile's top near (x, z): the highest coin within a coin's reach, or the tray floor. */
  private surfaceY(x: number, z: number): number {
    let y = TRAY.y;
    for (const c of this.coins) {
      const p = c.body.translation();
      if (Math.hypot(p.x - x, p.z - z) < 6) y = Math.max(y, p.y + COIN.halfThickness);
    }
    return y;
  }
}
