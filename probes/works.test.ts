// Probe: drop coins at the left, centre and right of the swing and count which machines they meet, how long they
// take to reach the shelf, and whether any get stuck in the Works. Run: npx vitest run -c probes/vitest.config.ts works
import { it } from 'vitest';
import { DROPPER, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { PhysicsWorld, type SimEvent } from '../src/sim/physics';

it('works probe', async () => {
  const world = await PhysicsWorld.create(new Rng(9));
  const xs = [-DROPPER.halfSwing, -9, -4, 0, 4, 9, DROPPER.halfSwing];
  const tally: Record<string, number> = {};
  const routes: string[] = [];
  for (const x of xs) {
    for (let n = 0; n < 6; n++) {
      world.drop(x + (n - 2.5) * 0.7, null);
      const body = world.coins.at(-1)!.body;
      const seen = new Set<string>();
      let landedAt = -1;
      // Track this coin's landing by watching it reach the shelf (the landed event fires for any coin).
      for (let i = 0; i < 6 * SIM.hz && landedAt < 0; i++) {
        const ev: SimEvent[] = world.step();
        for (const e of ev) {
          if (e.type === 'landed' || e.type === 'frontExit' || e.type === 'sideExit') continue;
          tally[e.type] = (tally[e.type] ?? 0) + 1;
          seen.add(e.type);
        }
        if (body.translation().y < 6.5 && !world.works.riding(body)) landedAt = i / SIM.hz;
      }
      const p = body.translation();
      routes.push(`x=${x.toFixed(1)} meets=[${[...seen].join(',')}] landed=${landedAt < 0 ? 'NO' : landedAt.toFixed(2) + 's'} at y=${p.y.toFixed(1)}`);
    }
  }
  const stuck = world.coins.filter((c) => c.body.translation().y > 6).length;
  console.log(routes.join('\n'));
  console.log('tally', JSON.stringify(tally), 'stuckAboveShelf', stuck);
});
