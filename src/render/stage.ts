import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DROPPER, GATES, LOWER, PUSHER, type GateIndex } from '../config';

/** Seconds the opening shot of the structure lasts. */
const REVEAL_TIME = 2.6;
import type { Juice } from '../juice';
import type { Tier } from '../rules/pressure';
import type { PhysicsWorld } from '../sim/physics';
import { gaugeAngle, paintCounter, buildMachine, type Machine } from './machine';
import { WorksView } from './works';
import { Characters } from './characters';
import { CoinsView } from './coins';
import { PALETTE } from './toon';

/** What the stage draws each frame; it reads these and never mutates game state. */
export interface StageState {
  dropperX: number;
  gate: GateIndex;
  hotGate: GateIndex;
  points: number;
  coins: number;
  /** Seconds since the last drop, for the claw snap. */
  sinceDrop: number;
  tier: Tier;
  /** 0..100. */
  pressure: number;
  /** Seconds of QUAKE fever left (0 when calm). */
  fever: number;
  combo: number;
  /** A celebration is playing: Bolt cheers. */
  cheering: boolean;
  /** Seconds since the last front payout, prize and side loss, for the characters' reactions. */
  sincePayout: number;
  sincePrize: number;
  sinceLoss: number;
}

/** Background, marquee and chase speed per pressure tier (GAME_DESIGN.md §4.3). */
const TIER_LOOK: Record<Tier, { bg: string; bulbs: [string, string]; chase: number }> = {
  0: { bg: '#1c0d2b', bulbs: ['#9ff3ff', '#2a6a8a'], chase: 4 },
  1: { bg: '#241034', bulbs: ['#fff36b', PALETTE.goldDark], chase: 7 },
  2: { bg: '#2e0f3a', bulbs: ['#ff7af0', '#8a1f6a'], chase: 11 },
  3: { bg: '#3a0d22', bulbs: ['#ff5a3d', '#7a1010'], chase: 16 },
};

/**
 * Framing: the box around the machine (cm) that must always be visible. Portrait (the cabinet's 1050x1680) fits the
 * height; wider screens fit the same box and show the side art.
 */
/** Taller and steeper than before: three tiers and the deep tray below them must all show, front edge included. */
const FIT = { halfWidth: 25, halfHeight: 50, centerY: 8, centerZ: 0, pitchDeg: 24, fov: 34 };


export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FIT.fov, 1, 5, 1000);
  readonly scene = new THREE.Scene();
  /** The camera's resting place; effects offset from it. */
  readonly home = new THREE.Vector3();
  readonly lookAt = new THREE.Vector3(0, FIT.centerY, FIT.centerZ);
  private readonly composer: EffectComposer;
  private readonly machine: Machine;
  private readonly coins: CoinsView;
  private revealAt: THREE.Vector3 | null = null;
  private revealStart = -1;
  private revealK = 0;
  private readonly reveal_ = new THREE.Vector3();
  private readonly lookTmp = new THREE.Vector3();
  private readonly cast: Characters;
  private lastStroke = 0;
  private readonly c = new THREE.Color();
  private lastRealTime = 0;
  private painted = '';
  private shownPoints = 0;
  private counterTime = 0;
  private lastDigits = '00000000';
  private readonly digitAge = new Array<number>(8).fill(9);
  private readonly digitBounce = new Array<number>(8).fill(0);

  private works: WorksView | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#1c0d2b');

    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#6a3a8a', 1.6));
    // Key light from high and behind-left, so the steeper camera doesn't look straight into its reflection off the tray.
    const key = new THREE.DirectionalLight('#ffffff', 1.9);
    key.position.set(-40, 90, -10);
    this.scene.add(key);

    this.machine = buildMachine(this.scene);

    this.coins = new CoinsView(this.scene);
    this.cast = new Characters(this.scene, this.machine.pusher, this.machine.gauge.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom only catches the bright bits (lamps, laser, highlights); the cartoon stays crisp.
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.96));
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    // Distance that fits FIT's box on the tighter axis.
    const tanV = Math.tan(THREE.MathUtils.degToRad(FIT.fov / 2));
    const dist = Math.max(FIT.halfHeight / tanV, FIT.halfWidth / (tanV * this.camera.aspect));
    const pitch = THREE.MathUtils.degToRad(FIT.pitchDeg);
    this.home.set(0, FIT.centerY + Math.sin(pitch) * dist, FIT.centerZ + Math.cos(pitch) * dist);
    this.camera.position.copy(this.home);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  get layout(): 'portrait' | 'landscape' {
    return this.camera.aspect < 1 ? 'portrait' : 'landscape';
  }

  update(physics: PhysicsWorld, s: StageState, time: number, realTime: number): void {
    this.machine.pusher.position.z = physics.pusherFront - PUSHER.depth / 2;
    this.machine.lower.position.z = physics.lowerFront - LOWER.depth / 2;
    this.updateReveal(realTime);
    this.works ??= new WorksView(this.scene, physics.works.pegs.length);
    this.works.update(physics.works, realTime);
    this.coins.update(physics, realTime - this.lastRealTime, realTime);
    this.lastRealTime = realTime;

    const { carriage, bolt, claw, laser, gates } = this.machine;
    carriage.position.x = s.dropperX;
    // Drop recoil: the carriage kicks up and squashes, then springs back (damped); Bolt bounces a beat later.
    const r = s.sinceDrop;
    const spring = r < 0.5 ? Math.exp(-r * 9) * Math.cos(r * 38) : 0;
    carriage.position.y = DROPPER.y + spring * 1.2;
    carriage.scale.set(1 + spring * 0.25, 1 - spring * 0.3, 1 + spring * 0.25);
    const hop = r < 0.6 ? Math.max(0, Math.sin(Math.min(1, (r - 0.05) / 0.35) * Math.PI)) : 0;
    const dance = s.cheering ? 3.5 : s.fever > 0 ? 1.2 : 0;
    const tempo = s.cheering ? 12 : 9;
    bolt.position.y = 5.8 + hop * 1.4 + Math.abs(Math.sin(realTime * tempo)) * dance;
    bolt.rotation.z = (dance ? Math.sin(realTime * tempo) * 0.35 : 0) + hop * 0.2 * Math.sign(Math.sin(r * 50));
    const squish = 1 + 0.18 * Math.sin(Math.min(1, r / 0.12) * Math.PI);
    bolt.scale.set(squish, 2 - squish, squish);
    const open = Math.max(0, 1 - s.sinceDrop / 0.18);
    claw.forEach((finger, i) => (finger.rotation.z = (i ? -1 : 1) * open * 0.6));
    laser.position.set(s.dropperX, (DROPPER.y + PUSHER.height) / 2, DROPPER.z);
    laser.scale.y = DROPPER.y - PUSHER.height;
    (laser.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(time * 30);
    gates.forEach((gate, i) => {
      const under = i === s.gate;
      const hot = i === s.hotGate;
      gate.lamp.color.set(hot ? PALETTE.hot : PALETTE.plum);
      gate.lamp.emissive.set(hot ? PALETTE.hot : PALETTE.sky);
      gate.lamp.emissiveIntensity = under ? 0.9 : hot ? 0.35 + 0.25 * Math.sin(time * 8) : 0;
      gate.hot.visible = hot;
      gate.hot.position.y = DROPPER.y - 1.2 + (hot ? 0.3 * Math.sin(time * 6) : 0);
      gate.hot.scale.setScalar(1 + 0.06 * Math.sin(time * 12));
    });

    // Counter: rolls up toward the score (fast for big jumps), and each digit that ticks jumps and wobbles.
    const dt = Math.max(0, realTime - this.counterTime);
    this.counterTime = realTime;
    const gap = s.points - this.shownPoints;
    if (gap > 0) this.shownPoints = Math.min(s.points, this.shownPoints + Math.max(1, Math.ceil(gap * Math.min(1, dt * 6)), Math.ceil(40 * dt * 10)));
    else this.shownPoints = s.points;
    const digits = String(Math.min(this.shownPoints, 99_999_999)).padStart(8, '0');
    let bouncing = false;
    for (let i = 0; i < 8; i++) {
      if (digits[i] !== this.lastDigits[i]) this.digitAge[i] = 0;
      else this.digitAge[i]! += dt;
      const a = this.digitAge[i]!;
      this.digitBounce[i] = a < 0.35 ? Math.exp(-a * 9) * Math.abs(Math.cos(a * 28)) : 0;
      if (this.digitBounce[i]! > 0.01) bouncing = true;
    }
    this.lastDigits = digits;
    const label = `HOT: ${GATES[s.hotGate]} x2`;
    const key = `${this.shownPoints}|${s.coins}|${label}`;
    if (key !== this.painted || bouncing) {
      this.painted = key;
      paintCounter(this.machine.counter.ctx, this.shownPoints, s.coins, label, this.digitBounce);
      this.machine.counter.texture.needsUpdate = true;
    }
    this.animateLights(s, realTime);
    const stroke = (physics.pusherFront - PUSHER.frontMin) / (PUSHER.frontMax - PUSHER.frontMin);
    this.cast.update(
      {
        pressure: s.pressure,
        fever: s.fever > 0,
        cheering: s.cheering,
        sincePayout: s.sincePayout,
        sincePrize: s.sincePrize,
        sinceLoss: s.sinceLoss,
        stroke,
        forward: stroke > this.lastStroke,
      },
      realTime,
    );
    this.lastStroke = stroke;
    // Gauge: needle follows pressure with a nervous tremble that grows with it.
    const tremble = (s.pressure / 100) ** 2 * 0.08 * Math.sin(realTime * 47) + (s.fever > 0 ? 0.15 * Math.sin(realTime * 31) : 0);
    this.machine.gauge.needle.rotation.z = gaugeAngle(s.pressure) + tremble;
    const pulse = s.tier >= 3 || s.fever > 0 ? 1 + 0.06 * Math.sin(realTime * 14) : 1;
    this.machine.gauge.group.scale.setScalar(pulse);
    this.machine.topper.scale.setScalar(s.fever > 0 ? 1 + 0.04 * Math.sin(realTime * 18) : 1);
  }

  private animateLights(s: StageState, t: number): void {
    const fever = s.fever > 0;
    const look = TIER_LOOK[s.tier];
    (this.scene.background as THREE.Color).lerp(this.c.set(fever ? '#3a1050' : look.bg), 0.05);
    const chase = fever ? 22 : look.chase;
    const step = Math.floor(t * chase);
    const side = this.machine.sideLights;
    const half = side.count / 2;
    for (let i = 0; i < side.count; i++) {
      const k = i % half;
      // Fever: rainbow sweep; otherwise a chase climbing both sides.
      if (fever) side.setColorAt(i, this.c.setHSL((t * 0.8 + k / half) % 1, 1, 0.6));
      else side.setColorAt(i, this.c.set((step - k) % 3 === 0 ? look.bulbs[0] : look.bulbs[1]));
    }
    side.instanceColor!.needsUpdate = true;
    const edge = this.machine.edgeLights;
    for (let i = 0; i < edge.count; i++) {
      if (fever) edge.setColorAt(i, this.c.setHSL((t * 1.2 + i / edge.count) % 1, 1, 0.65));
      else edge.setColorAt(i, this.c.set((step + i) % 4 === 0 ? '#fff6c0' : PALETTE.goldDark));
    }
    edge.instanceColor!.needsUpdate = true;
  }

  /** Offsets the camera from home by juice shake, kick and FOV punch. Call after `update`, before `render`. */
  /**
   * The starting structure's reveal: the camera opens close on the build and pulls back out to the whole machine, while
   * a spotlight ring pulses around it. Call after a fresh machine is built.
   */
  reveal(physics: PhysicsWorld): void {
    let n = 0;
    const c = new THREE.Vector3();
    for (const coin of physics.coins) {
      if (coin.kind !== 'build') continue;
      const p = coin.body.translation();
      c.x += p.x;
      c.y += p.y;
      c.z += p.z;
      n++;
    }
    // A new machine also gets a fresh random handful of wall doodads.
    this.cast.shuffle(Math.floor(performance.now()) ^ physics.coins.length);
    if (!n) return;
    this.revealAt = c.multiplyScalar(1 / n);
    this.revealStart = -1;
  }

  private updateReveal(t: number): void {
    if (!this.revealAt) return;
    if (this.revealStart < 0) this.revealStart = t;
    const u = (t - this.revealStart) / REVEAL_TIME;
    if (u >= 1) {
      this.revealAt = null;
      this.revealK = 0;
      return;
    }
    // Hold close for the first 40%, then ease out to the home framing.
    this.revealK = u < 0.4 ? 1 : 1 - ((u - 0.4) / 0.6) ** 2 * (3 - 2 * ((u - 0.4) / 0.6));
  }

  applyCamera(juice: Juice): void {
    if (this.revealAt && this.revealK > 0) {
      // Blend from a close, low shot of the structure to home.
      const k = this.revealK;
      // A three-quarter shot from above and in front: the whole build fills the middle of the screen.
      const close = this.reveal_.set(this.revealAt.x + 6, this.revealAt.y + 34, this.revealAt.z + 52);
      this.camera.position.lerpVectors(this.home, close, k);
      this.lookTmp.lerpVectors(this.lookAt, this.revealAt, k);
      this.camera.lookAt(this.lookTmp);
      return;
    }
    const { shake, kick } = juice;
    this.camera.position.set(this.home.x + shake.x + kick.x, this.home.y + shake.y + kick.y, this.home.z);
    this.camera.lookAt(this.lookAt.x + shake.x * 0.5, this.lookAt.y + shake.y * 0.5, this.lookAt.z);
    this.camera.rotateZ(shake.roll);
    const fov = FIT.fov + juice.fovOffset;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render(): void {
    this.renderer.info.reset();
    this.composer.render();
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

}
