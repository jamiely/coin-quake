import * as THREE from 'three';
import { WORKS } from '../config';
import { Works } from '../sim/works';
import { chunkyText, roundRect, signCanvas } from './textures';
import { INK, PALETTE, outlined, toon } from './toon';

/**
 * Cartoon models of the Works (GAME_DESIGN.md §3.2), animated from the simulation: the gear spins and bulges when it
 * flings, pegs flash and wobble when pinged, flippers swing, the loop tube glows with the coins inside it, Tesla coils
 * crackle with lightning, and the bonus slot's lights burst. Nothing is ever fully still: idle parts breathe.
 */
export class WorksView {
  readonly group = new THREE.Group();
  private readonly gear: THREE.Group;
  private readonly pegs: THREE.InstancedMesh;
  private readonly pegCaps: THREE.InstancedMesh;
  private readonly flippers: THREE.Group[] = [];
  private readonly loopTube: THREE.Mesh;
  private readonly loopGlow: THREE.MeshBasicMaterial;
  private readonly coils: { top: THREE.Mesh; mat: THREE.MeshToonMaterial; bolt: THREE.Line; boltGeo: THREE.BufferGeometry }[] = [];
  private readonly bonusLamps: THREE.MeshBasicMaterial[] = [];
  private readonly bonusSign: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene, pegCount: number) {
    const z = WORKS.z;
    const front = z + WORKS.halfDepth;
    scene.add(this.group);

    // Gear wheel: a fat brass gear (teeth on the rim), a hub cap with a rivet, and paddles matching the colliders.
    const g = WORKS.gear;
    this.gear = new THREE.Group();
    this.gear.position.set(g.x, g.y, z);
    const brass = toon(PALETTE.gold);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(g.hub + 0.4, g.hub + 0.4, 2 * WORKS.halfDepth - 0.6, 24), toon(PALETTE.goldDark));
    disc.rotation.x = Math.PI / 2;
    outlined(disc, 0.22);
    this.gear.add(disc);
    for (let i = 0; i < g.paddles; i++) {
      const a = (i / g.paddles) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(g.reach - g.hub + 0.4, 0.9, 2 * WORKS.halfDepth - 1), brass);
      const r = (g.hub + g.reach) / 2;
      paddle.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      paddle.rotation.z = a;
      outlined(paddle, 0.2);
      this.gear.add(paddle);
    }
    const cap = new THREE.Mesh(new THREE.CircleGeometry(g.hub * 0.6, 20), toon(PALETTE.cherry));
    cap.position.z = WORKS.halfDepth;
    this.gear.add(cap);
    this.group.add(this.gear);

    // Pegs: brass pins in one instanced draw, with round cherry caps on the front that flash when hit.
    const pinGeo = new THREE.CylinderGeometry(WORKS.pegs.radius, WORKS.pegs.radius, 2 * WORKS.halfDepth, 12);
    pinGeo.rotateX(Math.PI / 2);
    this.pegs = new THREE.InstancedMesh(pinGeo, toon('#d9a441'), pegCount);
    const capGeo = new THREE.CircleGeometry(WORKS.pegs.radius * 1.5, 16);
    this.pegCaps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), pegCount);
    this.pegCaps.setColorAt(0, this.c.set(PALETTE.cherry));
    for (const mesh of [this.pegs, this.pegCaps]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    // Flippers: chunky cherry paddles with a gold hinge cap, pivoting at the walls.
    const f = WORKS.flippers;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * f.x, f.y, z);
      const bat = new THREE.Mesh(new THREE.BoxGeometry(f.length, 1, 2 * WORKS.halfDepth - 0.4), toon(PALETTE.cherry));
      bat.position.x = (-side * f.length) / 2;
      outlined(bat, 0.22);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2 * WORKS.halfDepth, 16), toon(PALETTE.gold));
      hinge.rotation.x = Math.PI / 2;
      outlined(hinge, 0.2);
      pivot.add(bat, hinge);
      this.flippers.push(pivot);
      this.group.add(pivot);
    }

    // Pipe loop: a fat translucent mint tube following the loop path, with a funnel at its mouth.
    const l = WORKS.loop;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const p = Works.loopPoint(i / 48);
      pts.push(new THREE.Vector3(p.x, p.y, front - 0.3));
    }
    pts.unshift(new THREE.Vector3(l.x, l.entryY + 1.5, front - 0.3));
    pts.push(new THREE.Vector3(l.exit.x, l.exit.y, front - 0.3));
    const curve = new THREE.CatmullRomCurve3(pts);
    this.loopGlow = new THREE.MeshBasicMaterial({ color: PALETTE.mint, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    this.loopTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 1.35, 12, false), this.loopGlow);
    const rim = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 1.5, 12, false), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    this.group.add(rim, this.loopTube);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.4, 1.4, 16, 1, true), toon(PALETTE.mint));
    funnel.position.set(l.x, l.entryY + 1.6, front - 0.3);
    outlined(funnel, 0.2);
    this.group.add(funnel);

    // Tesla coils: copper coil bodies with glowing caps, and a jagged lightning line each.
    const t = WORKS.tesla;
    for (const side of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 4.5, 12), toon('#c4672f'));
      coil.position.set(side * t.x, t.y - 2.6, front - 1);
      outlined(coil, 0.2);
      const mat = toon('#bff4ff', { emissive: '#7fe6ff', emissiveIntensity: 0.4 });
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), mat);
      top.position.set(side * t.x, t.y, front - 1);
      outlined(top, 0.2);
      const boltGeo = new THREE.BufferGeometry();
      boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
      const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: '#e8fbff', transparent: true, toneMapped: false }));
      bolt.frustumCulled = false;
      this.group.add(coil, top, bolt);
      this.coils.push({ top, mat, bolt, boltGeo });
    }

    // Bonus slot: gold posts with chaser lamps and a "BONUS" plate.
    const b = WORKS.bonus;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 2 * WORKS.halfDepth), toon(PALETTE.gold));
      post.position.set(b.x + side * (b.halfWidth + 0.35), b.y, z);
      outlined(post, 0.18);
      this.group.add(post);
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, toneMapped: false });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat);
        lamp.position.set(b.x + side * (b.halfWidth + 0.35), b.y - 0.8 + i * 0.8, front + 0.1);
        this.bonusLamps.push(mat);
        this.group.add(lamp);
      }
    }
    const sign = signCanvas(256, 96);
    roundRect(sign.ctx, 6, 6, 244, 84, 24);
    sign.ctx.fillStyle = PALETTE.plum;
    sign.ctx.fill();
    sign.ctx.lineWidth = 8;
    sign.ctx.strokeStyle = INK;
    sign.ctx.stroke();
    chunkyText(sign.ctx, 'BONUS', 128, 50, 56, PALETTE.gold);
    this.bonusSign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.72), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    this.bonusSign.position.set(b.x, b.y - 2.3, front + 0.2);
    this.group.add(this.bonusSign);
  }

  update(works: Works, t: number): void {
    const z = WORKS.z;
    const front = z + WORKS.halfDepth;
    // Gear: spins with the sim; bulges and wobbles for a moment after a fling.
    this.gear.rotation.z = works.gearAngle;
    const gb = Math.exp(-works.gearHit * 10);
    this.gear.scale.setScalar(1 + 0.12 * gb * Math.cos(works.gearHit * 40));

    // Pegs: a hit flashes the cap white and wobbles the pin; idle pins shimmer gently in a wave.
    works.pegs.forEach((peg, i) => {
      const h = works.pegHit[i]!;
      const pop = Math.exp(-h * 9);
      const wobble = 1 + 0.45 * pop * Math.cos(h * 45);
      this.m.compose(this.p.set(peg.x, peg.y, z), this.q.identity(), this.s.set(wobble, wobble, 1));
      this.pegs.setMatrixAt(i, this.m);
      this.m.compose(this.p.set(peg.x, peg.y, front + 0.05), this.q.identity(), this.s.setScalar(wobble * (1 + 0.5 * pop)));
      this.pegCaps.setMatrixAt(i, this.m);
      const idle = 0.5 + 0.5 * Math.sin(t * 3 + peg.x * 0.4 + peg.y * 0.6);
      this.pegCaps.setColorAt(i, this.c.set(PALETTE.cherry).lerp(new THREE.Color('#ffb0bb'), idle * 0.35).lerp(new THREE.Color('#ffffff'), pop));
    });
    this.pegs.instanceMatrix.needsUpdate = this.pegCaps.instanceMatrix.needsUpdate = true;
    this.pegCaps.instanceColor!.needsUpdate = true;

    // Flippers follow the sim's angle, with a squash on the swing.
    this.flippers.forEach((pivot, i) => {
      const side = i ? 1 : -1;
      pivot.rotation.z = -side * works.flipperAngle[i]!;
      const kick = Math.exp(-works.flipperHit[i]! * 12);
      pivot.scale.set(1 + 0.12 * kick, 1 - 0.15 * kick, 1);
    });

    // Loop: glows brighter while coins ride it, pulsing along.
    const busy = works.riders.length > 0 || works.loopHit < 0.3;
    this.loopGlow.opacity = busy ? 0.55 + 0.2 * Math.sin(t * 30) : 0.3 + 0.05 * Math.sin(t * 2);
    this.loopGlow.color.set(busy ? '#c9fff0' : PALETTE.mint);

    // Tesla coils: caps pulse; a fresh zap draws a jagged bolt toward the zapped side for a moment.
    this.coils.forEach((coil, i) => {
      const h = works.teslaHit[i]!;
      const lit = Math.exp(-h * 7);
      coil.mat.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 9 + i) + 1.6 * lit;
      coil.top.scale.setScalar(1 + 0.25 * lit);
      const show = h < 0.16;
      coil.bolt.visible = show;
      if (show) {
        const side = i ? 1 : -1;
        const pos = coil.boltGeo.getAttribute('position') as THREE.BufferAttribute;
        const sx = side * WORKS.tesla.x;
        const ex = sx - side * WORKS.tesla.range;
        for (let k = 0; k < 9; k++) {
          const u = k / 8;
          const jitter = k === 0 || k === 8 ? 0 : (Math.random() - 0.5) * 2.4;
          pos.setXYZ(k, sx + (ex - sx) * u, WORKS.tesla.y + jitter - u * 1.5, front + 0.4);
        }
        pos.needsUpdate = true;
        (coil.bolt.material as THREE.LineBasicMaterial).opacity = 1 - h / 0.16;
      }
    });

    // Bonus lamps chase; on a hit they flash wildly and the sign jumps.
    const bh = works.bonusHit;
    const burst = bh < 1.2;
    this.bonusLamps.forEach((mat, i) => {
      const on = burst ? Math.floor(t * 20 + i) % 2 === 0 : (Math.floor(t * 4) + i) % 3 === 0;
      mat.color.set(on ? (burst ? '#ffffff' : '#fff36b') : PALETTE.goldDark);
    });
    const jump = Math.exp(-bh * 6);
    this.bonusSign.scale.setScalar(1 + 0.35 * jump * Math.abs(Math.cos(bh * 25)));
  }
}
