// Probe: each structure stands after boot, and its moat stays clear (pile coins inside the padded footprint).
import { it } from 'vitest';
import { SIM, TRAY } from '../src/config';
import { Rng } from '../src/rng';
import { PhysicsWorld } from '../src/sim/physics';
it('builds', async () => {
  for (const seed of [21, 3, 4, 7, 9, 12]) {
    const w = await PhysicsWorld.create(new Rng(seed));
    const stat = () => {
      const b = w.coins.filter((c) => c.kind === 'build');
      const ys = b.map((c) => c.body.translation().y);
      const box = w.buildBox!;
      const intruders = w.coins.filter((c) => { if (c.kind === 'build') return false; const p = c.body.translation(); return p.y < TRAY.y + 3 && Math.abs(p.x) < box.halfX && Math.abs(p.z - box.cz) < box.halfZ; }).length;
      return `n ${b.length} below ${ys.filter((y) => y < TRAY.y - 1).length} top ${(Math.max(...ys) - TRAY.y).toFixed(1)}cm intruders ${intruders}`;
    };
    const a = stat();
    for (let i = 0; i < 4 * SIM.hz; i++) w.step();
    console.log(`seed ${seed} ${w.structure}: boot ${a} | idle 4s ${stat()} | coins ${w.coins.length}`);
    w.dispose();
  }
}, 600000);
