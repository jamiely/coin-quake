import { describe, expect, it } from 'vitest';
import { DROPPER, MAX_COINS, RULES, SIM, TRAY, COIN } from '../config';
import { Rng } from '../rng';
import { PhysicsWorld, type SimEvent } from './physics';

const run = (world: PhysicsWorld, seconds: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * SIM.hz; i++) events.push(...world.step());
  return events;
};

describe('PhysicsWorld', () => {
  it('boots with a settled pile that does not spill before play', async () => {
    const world = await PhysicsWorld.create(new Rng(3));
    expect(world.coins.length).toBe(RULES.startPile);
    const spilled = run(world, 3).filter((e) => e.type !== 'landed');
    expect(spilled.length).toBeLessThan(RULES.startPile * 0.05);
    world.dispose();
  });

  it('pushes dropped coins off the front edge and keeps their tag', async () => {
    const world = await PhysicsWorld.create(new Rng(5));
    const events: SimEvent[] = [];
    for (let i = 0; i < 80; i++) {
      world.drop(((i % 7) - 3) * 4, { hot: true });
      events.push(...run(world, 0.25));
    }
    events.push(...run(world, 20));
    const landed = events.filter((e) => e.type === 'landed');
    const front = events.filter((e) => e.type === 'frontExit');
    expect(landed.length).toBe(80);
    expect(front.length).toBeGreaterThan(20);

    // A tagged coin nudged over the edge reports its tag.
    const tagged = world.coins.find((c) => c.tag?.hot)!;
    tagged.body.setTranslation({ x: 0, y: 3, z: TRAY.front + COIN.radius + 1 }, true);
    tagged.body.setLinvel({ x: 0, y: 0, z: 30 }, true);
    const after = run(world, 1);
    expect(after).toContainEqual(expect.objectContaining({ type: 'frontExit', tag: { hot: true } }));
    world.dispose();
  });

  it('refuses drops at the body cap', async () => {
    const world = await PhysicsWorld.create(new Rng(1));
    while (world.coins.length < MAX_COINS) world.drop(0, null);
    expect(world.drop(DROPPER.halfSwing, null)).toBe(false);
    world.dispose();
  });
});
