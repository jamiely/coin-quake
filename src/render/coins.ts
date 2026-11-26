import * as THREE from 'three';
import { COIN, COIN_KINDS, MAX_COINS, type CoinKind } from '../config';
import type { PhysicsWorld } from '../sim/physics';
import { fatten, INK, outlineMat, PALETTE, toon, toonRamp } from './toon';

/** Coin expressions (the user: "coins with faces that scream as they fall and cheer when they land"). */
export const FACES = ['smile', 'scream', 'cheer', 'dizzy'] as const;
export type Face = (typeof FACES)[number];

/** Seconds a blasted coin's squash-and-wobble lasts. */
const SQUASH_TIME = 0.35;
/** Seconds a coin keeps cheering after it lands, or looking dizzy after a blast. */
const CHEER_TIME = 1.2;
const DIZZY_TIME = 0.9;
/** A coin falling faster than this (cm/s) screams. */
const SCREAM_SPEED = 60;

/**
 * Paints one kind's face atlas: four cartoon faces side by side (smile, scream, cheer, dizzy) on the coin's colour,
 * with an inked rim and a highlight glint.
 */
function faceAtlas(face: string, rim: string, rainbow: boolean): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size * FACES.length;
  c.height = size;
  const g = c.getContext('2d')!;
  FACES.forEach((expr, i) => {
    const x0 = i * size;
    const cx = x0 + size / 2;
    const cy = size / 2;
    if (rainbow) {
      const grad = g.createConicGradient(0, cx, cy);
      ['#ff4d6d', '#ffa53d', '#ffe14a', '#5fe07a', '#4dc3ff', '#a77bff', '#ff4d6d'].forEach((col, k, a) => grad.addColorStop(k / (a.length - 1), col));
      g.fillStyle = grad;
    } else {
      g.fillStyle = face;
    }
    g.fillRect(x0, 0, size, size);
    g.lineWidth = 8;
    g.strokeStyle = rim;
    g.beginPath();
    g.arc(cx, cy, 52, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(x0 + 36, 30, 13, 5, -0.6, 0, Math.PI * 2);
    g.fill();
    drawFace(g, cx, cy, expr);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawFace(g: CanvasRenderingContext2D, cx: number, cy: number, expr: Face): void {
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = 6;
  const eye = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
  };
  switch (expr) {
    case 'smile':
      eye(cx - 16, cy - 10, 7);
      eye(cx + 16, cy - 10, 7);
      g.beginPath();
      g.arc(cx, cy + 6, 18, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      break;
    case 'scream':
      // Wide panicked eyes and a big open "AAAH" mouth.
      g.fillStyle = '#ffffff';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 17, cy - 14, 11, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.fillStyle = INK;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 17, cy - 14, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.ellipse(cx, cy + 18, 14, 19, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6b8a';
      g.beginPath();
      g.ellipse(cx, cy + 28, 8, 6, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'cheer':
      // Happy closed eyes (^ ^) and a huge grin.
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 17, cy - 6, 9, 1.1 * Math.PI, 1.9 * Math.PI);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - 24, cy + 6);
      g.quadraticCurveTo(cx, cy + 44, cx + 24, cy + 6);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff6b8a';
      g.beginPath();
      g.ellipse(cx, cy + 22, 10, 6, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'dizzy':
      // X eyes and a wobbly mouth.
      for (const s of [-1, 1]) {
        const x = cx + s * 17;
        const y = cy - 10;
        g.beginPath();
        g.moveTo(x - 7, y - 7);
        g.lineTo(x + 7, y + 7);
        g.moveTo(x + 7, y - 7);
        g.lineTo(x - 7, y + 7);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - 18, cy + 18);
      for (let i = 1; i <= 6; i++) g.lineTo(cx - 18 + i * 6, cy + 18 + (i % 2 ? -5 : 5));
      g.stroke();
      break;
  }
}

/**
 * Faces read from a per-instance atlas offset. The face material samples `map` at (uv.x + face) / 4, so one draw per
 * kind still shows every expression.
 */
function faceMaterial(map: THREE.Texture, emissive: string): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', map, gradientMap: toonRamp(), emissive, emissiveIntensity: 0.12 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float face;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2((vMapUv.x + face) / ${FACES.length.toFixed(1)}, vMapUv.y);`);
  };
  return mat;
}

interface KindMesh {
  mesh: THREE.InstancedMesh;
  outline: THREE.InstancedMesh;
  face: THREE.InstancedBufferAttribute;
  count: number;
}

/**
 * All coins and prize figurines. One instanced mesh (plus outline) per coin kind, each with its own size, colours
 * and face atlas; faces change by what the coin is doing. Figurines are small cartoon toys built from primitives.
 */
export class CoinsView {
  private readonly kinds = new Map<CoinKind, KindMesh>();
  private readonly figurines = new Map<number, THREE.Group>();
  private readonly figurineGroup = new THREE.Group();
  /** Hidden figurine models waiting to be reused, by kind. */
  private readonly figurinePool = new Map<string, THREE.Group[]>();
  private readonly seen = new Set<number>();
  private readonly squash = new Map<number, number>();
  private readonly squashAge = new Map<number, number>();
  /** Seconds since each coin last landed or was blasted, for cheer and dizzy faces. */
  private readonly cheerAge = new Map<number, number>();
  private readonly dizzyAge = new Map<number, number>();
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    for (const kind of Object.keys(COIN_KINDS) as CoinKind[]) {
      const k = COIN_KINDS[kind];
      const geo = new THREE.CylinderGeometry(COIN.radius * k.scale, COIN.radius * k.scale, 2 * COIN.halfThickness * k.thick, 28);
      const face = new THREE.InstancedBufferAttribute(new Float32Array(MAX_COINS), 1);
      face.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('face', face);
      const atlas = faceAtlas(k.face, k.rim, kind === 'rainbow');
      const top = faceMaterial(atlas, kind === 'rainbow' ? '#ffffff' : k.face);
      const rim = toon(k.rim, kind === 'gold' || kind === 'rainbow' ? { emissive: k.rim, emissiveIntensity: 0.35 } : {});
      const mesh = new THREE.InstancedMesh(geo, [rim, top, top], MAX_COINS);
      const outline = new THREE.InstancedMesh(fatten(geo, 0.16), outlineMat(), MAX_COINS);
      for (const x of [mesh, outline]) {
        x.frustumCulled = false;
        x.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        x.count = 0;
        scene.add(x);
      }
      this.kinds.set(kind, { mesh, outline, face, count: 0 });
    }
    scene.add(this.figurineGroup);
  }

  update(physics: PhysicsWorld, dt: number, t: number): void {
    for (const [handle, k] of physics.blasted) {
      this.squash.set(handle, Math.max(this.squash.get(handle) ?? 0, k));
      this.squashAge.set(handle, 0);
      if (k > 0.35) this.dizzyAge.set(handle, 0);
    }
    physics.blasted.clear();
    for (const km of this.kinds.values()) km.count = 0;
    const seen = this.seen;
    seen.clear();
    for (const coin of physics.coins) {
      const b = coin.body;
      const h = b.handle;
      seen.add(h);
      const p = b.translation();
      const r = b.rotation();
      if (coin.figurine) {
        this.drawFigurine(h, coin.figurine, p, r, t);
        continue;
      }
      // Squash-and-wobble after an impact (local Y is the thickness axis: flatten it, widen the face).
      this.s.set(1, 1, 1);
      const k = this.squash.get(h);
      if (k !== undefined) {
        const age = (this.squashAge.get(h) ?? 0) + dt;
        const u = age / SQUASH_TIME;
        if (u >= 1) {
          this.squash.delete(h);
          this.squashAge.delete(h);
        } else {
          this.squashAge.set(h, age);
          const a = 0.55 * k * Math.exp(-u * 4) * Math.cos(u * Math.PI * 3);
          this.s.set(1 + a * 0.5, 1 - a, 1 + a * 0.5);
        }
      }
      // Face: screaming while it plummets, dizzy after a blast, cheering once it lands, else smiling.
      const v = b.linvel();
      const falling = -v.y > SCREAM_SPEED && p.y > 3;
      let face: Face = 'smile';
      const dz = this.dizzyAge.get(h);
      if (dz !== undefined) {
        if (dz + dt > DIZZY_TIME) this.dizzyAge.delete(h);
        else this.dizzyAge.set(h, dz + dt);
      }
      if (falling) {
        face = 'scream';
        this.cheerAge.set(h, -1);
      } else if (this.dizzyAge.has(h)) {
        face = 'dizzy';
      } else {
        const ca = this.cheerAge.get(h);
        if (ca !== undefined) {
          // -1 marks "was screaming"; the first frame it stops falling starts the cheer.
          const age = ca < 0 ? 0 : ca + dt;
          if (age > CHEER_TIME) this.cheerAge.delete(h);
          else {
            this.cheerAge.set(h, age);
            face = 'cheer';
          }
        }
      }
      const km = this.kinds.get(coin.kind)!;
      const i = km.count++;
      this.q.set(r.x, r.y, r.z, r.w);
      // Cheering coins bounce a little in place.
      const bounce = face === 'cheer' ? Math.abs(Math.sin(t * 14 + h)) * 0.25 : 0;
      this.m.compose(this.p.set(p.x, p.y + bounce, p.z), this.q, this.s);
      km.mesh.setMatrixAt(i, this.m);
      km.outline.setMatrixAt(i, this.m);
      km.face.setX(i, FACES.indexOf(face));
    }
    for (const km of this.kinds.values()) {
      km.mesh.count = km.outline.count = km.count;
      km.mesh.instanceMatrix.needsUpdate = km.outline.instanceMatrix.needsUpdate = true;
      km.face.needsUpdate = true;
    }
    // A figurine that left the machine goes back to its kind's pool, so prize drops never allocate GPU resources again.
    for (const [h, g] of this.figurines) {
      if (seen.has(h)) continue;
      g.visible = false;
      this.figurines.delete(h);
      const kind = g.userData.kind as string;
      let pool = this.figurinePool.get(kind);
      if (!pool) this.figurinePool.set(kind, (pool = []));
      pool.push(g);
    }
    for (const map of [this.squash, this.squashAge, this.cheerAge, this.dizzyAge]) for (const h of map.keys()) if (!seen.has(h)) map.delete(h);
  }

  private drawFigurine(h: number, kind: string, p: RAPIER_Vec, r: RAPIER_Rot, t: number): void {
    let g = this.figurines.get(h);
    if (!g) {
      g = this.figurinePool.get(kind)?.pop();
      if (!g) {
        g = buildFigurine(kind);
        g.userData.kind = kind;
        this.figurineGroup.add(g);
      }
      g.visible = true;
      this.figurines.set(h, g);
    }
    g.position.set(p.x, p.y, p.z);
    g.quaternion.set(r.x, r.y, r.z, r.w);
    // Little idle life: the toy's head bobs and its eyes blink.
    const head = g.userData.head as THREE.Object3D | undefined;
    if (head) head.rotation.z = Math.sin(t * 3 + h) * 0.15;
    const eyes = g.userData.eyes as THREE.Object3D[] | undefined;
    const blink = (t + h * 0.37) % 3.2 < 0.12 ? 0.15 : 1;
    if (eyes) for (const e of eyes) e.scale.y = blink;
  }
}

type RAPIER_Vec = { x: number; y: number; z: number };
type RAPIER_Rot = { x: number; y: number; z: number; w: number };

/** A chunky cartoon toy on a gold base, about 3.2 cm tall, centred like its physics body. */
function buildFigurine(kind: string): THREE.Group {
  const g = new THREE.Group();
  const outline = (m: THREE.Mesh, w = 0.12) => {
    const hull = new THREE.Mesh(fatten(m.geometry, w), outlineMat());
    m.add(hull);
    return m;
  };
  const base = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.45, 0.6, 20), toon(PALETTE.gold)));
  base.position.y = -1.35;
  g.add(base);
  const body = new THREE.Group();
  g.add(body);
  const colors: Record<string, [string, string]> = {
    critter: ['#7ed957', '#4a9b2f'],
    professor: ['#f2f2f2', '#59c3ff'],
    bolt: [PALETTE.sky, '#2f86c4'],
    duck: ['#ffd84a', '#ff8a3d'],
  };
  const [main, accent] = colors[kind] ?? colors.critter!;
  const torso = outline(new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), toon(main)));
  torso.scale.set(1, 1.1, 0.9);
  torso.position.y = -0.35;
  body.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.85;
  const skull = outline(new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14), toon(kind === 'professor' ? '#ffd9b8' : main)));
  head.add(skull);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    white.position.set(s * 0.3, 0.1, 0.68);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: INK }));
    pupil.position.z = 0.17;
    white.add(pupil);
    head.add(white);
    eyes.push(white);
  }
  switch (kind) {
    case 'critter': {
      // Gear-eared critter: two little cog ears.
      for (const s of [-1, 1]) {
        const ear = outline(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.12, 6, 8), toon(accent)));
        ear.position.set(s * 0.55, 0.65, 0);
        head.add(ear);
      }
      break;
    }
    case 'professor': {
      // Wild white hair and goggles.
      for (let i = 0; i < 5; i++) {
        const tuft = outline(new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), toon('#ffffff')));
        tuft.position.set(-0.6 + i * 0.3, 0.55 + (i % 2) * 0.12, -0.15);
        head.add(tuft);
      }
      const goggles = outline(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 6, 16), toon(accent)));
      goggles.position.set(0, 0.35, 0.2);
      goggles.rotation.x = Math.PI / 2.4;
      head.add(goggles);
      break;
    }
    case 'bolt': {
      const antenna = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), toon(INK)));
      antenna.position.y = 0.95;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3d7f', toneMapped: false }));
      bulb.position.y = 1.3;
      head.add(antenna, bulb);
      break;
    }
    case 'duck': {
      const beak = outline(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 10), toon(accent)));
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, -0.1, 0.85);
      head.add(beak);
      break;
    }
  }
  body.add(head);
  g.userData.head = head;
  g.userData.eyes = eyes;
  return g;
}
