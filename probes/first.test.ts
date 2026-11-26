// Probe: seconds from the first drop to the first front payout of any coin (what the player feels as "instant").
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';
it('first payout', async () => {
  const rows = [];
  for (const seed of [1, 2, 3, 4]) {
    const world = await PhysicsWorld.create(new Rng(seed));
    let first = -1; let in10 = 0;
    for (let i = 0; i < 30 * SIM.hz; i++) {
      const t = i / SIM.hz;
      if (i % Math.round(DROPPER.streamInterval * SIM.hz) === 0) world.drop(dropperX(t), { hot: false }, 'standard');
      for (const e of world.step()) if (e.type === 'frontExit') { if (first < 0) first = t; if (t < 10) in10++; }
    }
    rows.push(`seed ${seed}: first payout ${first.toFixed(1)}s, payouts in first 10s ${in10}, coins ${world.coins.length}`);
    world.dispose();
  }
  console.log(rows.join('\n'));
}, 600000);
