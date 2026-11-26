// Probe: which source of coins falls off the sides, per seed (dump coins vs the rest), and the structure.
// Run: npx vitest run -c probes/vitest.config.ts sides
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';

it('sides probe', async () => {
  for (const seed of [2, 4]) {
    const world = await PhysicsWorld.create(new Rng(seed));
    let side = 0;
    let front = 0;
    let dumpAt = -1;
    const sideTimes: number[] = [];
    for (let i = 0; i < 60 * SIM.hz; i++) {
      const t = i / SIM.hz;
      if (i % Math.round(DROPPER.streamInterval * SIM.hz) === 0) world.drop(dropperX(t), { hot: false });
      for (const e of world.step()) {
        if (e.type === 'dump') dumpAt = t;
        if (e.type === 'sideExit') {
          side++;
          sideTimes.push(+t.toFixed(1));
        }
        if (e.type === 'frontExit') front++;
      }
    }
    const afterDump = dumpAt < 0 ? 0 : sideTimes.filter((s) => s >= dumpAt && s < dumpAt + 6).length;
    console.log(`seed ${seed} structure ${world.structure} dumpAt ${dumpAt.toFixed(1)} side ${side} front ${front} sideWithin6sOfDump ${afterDump} times ${sideTimes.join(',')}`);
    world.dispose();
  }
}, 600_000);
