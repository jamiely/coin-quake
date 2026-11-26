import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { COIN, DROPPER, GATES, MAX_COINS, PUSHER, type GateIndex } from '../config';
import type { PhysicsWorld } from '../sim/physics';
import { paintCounter, buildMachine, type Machine } from './machine';
import { coinFace } from './textures';
import { PALETTE, fatten, outlineMat, toon } from './toon';

/** What the stage draws each frame; it reads these and never mutates game state. */
export interface StageState {
  dropperX: number;
  gate: GateIndex;
  hotGate: GateIndex;
  points: number;
  coins: number;
  /** Seconds since the last drop, for the claw snap. */
  sinceDrop: number;
}

/**
 * Framing: the box around the machine (cm) that must always be visible. Portrait (the cabinet's 1050x1680) fits the
 * height; wider screens fit the same box and show the side art.
 */
const FIT = { halfWidth: 25, halfHeight: 46, centerY: 12, centerZ: -6, pitchDeg: 14, fov: 34 };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FIT.fov, 1, 5, 1000);
  readonly scene = new THREE.Scene();
  /** The camera's resting place; effects offset from it. */
  readonly home = new THREE.Vector3();
  readonly lookAt = new THREE.Vector3(0, FIT.centerY, FIT.centerZ);
  private readonly composer: EffectComposer;
  private readonly machine: Machine;
  private readonly coins: THREE.InstancedMesh;
  private readonly coinOutlines: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private painted = '';

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#1c0d2b');

    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#6a3a8a', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(-30, 80, 60);
    this.scene.add(key);

    this.machine = buildMachine(this.scene);

    const face = coinFace();
    const coinGeo = new THREE.CylinderGeometry(COIN.radius, COIN.radius, 2 * COIN.halfThickness, 28);
    const rim = toon(PALETTE.goldDark);
    const top = toon('#ffffff', { map: face, emissive: PALETTE.gold, emissiveIntensity: 0.12 });
    this.coins = new THREE.InstancedMesh(coinGeo, [rim, top, top], MAX_COINS);
    this.coinOutlines = new THREE.InstancedMesh(fatten(coinGeo, 0.16), outlineMat(), MAX_COINS);
    for (const mesh of [this.coins, this.coinOutlines]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom only catches the bright bits (lamps, laser, highlights); the cartoon stays crisp.
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.92));
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    // Distance that fits FIT's box on the tighter axis.
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
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

  update(physics: PhysicsWorld, s: StageState, time: number): void {
    this.machine.pusher.position.z = physics.pusherFront - PUSHER.depth / 2;
    this.syncCoins(physics);

    const { carriage, claw, laser, gates } = this.machine;
    carriage.position.x = s.dropperX;
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

    const label = `HOT: ${GATES[s.hotGate]} x2`;
    const key = `${s.points}|${s.coins}|${label}`;
    if (key !== this.painted) {
      this.painted = key;
      paintCounter(this.machine.counter.ctx, s.points, s.coins, label);
      this.machine.counter.texture.needsUpdate = true;
    }
    const lights = this.machine.edgeLights;
    const c = new THREE.Color();
    for (let i = 0; i < lights.count; i++) {
      const on = (Math.floor(time * 8) + i) % 4 === 0;
      lights.setColorAt(i, c.set(on ? '#fff6c0' : PALETTE.goldDark));
    }
    lights.instanceColor!.needsUpdate = true;
  }

  render(): void {
    this.renderer.info.reset();
    this.composer.render();
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private syncCoins(physics: PhysicsWorld): void {
    const list = physics.coins;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!.body;
      const p = b.translation();
      const r = b.rotation();
      this.m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), this.scale);
      this.coins.setMatrixAt(i, this.m);
      this.coinOutlines.setMatrixAt(i, this.m);
    }
    this.coins.count = this.coinOutlines.count = list.length;
    this.coins.instanceMatrix.needsUpdate = this.coinOutlines.instanceMatrix.needsUpdate = true;
  }
}
