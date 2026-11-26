// Probe: full runs on the real physics with the real Run rules, played by bots, to tune RUN and the refill rules.
// Bots: "holder" holds the button whenever it has coins (the jammer); "tapper" drops ~1.5 coins/s.
// Run: npx vitest run -c probes/vitest.config.ts runs      (SEEDS=1,2,3 BOT=holder|tapper to narrow)
import { it } from 'vitest';
import { COIN_KINDS, DROPPER, RUN, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX } from '../src/rules/dropper';
import { Run } from '../src/rules/run';
import { refillFor } from '../src/rules/economy';
import { PhysicsWorld } from '../src/sim/physics';

const seeds = (process.env.SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
const bots = (process.env.BOT ?? 'holder,tapper').split(',');

it('runs probe', async () => {
  const rows: string[] = [];
  for (const bot of bots) {
    for (const seed of seeds) {
      const world = await PhysicsWorld.create(new Rng(seed));
      const run = new Run();
      run.start(0);
      let t = 0;
      let score = 0;
      let drops = 0;
      let refills = 0;
      let lastCallAt = -1;
      let brokeAt = -1;
      const interval = bot === 'holder' ? DROPPER.streamInterval : 0.66;
      let nextDrop = 0;
      while (run.phase !== 'over' && t < 600) {
        t += 1 / SIM.hz;
        run.deadlines(t);
        if (t >= nextDrop && run.drop()) {
          nextDrop = t + interval;
          if (world.drop(dropperX(t), { hot: false })) drops++;
          else run.refund();
        }
        for (const e of world.step()) {
          if (e.type === 'frontExit') {
            score += e.figurine ? 250 : 10 * COIN_KINDS[e.kind].value;
            const n = refillFor(e.kind, e.figurine);
            refills += n;
            run.coinsOut(n);
          } else if (e.type === 'bonus') {
            run.bonus(RUN.bonusCoins);
            refills += RUN.bonusCoins;
          }
        }
        const falling = world.fallingCount;
        run.tick(t, falling, world.settled, score);
        for (const ev of run.drainEvents()) {
          if (ev === 'lastCall') lastCallAt = t;
          if (ev === 'suddenDeath' && brokeAt < 0) brokeAt = t;
          if (ev === 'sweep') world.pusherSpeed = RUN.sweepPusherSpeed;
        }
      }
      if (t >= 600) rows.push(`  stuck: phase ${run.phase} stock ${run.stock} coins ${world.coins.length} falling ${world.fallingCount} settled ${world.settled} full ${world.full}`);
      rows.push(
        `${bot.padEnd(6)} seed ${seed}: ${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')} ` +
          `score ${score} drops ${drops} refills ${refills} ${lastCallAt > 0 ? `lastCall@${lastCallAt.toFixed(0)}s` : `broke@${brokeAt.toFixed(0)}s`} stockLeft ${run.stock}`,
      );
      world.dispose();
    }
  }
  console.log(`RUN start ${RUN.startStock} lastCall ${RUN.lastCallSeconds}s bonus ${RUN.bonusCoins} stream ${DROPPER.streamInterval}s\n` + rows.join('\n'));
}, 3_600_000);
