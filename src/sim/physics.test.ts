import { describe, expect, it } from 'vitest';
import { DROPPER, MAX_COINS, RULES, SIM, TRAY, COIN } from '../config';
import { Rng } from '../rng';
import { PhysicsWorld, firstEdge, type SimEvent } from './physics';

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

  it('counts a coin that falls off a side as lost, even when it is moving forward', async () => {
    const world = await PhysicsWorld.create(new Rng(2));
    world.drop(0, { hot: true });
    const coin = world.coins.at(-1)!;
    coin.body.setTranslation({ x: TRAY.halfWidth + 2, y: 0.35, z: TRAY.front - 8 }, true);
    coin.body.setLinvel({ x: 0, y: 0, z: 60 }, true);
    const events = run(world, 1.5).filter((e) => e.type !== 'landed');
    expect(events).toContainEqual(expect.objectContaining({ type: 'sideExit' }));
    expect(events.filter((e) => e.type === 'frontExit' && e.tag?.hot)).toEqual([]);
    world.dispose();
  });

  it('pays a coin that leaves the front at a corner and then drifts past the side', async () => {
    const world = await PhysicsWorld.create(new Rng(2));
    world.drop(0, { hot: true });
    const coin = world.coins.at(-1)!;
    coin.body.setTranslation({ x: TRAY.halfWidth - 1, y: 1, z: TRAY.front + 0.5 }, true);
    coin.body.setLinvel({ x: 60, y: 0, z: 10 }, true);
    const events = run(world, 2).filter((e) => e.type !== 'landed');
    expect(events).toContainEqual(expect.objectContaining({ type: 'frontExit', tag: { hot: true } }));
    world.dispose();
  });

  it('orders two crossings in one step by which edge comes first', () => {
    const hw = TRAY.halfWidth;
    expect(firstEdge({ x: hw - 0.1, z: TRAY.front - 2 }, { x: hw + 2, z: TRAY.front + 0.1 })).toBe('side');
    expect(firstEdge({ x: hw - 2, z: TRAY.front - 0.1 }, { x: hw + 0.1, z: TRAY.front + 2 })).toBe('front');
    expect(firstEdge({ x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull();
    expect(firstEdge({ x: hw + 1, z: 0 }, { x: hw + 2, z: TRAY.front + 1 })).toBe('side');
    expect(firstEdge({ x: 0, z: TRAY.front + 1 }, { x: hw + 1, z: TRAY.front + 2 })).toBe('front');
  });

  it('refuses drops at the body cap', async () => {
    const world = await PhysicsWorld.create(new Rng(1));
    while (world.coins.length < MAX_COINS) world.drop(0, null);
    expect(world.drop(DROPPER.halfSwing, null)).toBe(false);
    world.dispose();
  });
});
