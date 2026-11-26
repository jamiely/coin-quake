// Probe: pay-out pace under a held stream: first payout, payouts by 10/30/60 s, and own-coin travel time.
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';
it('first payout', async () => {
  const rows = [];
  for (const seed of [1, 2, 3, 5]) {
    const world = await PhysicsWorld.create(new Rng(seed));
    const born = new Map<object, number>(); const travel: number[] = [];
    let first = -1; const by = { 10: 0, 30: 0, 60: 0 };
    for (let i = 0; i < 60 * SIM.hz; i++) {
      const t = i / SIM.hz;
      if (i % Math.round(DROPPER.streamInterval * SIM.hz) === 0) { const tag = { hot: false }; if (world.drop(dropperX(t), tag, 'standard')) born.set(tag, t); }
      for (const e of world.step()) if (e.type === 'frontExit') {
        if (first < 0) first = t;
        for (const k of [10, 30, 60] as const) if (t < k) by[k]++;
        const b = e.tag && born.get(e.tag); if (b != null) travel.push(t - b);
      }
    }
    travel.sort((a, b) => a - b);
    rows.push(`seed ${seed} ${world.structure}: first ${first.toFixed(1)}s, by10 ${by[10]} by30 ${by[30]} by60 ${by[60]}, own coins out ${travel.length}, median travel ${travel[Math.floor(travel.length / 2)]?.toFixed(1) ?? '-'}s`);
    world.dispose();
  }
  console.log(rows.join('\n'));
}, 900000);
