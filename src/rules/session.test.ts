import { describe, expect, it } from 'vitest';
import { RUN } from '../config';
import { Rng } from '../rng';
import { PhysicsWorld } from '../sim/physics';
import { Economy } from './economy';
import { Pressure } from './pressure';
import { Run } from './run';

/**
 * The "play again" contract (the user: continue/restart must visibly start fresh): a finished run followed by a new
 * machine gives a fresh pile, a new structure build, a full stock, zero score and zero pressure. This mirrors what
 * Game.newMachine() rebuilds; the Electron smoke check drives the same flow through the real button.
 */
describe('a restarted run starts fresh', () => {
  it('rebuilds the machine and every rule', async () => {
    const rng = new Rng(5);
    let world = await PhysicsWorld.create(rng);
    let economy = new Economy(rng);
    let pressure = new Pressure();
    let run = new Run();
    run.start(0);
    // Play: spend stock, score, build pressure, then end the run.
    for (let i = 0; i < 20; i++) {
      run.drop();
      world.drop(0, economy.tag(1), 'standard');
      for (let s = 0; s < 15; s++) world.step();
    }
    economy.frontExit(null);
    pressure.machine(60);
    run.callLast();
    run.stock = 0;
    run.tick(1, 0, true, economy.points);
    run.tick(1 + RUN.sweepMaxSeconds, 0, true, economy.points);
    expect(run.phase).toBe('over');
    expect(economy.points).toBeGreaterThan(0);
    expect(pressure.value).toBeGreaterThan(0);
    const playedCoins = world.coins.length;

    // Play again.
    const fresh = await PhysicsWorld.create(rng);
    world.dispose();
    world = fresh;
    economy = new Economy(rng);
    pressure = new Pressure();
    run = new Run();
    run.start(100);

    expect(run.phase).toBe('playing');
    expect(run.stock).toBe(RUN.startStock);
    expect(economy.points).toBe(0);
    expect(pressure.value).toBe(0);
    expect(world.coins.filter((c) => c.kind === 'build').length).toBeGreaterThan(20);
    expect(world.coins.some((c) => c.tag)).toBe(false);
    expect(world.coins.length).not.toBe(playedCoins);
    world.dispose();
  });
});
