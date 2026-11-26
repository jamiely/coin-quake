// Probe: the three-tier machine at boot and under a held stream: where coins sit, travel time, first payout, exits.
import { it } from 'vitest';
import { DECK, DROPPER, PUSHER, SIM, TRAY } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';
it('geometry', async () => {
  for (const seed of [1, 2]) {
    const w = await PhysicsWorld.create(new Rng(seed));
    const where = () => { const b = { shelf: 0, deck: 0, tray: 0, air: 0 }; for (const c of w.coins) { const p = c.body.translation(); if (p.y > PUSHER.height + 3) b.air++; else if (p.y > PUSHER.height - 0.5 && p.z < PUSHER.frontMax) b.shelf++; else if (p.y > DECK.y - 0.6) b.deck++; else b.tray++; } return JSON.stringify(b); };
    console.log(`seed ${seed} ${w.structure} boot coins ${w.coins.length} ${where()}`);
    const born = new Map<object, number>(); const travel: number[] = [];
    let first = -1, front = 0, side = 0, ms = 0;
    for (let i = 0; i < 75 * SIM.hz; i++) {
      const t = i / SIM.hz;
      if (i < 60 * SIM.hz && i % Math.round(DROPPER.streamInterval * SIM.hz) === 0) { const tag = { hot: false }; if (w.drop(dropperX(t), tag, 'standard')) born.set(tag, t); }
      const t0 = performance.now();
      for (const e of w.step()) {
        if (e.type === 'frontExit') { front++; if (first < 0) first = t; const b = e.tag && born.get(e.tag); if (b !== undefined && b !== null) travel.push(t - b); }
        if (e.type === 'sideExit') side++;
      }
      ms += performance.now() - t0;
      if (i === 30 * SIM.hz) console.log(`  t=30 ${where()} front ${front} side ${side}`);
    }
    travel.sort((a, b) => a - b);
    console.log(`  t=75 ${where()} front ${front} side ${side} sideShare ${(100 * side / Math.max(1, front + side)).toFixed(1)}% first ${first.toFixed(1)}s own-out ${travel.length} median ${travel[Math.floor(travel.length / 2)]?.toFixed(1)}s avgStep ${(ms / (75 * SIM.hz)).toFixed(2)}ms coins ${w.coins.length}`);
    w.dispose();
  }
}, 900000);
