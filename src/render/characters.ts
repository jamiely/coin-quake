import * as THREE from 'three';
import { DECK, DROPPER, PUSHER, TRAY } from '../config';
import { chunkyText, roundRect, signCanvas } from './textures';
import { INK, PALETTE, outlined, toon } from './toon';

/** What the characters react to this frame. */
export interface Mood {
  /** 0..100. */
  pressure: number;
  fever: boolean;
  cheering: boolean;
  /** Seconds since the last front payout, prize and coin loss (Infinity when none yet). */
  sincePayout: number;
  sincePrize: number;
  sinceLoss: number;
  /** Pusher stroke phase 0..1 (1 = fully forward) and whether it is moving forward. */
  stroke: number;
  forward: boolean;
}

type Expression = 'idle' | 'happy' | 'shock' | 'panic' | 'party' | 'sad';

/**
 * The cast that makes the machine alive (GAME_DESIGN.md §1, "faces and life on everything"): the pusher's big grumpy
 * face that strains on every shove, googly eyes on the PSI gauge that roll and spin as pressure climbs, Professor
 * Pockets reacting from a window on the topper, and little critters that peek out of holes in the side walls.
 */
export class Characters {
  private readonly pusherFace: THREE.Group;
  private readonly pusherBrows: THREE.Mesh[] = [];
  private readonly pusherMouth: THREE.Mesh;
  private readonly pusherCheeks: THREE.Mesh[] = [];
  private readonly sweat: THREE.Mesh;
  private readonly gaugeEyes: { pupil: THREE.Object3D; lid: THREE.Mesh }[] = [];
  private readonly professor: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; mesh: THREE.Mesh; shown: Expression | '' };
  private readonly critters: { group: THREE.Group; side: number; next: number; t: number; out: number }[] = [];
  private last = 0;
  /**
   * The wall doodads (the user: "too much at once; make it random which ones appear"): the porthole, the gauge eyes and
   * the four critter holes. 3-4 show at a time; one swaps in or out every 40-60 s, popping in or shrinking away.
   */
  private readonly doodads: { node: THREE.Object3D; on: boolean; k: number }[] = [];
  private nextSwap = 45;
  private seed = 1;

  constructor(scene: THREE.Scene, pusher: THREE.Group, gauge: THREE.Group) {
    // Pusher face: on the block's front, below the gold stripe. Big eyes with brows, cheeks, and a mouth that grits.
    this.pusherFace = new THREE.Group();
    this.pusherFace.position.set(0, -0.2, PUSHER.depth / 2 + 0.06);
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      white.position.set(s * 4, 0.4, 0);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: INK }));
      pupil.position.set(-s * 0.15, -0.1, 0.01);
      white.add(pupil);
      const brow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.38), new THREE.MeshBasicMaterial({ color: INK }));
      brow.position.set(s * 4, 1.45, 0.02);
      this.pusherBrows.push(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), new THREE.MeshBasicMaterial({ color: '#ff7a9a', transparent: true, opacity: 0.7 }));
      cheek.position.set(s * 6.2, -0.6, 0.01);
      this.pusherCheeks.push(cheek);
      this.pusherFace.add(white, brow, cheek);
    }
    this.pusherMouth = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshBasicMaterial({ color: INK }));
    this.pusherMouth.position.set(0, -0.95, 0.02);
    this.sweat = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: '#8fe3ff' }));
    this.sweat.scale.set(0.8, 1.2, 0.5);
    this.sweat.position.set(7.4, 1.2, 0.2);
    this.pusherFace.add(this.pusherMouth, this.sweat);
    pusher.add(this.pusherFace);

    // Googly gauge eyes: two eyes on stalks above the PSI dial.
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 2.1, 5.6, 0.4);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 14), toon('#ffffff'));
      outlined(ball, 0.15);
      const pupil = new THREE.Group();
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: INK }));
      dot.position.z = 1.0;
      pupil.add(dot);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(1.32, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(PALETTE.cherry));
      lid.rotation.x = -1.2;
      eye.add(ball, pupil, lid);
      gauge.add(eye);
      this.gaugeEyes.push({ pupil, lid });
    }
    const eyes = new THREE.Group();
    for (const child of [...gauge.children].slice(-2)) eyes.add(child);
    gauge.add(eyes);
    this.doodads.push({ node: eyes, on: true, k: 1 });

    // Professor Pockets in a round window on the topper's left.
    const portrait = signCanvas(256, 256);
    const window = new THREE.Mesh(new THREE.CircleGeometry(4.4, 36), new THREE.MeshBasicMaterial({ map: portrait.texture, transparent: true }));
    const frame = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.5, 10, 36), toon(PALETTE.goldDark));
    outlined(frame, 0.18);
    const porthole = new THREE.Group();
    porthole.add(window, frame);
    porthole.position.set(-TRAY.halfWidth + 2.5, DROPPER.y + 19.5, DROPPER.z + 7);
    scene.add(porthole);
    this.professor = { ...portrait, mesh: window, shown: '' };
    this.doodads.push({ node: porthole, on: true, k: 1 });

    // Critters: little round gremlins that pop out of holes in the cabinet's side walls now and then.
    const colors = ['#7ed957', '#ff9f43', '#b18cff', '#59c3ff'];
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshBasicMaterial({ color: INK }));
      hole.position.z = -0.05;
      const body = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), toon(colors[i]!));
      outlined(head, 0.12);
      body.add(head);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        e.position.set(s * 0.38, 0.2, 0.9);
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: INK }));
        p.position.z = 0.22;
        e.add(p);
        body.add(e);
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), toon(colors[i]!));
        ear.position.set(s * 0.6, 1.05, 0);
        ear.rotation.z = -s * 0.4;
        body.add(ear);
      }
      g.add(hole, body);
      // Holes in the front face of each side wall, at two heights.
      g.position.set(side * (TRAY.halfWidth + 1.5), i < 2 ? 22 : 10, DECK.front + 1.2);
      g.userData.body = body;
      scene.add(g);
      this.critters.push({ group: g, side, next: 3 + i * 2.5, t: 0, out: 0 });
      this.doodads.push({ node: g, on: true, k: 1 });
    }
    this.shuffle(1);
  }

  /** Picks a fresh random 3-4 of the doodads (a new run). `seed` keeps it reproducible per run. */
  shuffle(seed: number): void {
    this.seed = (seed >>> 0) || 1;
    const n = 3 + (this.rand() < 0.5 ? 1 : 0);
    const order = this.doodads.map((_, i) => i).sort(() => this.rand() - 0.5);
    this.doodads.forEach((d, i) => {
      d.on = order.indexOf(i) < n;
      d.k = 0;
    });
    this.nextSwap = this.last + 40 + this.rand() * 20;
  }

  private rand(): number {
    // xorshift: cosmetic only, independent of the simulation's RNG.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  /** Every 40-60 s one shown doodad leaves and a hidden one arrives. */
  private rotate(t: number, dt: number): void {
    if (t >= this.nextSwap) {
      this.nextSwap = t + 40 + this.rand() * 20;
      const shown = this.doodads.filter((d) => d.on);
      const hidden = this.doodads.filter((d) => !d.on);
      if (shown.length && hidden.length) {
        shown[Math.floor(this.rand() * shown.length)]!.on = false;
        hidden[Math.floor(this.rand() * hidden.length)]!.on = true;
      }
    }
    for (const d of this.doodads) {
      // Springy pop in, quick shrink out.
      const target = d.on ? 1 : 0;
      d.k += (target - d.k) * Math.min(1, dt * (d.on ? 6 : 9));
      const pop = d.on && d.k < 0.98 ? 1 + 0.25 * Math.sin(d.k * Math.PI) : 1;
      d.node.visible = d.k > 0.01;
      d.node.scale.setScalar(Math.max(0.001, d.k * pop));
    }
  }

  update(m: Mood, t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    this.rotate(t, dt);
    this.updatePusher(m, t);
    this.updateGauge(m, t);
    this.updateProfessor(m);
    this.updateCritters(m, t, dt);
  }

  private updatePusher(m: Mood, t: number): void {
    // Straining on the forward stroke: brows down, mouth gritted wide, cheeks flushing, a sweat drop at high pressure.
    const strain = m.forward ? Math.sin(m.stroke * Math.PI) : 0;
    const happy = m.sincePayout < 0.6 || m.cheering || m.fever;
    this.pusherBrows.forEach((brow, i) => {
      const s = i ? 1 : -1;
      brow.rotation.z = s * (happy ? 0.25 : -0.15 - 0.35 * strain);
      brow.position.y = 1.45 - 0.25 * strain + (happy ? 0.25 : 0);
    });
    this.pusherMouth.scale.set(1 + 0.6 * strain + (happy ? 0.4 : 0), happy ? 2.2 : 1 + 1.5 * strain, 1);
    for (const c of this.pusherCheeks) (c.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.55 * strain;
    this.pusherFace.position.x = strain * 0.15 * Math.sin(t * 60);
    this.sweat.visible = m.pressure > 50 && !happy;
    this.sweat.position.y = 1.2 - ((t * 1.5) % 1) * 1.5;
  }

  private updateGauge(m: Mood, t: number): void {
    // Pupils: look around lazily when calm, dart nervously as pressure rises, spin in circles during fever; roll up
    // in exasperation after a coin is lost.
    const p = m.pressure / 100;
    this.gaugeEyes.forEach((eye, i) => {
      let x: number;
      let y: number;
      if (m.fever) {
        const a = t * 9 + i * Math.PI;
        x = Math.cos(a) * 0.5;
        y = Math.sin(a) * 0.5;
      } else if (m.sinceLoss < 0.9) {
        x = 0;
        y = 0.6;
      } else {
        const jitter = p * p;
        x = Math.sin(t * (0.7 + jitter * 9) + i) * (0.35 + 0.2 * jitter);
        y = Math.cos(t * (0.9 + jitter * 11)) * 0.25 - 0.1;
      }
      eye.pupil.rotation.set(-y, x, 0);
      // Lids droop when calm, fly open in shock at high pressure, blink now and then.
      const blink = (t + i * 0.1) % 4 < 0.1;
      eye.lid.rotation.x = blink ? 0.2 : -1.2 - (p > 0.7 || m.fever ? 0.5 : 0) + (p < 0.2 ? 0.35 : 0);
    });
  }

  private updateProfessor(m: Mood): void {
    const expr: Expression = m.cheering || m.sincePrize < 2 ? 'party' : m.fever ? 'party' : m.sinceLoss < 1 ? 'sad' : m.pressure > 75 ? 'panic' : m.pressure > 50 ? 'shock' : m.sincePayout < 1 ? 'happy' : 'idle';
    if (expr === this.professor.shown) return;
    this.professor.shown = expr;
    paintProfessor(this.professor.ctx, expr);
    this.professor.texture.needsUpdate = true;
  }

  private updateCritters(m: Mood, t: number, dt: number): void {
    for (const c of this.critters) {
      c.t += dt;
      // During fever every critter pops out to watch; otherwise one peeks out now and then.
      const wantOut = m.fever || m.cheering || c.t >= c.next;
      if (wantOut && c.out === 0) c.t = 0;
      if (!m.fever && !m.cheering && c.out > 0 && c.t > 2.2) {
        c.out = 0;
        c.next = 4 + Math.random() * 10;
        c.t = 0;
      } else if (wantOut) {
        c.out = 1;
      }
      const body = c.group.userData.body as THREE.Group;
      // Pop out (springy) or duck back in.
      const target = c.out ? 1 : 0;
      const cur = body.userData.k ?? 0;
      const k = cur + (target - cur) * Math.min(1, dt * 10);
      body.userData.k = k;
      body.scale.setScalar(Math.max(0.001, k));
      body.position.z = 0.5 * k;
      body.position.y = Math.sin(t * 8 + c.group.position.y) * 0.15 * k;
      body.rotation.z = (m.fever || m.cheering ? Math.sin(t * 12) * 0.4 : Math.sin(t * 2) * 0.1) * k;
    }
  }
}

/** Professor Pockets' face in the porthole, one cartoon expression per mood. */
function paintProfessor(g: CanvasRenderingContext2D, expr: Expression): void {
  g.clearRect(0, 0, 256, 256);
  // Sky-blue window background.
  g.fillStyle = expr === 'panic' ? '#ff9a8a' : expr === 'party' ? '#ffe27a' : '#bfe9ff';
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  // Wild white hair.
  g.fillStyle = '#ffffff';
  g.strokeStyle = INK;
  g.lineWidth = 6;
  const tufts = expr === 'panic' || expr === 'shock' ? 9 : 7;
  for (let i = 0; i < tufts; i++) {
    const a = Math.PI + (i / (tufts - 1)) * Math.PI;
    const r = expr === 'panic' ? 98 : 88;
    g.beginPath();
    g.arc(128 + Math.cos(a) * r * 0.85, 128 + Math.sin(a) * r * 0.7 + 10, 28, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // Face.
  g.fillStyle = '#ffd9b8';
  g.beginPath();
  g.ellipse(128, 140, 64, 72, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Goggles on the forehead.
  g.fillStyle = '#59c3ff';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(128 + s * 26, 86, 18, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // Eyes.
  g.fillStyle = INK;
  const eyeY = 132;
  if (expr === 'party' || expr === 'happy') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(128 + s * 24, eyeY + 6, 12, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  } else {
    const r = expr === 'shock' || expr === 'panic' ? 14 : 9;
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(128 + s * 24, eyeY, r + 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(128 + s * 24, eyeY + (expr === 'sad' ? 4 : 0), r * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Mouth.
  g.fillStyle = INK;
  g.beginPath();
  switch (expr) {
    case 'idle':
      g.moveTo(108, 178);
      g.quadraticCurveTo(128, 186, 148, 178);
      g.stroke();
      break;
    case 'happy':
      g.arc(128, 170, 22, 0.1 * Math.PI, 0.9 * Math.PI);
      g.stroke();
      break;
    case 'party':
      g.moveTo(96, 166);
      g.quadraticCurveTo(128, 222, 160, 166);
      g.closePath();
      g.fill();
      break;
    case 'shock':
      g.ellipse(128, 182, 12, 16, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'panic':
      g.ellipse(128, 186, 22, 26, 0, 0, Math.PI * 2);
      g.fill();
      // Sweat drops.
      g.fillStyle = '#8fe3ff';
      for (const [x, y] of [[62, 120], [196, 128]]) {
        g.beginPath();
        g.ellipse(x!, y!, 7, 11, 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'sad':
      g.arc(128, 196, 18, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke();
      break;
  }
  // A small name plate.
  roundRect(g, 64, 222, 128, 28, 12);
  g.fillStyle = PALETTE.plum;
  g.fill();
  chunkyText(g, 'PROF', 128, 237, 20, PALETTE.gold);
}
