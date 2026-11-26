// Probe (not part of `npm test`): a 60 s held stream across the swing, per seed. Reports front/side exits, the
// side-loss share, coins still stuck above the shelf, and the step cost.
// Run: npx vitest run -c probes/vitest.config.ts
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';

it('fairness probe', async () => {
  const rows: string[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const world = await PhysicsWorld.create(new Rng(seed));
    let front = 0;
    let side = 0;
    let landed = 0;
    let dropped = 0;
    let ms = 0;
    const steps = 60 * SIM.hz;
    for (let i = 0; i < steps; i++) {
      const t = i / SIM.hz;
      if (i % Math.round(DROPPER.streamInterval * SIM.hz) === 0 && world.drop(dropperX(t), { hot: false })) dropped++;
      const t0 = performance.now();
      for (const e of world.step()) {
        if (e.type === 'frontExit') front++;
        else if (e.type === 'sideExit') side++;
        else if (e.type === 'landed') landed++;
      }
      ms += performance.now() - t0;
    }
    const stuck = world.coins.filter((c) => c.body.translation().y > 9).length;
    rows.push(`seed ${seed}: dropped ${dropped} landed ${landed} front ${front} side ${side} sideShare ${((100 * side) / Math.max(1, front + side)).toFixed(1)}% stuckAbove ${stuck} avgStep ${(ms / steps).toFixed(2)}ms`);
    world.dispose();
  }
  console.log(rows.join('\n'));
}, 600_000);
