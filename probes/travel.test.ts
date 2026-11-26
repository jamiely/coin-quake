// Probe: how long a dropped coin takes to reach the front edge (its own exit, tracked by tag), and the step cost.
// Run: npx vitest run -c probes/vitest.config.ts travel
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { PhysicsWorld } from '../src/sim/physics';

it('travel probe', async () => {
  for (const seed of [1, 2, 3]) {
    const world = await PhysicsWorld.create(new Rng(seed));
    const born = new Map<object, number>();
    const travel: number[] = [];
    let ms = 0;
    let steps = 0;
    let front = 0;
    for (let i = 0; i < 90 * SIM.hz; i++) {
      const t = i / SIM.hz;
      if (i < 60 * SIM.hz && i % Math.round(DROPPER.streamInterval * SIM.hz) === 0) {
        const tag = { hot: false };
        if (world.drop(dropperX(t), tag, 'standard')) born.set(tag, t);
      }
      const t0 = performance.now();
      for (const e of world.step()) {
        if (e.type !== 'frontExit') continue;
        front++;
        const b = e.tag && born.get(e.tag);
        if (b !== undefined && b !== null) travel.push(t - b);
      }
      ms += performance.now() - t0;
      steps++;
    }
    travel.sort((a, b) => a - b);
    const q = (p: number) => travel[Math.floor(p * (travel.length - 1))]?.toFixed(1);
    console.log(`seed ${seed}: own coins out ${travel.length}/240, front ${front}, travel p10 ${q(0.1)}s median ${q(0.5)}s p90 ${q(0.9)}s, avgStep ${(ms / steps).toFixed(2)}ms, coins ${world.coins.length}`);
    world.dispose();
  }
}, 900_000);
