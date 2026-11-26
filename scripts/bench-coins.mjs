// Coin-pile physics benchmark: N cylinder coins on a pushed tray. Reports step cost, jitter and exits.
// Usage: node scripts/bench-coins.mjs [coins=350] [seconds=20] [hz=60] [substeps=2]
import RAPIER from '@dimforge/rapier3d-simd-compat';

const [N = 350, SECONDS = 20, HZ = 60, SUB = 2] = process.argv.slice(2).map(Number);
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -981, z: 0 });
world.lengthUnit = 100;
world.timestep = 1 / HZ / SUB;
world.numSolverIterations = Number(process.env.IT ?? 4);

const R = 1.5, HALF_T = 0.35; // chunky coin: 3 cm across, 0.7 cm thick
const OCT = new Float32Array([...Array(8)].flatMap((_, i) => { const a = (i * Math.PI) / 4; return [R * Math.cos(a), HALF_T, R * Math.sin(a), R * Math.cos(a), -HALF_T, R * Math.sin(a)]; }));
const HW = 20, FRONT = Number(process.env.FRONT ?? 18), BACK = -22;
const fixed = (hx, hy, hz, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.5));
fixed(HW, 1, (FRONT - BACK) / 2, 0, -1, (FRONT + BACK) / 2);
for (const s of [-1, 1]) fixed(0.5, 10, (FRONT - 4 - BACK) / 2, s * (HW + 0.5), 10, (FRONT - 4 + BACK) / 2);
const pusher = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, -16));
world.createCollider(RAPIER.ColliderDesc.cuboid(HW - 0.1, 2, 6).setFriction(0.4), pusher);
fixed(HW, 6, 0.3, 0, 4 + 0.4 + 6, -10 - 6.3); // scraper above pusher

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const coins = [];
const spawn = (x, y, z) => {
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.8)
    .setRotation({ x: 0, y: 0, z: 0, w: 1 }).setCcdEnabled(false)); if (process.env.LOCK) b.lockRotations(true, true);
  world.createCollider((process.env.SHAPE === "box" ? RAPIER.ColliderDesc.cuboid(R*0.9, HALF_T, R*0.9) : process.env.SHAPE === "hull" ? RAPIER.ColliderDesc.convexHull(OCT) : process.env.SHAPE === "cyl" ? RAPIER.ColliderDesc.cylinder(HALF_T, R) : process.env.SHAPE === "ball" ? RAPIER.ColliderDesc.ball(R) : RAPIER.ColliderDesc.roundCylinder(HALF_T - 0.15, R - 0.15, 0.15)).setDensity(7).setFriction(0.45).setRestitution(0.1), b);
  coins.push(b);
};
for (let i = 0; i < N; i++) spawn(rnd() * 2 * (HW - 3) - (HW - 3), 1 + Math.floor(i / 120) * 1.2 + rnd() * 0.3, -9 + rnd() * (FRONT - 4 + 9));

let t = 0, frames = 0, stepMs = 0, worst = 0, front = 0, side = 0, fell = 0;
const steps = SECONDS * HZ;
let sleeping = 0;
for (let f = 0; f < steps; f++) {
  const t0 = performance.now();
  for (let s = 0; s < SUB; s++) {
    t += world.timestep;
    const z = -16 + 5 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 2.4));
    pusher.setNextKinematicTranslation({ x: 0, y: 2, z });
    world.step();
  }
  // Feed a coin every 0.25 s like a held button.
  if (f % Math.round(HZ / 4) === 0 && coins.length < N) spawn(rnd() * 30 - 15, 12, -6 + rnd() * 6);
  for (let i = coins.length - 1; i >= 0; i--) {
    const p = coins[i].translation();
    if (p.y < -3) {
      if (p.z > FRONT - 0.5) front++; else side++;
      world.removeRigidBody(coins[i]); coins.splice(i, 1);
    } else if (p.y < -0.5) fell++;
  }
  const ms = performance.now() - t0;
  if (f > HZ) { stepMs += ms; worst = Math.max(worst, ms); frames++; }
  if (f === steps - 1) sleeping = coins.filter((c) => c.isSleeping()).length;
}
// Jitter: max speed among coins resting deep in the back of the pile at the end.
let jitter = 0;
for (const c of coins) { const p = c.translation(); if (p.z < 0 && p.y < 2) { const v = c.linvel(); jitter = Math.max(jitter, Math.hypot(v.x, v.y, v.z)); } }
console.log(JSON.stringify({ coins: coins.length, hz: HZ, substeps: SUB, avgFrameMs: +(stepMs / frames).toFixed(2), worstFrameMs: +worst.toFixed(2), frontExits: front, sideExits: side, sleeping, backPileMaxSpeedCmS: +jitter.toFixed(1) }));
