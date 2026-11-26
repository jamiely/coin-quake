import { it } from 'vitest';
import { Rng } from '../src/rng';
import { PhysicsWorld } from '../src/sim/physics';
it('boot time', async () => {
  for (const seed of [1, 2, 3, 4]) {
    const t0 = performance.now();
    const w = await PhysicsWorld.create(new Rng(seed));
    const t1 = performance.now();
    let n = 0; for (let i = 0; i < 60; i++) n += w.step().length;
    console.log('seed', seed, w.structure, 'boot', (t1 - t0).toFixed(0), 'ms', 'coins', w.coins.length, 'figs', w.figurines, 'step60', (performance.now() - t1).toFixed(0), 'ms');
    w.dispose();
  }
});
