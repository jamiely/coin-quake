import * as THREE from 'three';
import { DROPPER, GATES, PUSHER, TRAY } from '../config';
import { backWall, chunkyText, roundRect, signCanvas } from './textures';
import { INK, PALETTE, outlined, toon } from './toon';

/** Static and animated parts of the cabinet the stage needs to move or repaint. */
export interface Machine {
  pusher: THREE.Group;
  carriage: THREE.Group;
  claw: THREE.Mesh[];
  laser: THREE.Mesh;
  gates: { plate: THREE.Mesh; lamp: THREE.MeshToonMaterial; hot: THREE.Mesh }[];
  counter: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  edgeLights: THREE.InstancedMesh;
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

  // Tray floor, cream with a mint inlay; cabinet sides in cherry.
  scene.add(box(2 * hw, 2, TRAY.front - TRAY.back, cream, 0, -1, (TRAY.front + TRAY.back) / 2));
  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 4, TRAY.front - PUSHER.frontMax - 3), toon('#ffe2b0'));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, 0.02, (TRAY.front + PUSHER.frontMax) / 2);
  scene.add(inlay);
  const railFront = TRAY.front - TRAY.openCorner;
  const tallFront = PUSHER.frontMax + 2;
  for (const side of [-1, 1]) {
    scene.add(box(3, DROPPER.y + 10, tallFront - TRAY.back + 6, cherry, side * (hw + 1.5), (DROPPER.y + 10) / 2 - 4, (tallFront + TRAY.back) / 2 - 3));
    scene.add(box(1.6, 3.4, railFront - tallFront, toon(PALETTE.gold), side * (hw + 0.8), 1.7, (railFront + tallFront) / 2));
  }
  // Base under the tray front, with the chute trough and its LED edge.
  scene.add(box(2 * hw + 6, 6, 4, cherry, 0, -6, TRAY.front + 3));
  const edgeLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 24);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    m.makeTranslation(-hw + 1.5 + (i * (2 * hw - 3)) / 23, -3.2, TRAY.front + 5.1);
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
  scene.add(box(2 * hw, 1.2, 1, mint, 0, PUSHER.height + 6, DROPPER.z + 4.3));

  // Swing rail and the brass carriage with a two-finger claw.
  scene.add(box(2 * hw + 2, 1.4, 1.4, toon(PALETTE.goldDark), 0, DROPPER.y + 5, DROPPER.z));
  const carriage = new THREE.Group();
  carriage.add(box(5, 3, 3, toon(PALETTE.gold), 0, 3, 0));
  const bolt = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), toon(PALETTE.sky));
  bolt.position.set(0, 5.8, 0);
  outlined(bolt, 0.3);
  carriage.add(bolt);
  for (const eye of [-0.6, 0.6]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    e.position.set(eye, 6.1, 1.35);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: INK }));
    pupil.position.set(0, 0, 0.32);
    e.add(pupil);
    carriage.add(e);
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
  counterMesh.position.set(0, -16, TRAY.front + 6);
  counterMesh.rotation.x = -0.25;
  scene.add(counterMesh);

  return { pusher, carriage, claw, laser, gates, counter, edgeLights };
}

/** Repaints the counter plate. */
export function paintCounter(g: CanvasRenderingContext2D, points: number, coins: number, hotLabel: string): void {
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
    chunkyText(g, digits[i]!, x0 + i * cell + cell / 2, 118, 110, PALETTE.cherry);
  }
  chunkyText(g, `COINS ${coins}`, 60, 280, 76, PALETTE.gold, 'left');
  chunkyText(g, hotLabel, w - 60, 280, 64, '#ffb27a', 'right');
}
