// Probe: full runs on the real physics with the real Run rules, played by bots, to tune RUN and the refill rules.
// Bots: "holder" holds the button whenever it has coins (the jammer); "tapper" drops ~1.5 coins/s anywhere; "aimer"
// streams while the dropper is over the HOT gate and drops one coin a second elsewhere (skilled play).
// Run: npx vitest run -c probes/vitest.config.ts runs      (SEEDS=1,2,3 BOT=holder|tapper to narrow)
import { it } from 'vitest';
import { COIN_KINDS, DROPPER, RUN, SIM } from '../src/config';
import { Rng } from '../src/rng';
import { dropperX, gateAt } from '../src/rules/dropper';
import { Run } from '../src/rules/run';
import { Economy, refillFor } from '../src/rules/economy';
import { PhysicsWorld } from '../src/sim/physics';

const seeds = (process.env.SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
const bots = (process.env.BOT ?? 'holder,aimer').split(',');

it('runs probe', async () => {
  const rows: string[] = [];
  for (const bot of bots) {
    for (const seed of seeds) {
      const world = await PhysicsWorld.create(new Rng(seed));
      const run = new Run();
      const economy = new Economy(new Rng(seed + 100));
      run.start(0);
      let t = 0;
      let score = 0;
      let drops = 0;
      let refills = 0;
      let lastCallAt = -1;
      let brokeAt = -1;
      const interval = bot === 'holder' ? DROPPER.streamInterval : 0.66;
      let nextDrop = 0;
      let lastHotDrop = -1;
      let lastColdDrop = -1;
      while (run.phase !== 'over' && t < 600) {
        t += 1 / SIM.hz;
        run.deadlines(t);
        economy.tick(t);
        const gate = gateAt(dropperX(t));
        const overHot = gate === economy.hotGate;
        // The aimer keeps two clocks, so a cold tap never makes it miss a short HOT window: it streams the moment the
        // dropper enters the HOT gate, and taps once a second elsewhere.
        const due =
          bot === 'aimer'
            ? overHot
              ? t - lastHotDrop >= DROPPER.streamInterval
              : t - lastColdDrop >= 1
            : t >= nextDrop;
        if (due && run.drop()) {
          nextDrop = t + interval;
          if (overHot) lastHotDrop = t;
          else lastColdDrop = t;
          if (world.drop(dropperX(t), economy.tag(gate))) drops++;
          else run.refund();
        }
        for (const e of world.step()) {
          if (e.type === 'frontExit') {
            const hot = Boolean(e.tag?.hot);
            score += e.figurine ? 250 : 10 * COIN_KINDS[e.kind].value * (hot ? 2 : 1);
            const n = refillFor(e.kind, e.figurine, hot);
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
}, 10_800_000);
