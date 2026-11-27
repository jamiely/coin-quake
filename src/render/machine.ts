import * as THREE from 'three';
import { DECK, DROPPER, GATES, LOWER, PUSHER, STEPS, TRAY } from '../config';
import { backWall, chunkyText, roundRect, signCanvas } from './textures';
import { INK, PALETTE, outlined, toon } from './toon';

/** Static and animated parts of the cabinet the stage needs to move or repaint. */
export interface Machine {
  pusher: THREE.Group;
  /** The lower tray's pusher, sliding out from under the deck's step. */
  lower: THREE.Group;
  /** Every step pusher, top step first (the last one is `lower`). */
  steps: THREE.Group[];
  carriage: THREE.Group;
  /** Bolt, the little robot riding the carriage (eyes are children). */
  bolt: THREE.Group;
  claw: THREE.Mesh[];
  laser: THREE.Mesh;
  gates: { plate: THREE.Mesh; lamp: THREE.MeshToonMaterial; hot: THREE.Mesh }[];
  counter: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  edgeLights: THREE.InstancedMesh;
  /** Marquee bulbs up both cabinet sides; the stage animates their chase by pressure tier. */
  sideLights: THREE.InstancedMesh;
  gauge: { group: THREE.Group; needle: THREE.Group; face: THREE.MeshBasicMaterial };
  topper: THREE.Mesh;
}

const hw = TRAY.halfWidth;

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, outline = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (outline > 0) outlined(m, outline);
  return m;
}

export function buildMachine(scene: THREE.Scene): Machine {
  const cherry = toon(PALETTE.cherry);
  const cream = toon(PALETTE.cream);
  const plum = toon(PALETTE.plum);
  const mint = toon(PALETTE.mint);

  // Back wall art behind everything.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 260), new THREE.MeshBasicMaterial({ map: backWall() }));
  wall.position.set(0, 30, -45);
  scene.add(wall);

  // Four tiers: deck 1 under the shelf, then each step deck down to the deep lower tray. Every deck is a cream floor
  // with its own inlay colour and a gold step face where it drops to the next floor.
  const deckBack = TRAY.back;
  const decks = [{ y: DECK.y, front: DECK.front, back: PUSHER.frontMax }, ...STEPS.slice(0, -1).map((st) => ({ y: st.y, front: st.front, back: st.frontMax }))];
  const inlays = ['#c9f5e3', '#ffd9e6'];
  decks.forEach((deck, i) => {
    const below = STEPS[i]!;
    scene.add(box(2 * hw, DECK.thickness, deck.front - deckBack, cream, 0, deck.y - DECK.thickness / 2, (deck.front + deckBack) / 2));
    const deckInlay = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 4, deck.front - deck.back - 1.5), toon(inlays[i % inlays.length]!));
    deckInlay.rotation.x = -Math.PI / 2;
    deckInlay.position.set(0, deck.y + 0.02, (deck.front + deck.back) / 2);
    scene.add(deckInlay);
    const stepH = deck.y - DECK.thickness - (below.y + below.height) - 0.15;
    scene.add(box(2 * hw, stepH, 0.6, toon(PALETTE.goldDark), 0, below.y + below.height + 0.15 + stepH / 2, deck.front - 0.3, 0.2));
  });
  scene.add(box(2 * hw, 2, TRAY.front - TRAY.back, cream, 0, TRAY.y - 1, (TRAY.front + TRAY.back) / 2));
  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 4, TRAY.front - LOWER.frontMax - 3), toon('#ffe2b0'));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, TRAY.y + 0.02, (TRAY.front + LOWER.frontMax) / 2);
  scene.add(inlay);
  const railFront = TRAY.front - TRAY.openCorner;
  const tallFront = DECK.front + 1;
  for (const side of [-1, 1]) {
    const wallH = DROPPER.y + 10 - TRAY.y;
    scene.add(box(3, wallH, tallFront - TRAY.back + 6, cherry, side * (hw + 1.5), TRAY.y - 4 + wallH / 2, (tallFront + TRAY.back) / 2 - 3));
    scene.add(box(1.6, 3.4, railFront - tallFront, toon(PALETTE.gold), side * (hw + 0.8), TRAY.y + 1.7, (railFront + tallFront) / 2));
  }
  // Base under the tray front, with the chute trough and its LED edge.
  scene.add(box(2 * hw + 6, 6, 4, cherry, 0, TRAY.y - 6, TRAY.front + 3));
  const edgeLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 24);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    m.makeTranslation(-hw + 1.5 + (i * (2 * hw - 3)) / 23, TRAY.y - 3.2, TRAY.front + 5.1);
    edgeLights.setMatrixAt(i, m);
    edgeLights.setColorAt(i, new THREE.Color(PALETTE.gold));
  }
  scene.add(edgeLights);

  // Pusher: plum block, cream top (the upper shelf), gold stripe on its face.
  const pusher = new THREE.Group();
  pusher.add(box(2 * hw - 0.1, PUSHER.height, PUSHER.depth, plum, 0, 0, 0));
  const stripe = box(2 * hw - 0.2, 0.8, 0.2, toon(PALETTE.gold), 0, 0.4, PUSHER.depth / 2 + 0.05, 0);
  pusher.add(stripe);
  pusher.position.y = PUSHER.height / 2;
  scene.add(pusher);
  // Step pushers: low blocks with a stripe, each its own colour, so every tier reads as a different machine.
  const stepColors = ['#2f8f7a', '#3b5fae'];
  const steps = STEPS.map((st, i) => {
    const g = new THREE.Group();
    g.add(box(2 * hw - 0.1, st.height, st.depth, toon(stepColors[i % stepColors.length]!), 0, 0, 0));
    g.add(box(2 * hw - 0.2, 0.5, 0.2, toon(i % 2 ? PALETTE.gold : PALETTE.cherry), 0, 0.3, st.depth / 2 + 0.05, 0));
    g.position.y = st.y + st.height / 2;
    scene.add(g);
    return g;
  });
  const lower = steps[steps.length - 1]!;

  // Scraper wall and the glass front of the drop zone.
  const scraperH = DROPPER.y - PUSHER.height + 10;
  scene.add(box(2 * hw, scraperH, 1, cream, 0, PUSHER.height + 0.4 + scraperH / 2, PUSHER.scraperZ - 0.5));
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * hw, DROPPER.y - PUSHER.height - 6),
    new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.set(0, (DROPPER.y + PUSHER.height + 6) / 2, DROPPER.z + 4.3);
  scene.add(glass);
  // Glass frame bars, so the pane reads as glass in a cartoon.
  // A low frame rail at the glass foot, under the flippers, so it never crosses the machinery.
  scene.add(box(2 * hw, 0.8, 1, mint, 0, PUSHER.height + 1.6, DROPPER.z + 4.3));

  // Swing rail and the brass carriage with a two-finger claw.
  scene.add(box(2 * hw + 2, 1.4, 1.4, toon(PALETTE.goldDark), 0, DROPPER.y + 5, DROPPER.z));
  const carriage = new THREE.Group();
  carriage.add(box(5, 3, 3, toon(PALETTE.gold), 0, 3, 0));
  const bolt = new THREE.Group();
  bolt.position.set(0, 5.8, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), toon(PALETTE.sky));
  outlined(head, 0.3);
  bolt.add(head);
  carriage.add(bolt);
  for (const eye of [-0.6, 0.6]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    e.position.set(eye, 0.3, 1.35);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: INK }));
    pupil.position.set(0, 0, 0.32);
    e.add(pupil);
    bolt.add(e);
  }
  const claw: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const finger = box(0.8, 3, 1.2, toon(PALETTE.goldDark), side * 1.6, 0.2, 0, 0.2);
    finger.geometry.translate(0, -1.2, 0);
    finger.position.y = 1.5;
    claw.push(finger);
    carriage.add(finger);
  }
  carriage.position.set(0, DROPPER.y, DROPPER.z);
  scene.add(carriage);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6), new THREE.MeshBasicMaterial({ color: '#ff3d7f', transparent: true, opacity: 0.8 }));
  scene.add(laser);

  // Three gates under the swing, with a lamp each and a HOT tag above the active one.
  const gates: Machine['gates'] = [];
  const third = (2 * DROPPER.halfSwing) / 3;
  GATES.forEach((label, i) => {
    const x = -DROPPER.halfSwing + third * (i + 0.5);
    const sign = signCanvas(128, 64);
    roundRect(sign.ctx, 4, 4, 120, 56, 14);
    sign.ctx.fillStyle = PALETTE.cream;
    sign.ctx.fill();
    sign.ctx.lineWidth = 6;
    sign.ctx.strokeStyle = INK;
    sign.ctx.stroke();
    chunkyText(sign.ctx, label, 64, 34, 40, PALETTE.cherry);
    const lamp = toon(PALETTE.plum, { emissive: '#ffffff', emissiveIntensity: 0 });
    const plate = box(third - 1.5, 1.6, 1.4, lamp, x, DROPPER.y - 4.5, DROPPER.z + 3.6, 0.25);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    face.position.set(0, 0, 0.75);
    plate.add(face);
    const hotSign = signCanvas(192, 96);
    roundRect(hotSign.ctx, 6, 6, 180, 84, 30);
    hotSign.ctx.fillStyle = PALETTE.hot;
    hotSign.ctx.fill();
    hotSign.ctx.lineWidth = 8;
    hotSign.ctx.strokeStyle = INK;
    hotSign.ctx.stroke();
    chunkyText(hotSign.ctx, 'HOT x2', 96, 50, 46, '#fff36b');
    const hot = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: hotSign.texture, transparent: true }));
    hot.position.set(x, DROPPER.y - 1.2, DROPPER.z + 4.5);
    hot.visible = false;
    scene.add(plate, hot);
    gates.push({ plate, lamp, hot });
  });

  // Topper sign.
  const topper = signCanvas(1024, 320);
  const g = topper.ctx;
  roundRect(g, 12, 12, 1000, 296, 80);
  g.fillStyle = PALETTE.cherry;
  g.fill();
  g.lineWidth = 20;
  g.strokeStyle = INK;
  g.stroke();
  chunkyText(g, 'COIN QUAKE', 512, 165, 128, PALETTE.gold);
  const topperMesh = new THREE.Mesh(new THREE.PlaneGeometry(38, 11.9), new THREE.MeshBasicMaterial({ map: topper.texture, transparent: true }));
  topperMesh.position.set(0, DROPPER.y + 15, DROPPER.z + 6);
  scene.add(topperMesh);

  // Counter plate under the front edge: POINTS, COINS and HOT; repainted by the stage when values change.
  const counter = signCanvas(1024, 384);
  const counterMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 6, (2 * hw + 6) * 0.375), new THREE.MeshBasicMaterial({ map: counter.texture, transparent: true }));
  counterMesh.position.set(0, TRAY.y - 16, TRAY.front + 6);
  counterMesh.rotation.x = -0.25;
  scene.add(counterMesh);

  // Marquee bulbs up the front edge of both side walls.
  const perSide = 18;
  const sideLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), perSide * 2);
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < perSide; i++) {
      const y = TRAY.y - 1 + (i * (DROPPER.y + 6 - TRAY.y)) / (perSide - 1);
      m.makeTranslation((s ? 1 : -1) * (hw + 1.5), y, tallFront + 0.2);
      sideLights.setMatrixAt(s * perSide + i, m);
      sideLights.setColorAt(s * perSide + i, new THREE.Color(PALETTE.gold));
    }
  }
  scene.add(sideLights);

  // Pressure gauge: a big glass dial with a needle, beside the topper.
  const gaugeFace = signCanvas(256, 256);
  paintGauge(gaugeFace.ctx);
  const gauge = new THREE.Group();
  const faceMat = new THREE.MeshBasicMaterial({ map: gaugeFace.texture, transparent: true });
  const face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), faceMat);
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.45, 10, 40), toon(PALETTE.goldDark));
  outlined(rimMesh, 0.2);
  const needle = new THREE.Group();
  const needleBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.2), new THREE.MeshBasicMaterial({ color: INK }));
  needleBar.position.y = 1.5;
  needle.add(needleBar);
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: PALETTE.cherry }));
  hub.position.z = 0.25;
  needle.add(hub);
  needle.position.z = 0.15;
  gauge.add(face, rimMesh, needle);
  gauge.position.set(hw - 2.5, DROPPER.y + 19.5, DROPPER.z + 7);
  scene.add(gauge);

  return { pusher, lower, steps, carriage, bolt, claw, laser, gates, counter, edgeLights, sideLights, gauge: { group: gauge, needle, face: faceMat }, topper: topperMesh };
}

/** Gauge dial: cream face, green-to-red arc over 240 degrees, ticks, and "PSI". */
function paintGauge(g: CanvasRenderingContext2D): void {
  g.fillStyle = PALETTE.cream;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  const start = Math.PI * (5 / 6);
  const span = Math.PI * (4 / 3);
  const bands = [PALETTE.mint, PALETTE.gold, '#ff3fa4', '#ff3d2e'];
  bands.forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = 26;
    g.beginPath();
    g.arc(128, 128, 92, start + (span * i) / 4, start + (span * (i + 1)) / 4);
    g.stroke();
  });
  g.strokeStyle = INK;
  g.lineWidth = 5;
  for (let i = 0; i <= 10; i++) {
    const a = start + (span * i) / 10;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70);
    g.lineTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
    g.stroke();
  }
  chunkyText(g, 'PSI', 128, 196, 34, PALETTE.cherry);
}

/** Needle angle (radians, about +z) for pressure 0..100, matching the dial's 240 degree arc. */
export function gaugeAngle(pressure: number): number {
  // Canvas angles run clockwise with y down; the mesh's +z rotation runs counter-clockwise with y up.
  const start = Math.PI * (5 / 6);
  const a = start + (Math.PI * (4 / 3) * Math.max(0, Math.min(100, pressure))) / 100;
  return -a - Math.PI / 2;
}

/**
 * Repaints the counter plate. `bounce[i]` (0..1) lifts and enlarges digit i: a digit that just ticked jumps and
 * wobbles back down.
 */
export function paintCounter(g: CanvasRenderingContext2D, points: number, coins: number, hotLabel: string, bounce: readonly number[] = []): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  roundRect(g, 10, 10, w - 20, h - 20, 60);
  g.fillStyle = PALETTE.plum;
  g.fill();
  g.lineWidth = 16;
  g.strokeStyle = INK;
  g.stroke();
  // Flip-digit style points.
  const digits = String(Math.min(points, 99_999_999)).padStart(8, '0');
  const cell = 92;
  const x0 = w / 2 - (digits.length * cell) / 2;
  for (let i = 0; i < digits.length; i++) {
    roundRect(g, x0 + i * cell + 6, 40, cell - 12, 150, 16);
    g.fillStyle = PALETTE.cream;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x0 + i * cell + 6, 114, cell - 12, 3);
    const b = bounce[i] ?? 0;
    chunkyText(g, digits[i]!, x0 + i * cell + cell / 2, 118 - 26 * b, 110 * (1 + 0.28 * b), b > 0.3 ? '#ff5a1f' : PALETTE.cherry);
  }
  chunkyText(g, `COINS ${coins}`, 60, 280, 76, PALETTE.gold, 'left');
  chunkyText(g, hotLabel, w - 60, 280, 64, '#ffb27a', 'right');
}
