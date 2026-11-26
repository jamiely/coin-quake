// Probe: each structure stands after boot (no coins below the floor, most still standing after 4 s idle), and its height.
import { it } from 'vitest';
import { SIM } from '../src/config';
import { Rng } from '../src/rng';
import { PhysicsWorld } from '../src/sim/physics';
it('builds', async () => {
  for (const seed of [21, 3, 4, 7, 9, 12]) {
    const w = await PhysicsWorld.create(new Rng(seed));
    const stat = () => { const b = w.coins.filter((c) => c.kind === 'build'); const ys = b.map((c) => c.body.translation().y); return `n ${b.length} below ${ys.filter((y) => y < -4).length} top ${Math.max(...ys).toFixed(1)}`; };
    const a = stat();
    for (let i = 0; i < 4 * SIM.hz; i++) w.step();
    console.log(`seed ${seed} ${w.structure}: boot ${a} | idle 4s ${stat()}`);
    w.dispose();
  }
}, 600000);
