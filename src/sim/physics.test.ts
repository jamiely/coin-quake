import { describe, expect, it } from 'vitest';
import { DROPPER, MAX_COINS, SIM, TRAY, COIN } from '../config';
import { Rng } from '../rng';
import { dropperX } from '../rules/dropper';
import { PhysicsWorld, firstEdge, type SimEvent } from './physics';

const run = (world: PhysicsWorld, seconds: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * SIM.hz; i++) events.push(...world.step());
  return events;
};

describe('PhysicsWorld', () => {
  it('boots with a settled pile that does not spill before play', async () => {
    const world = await PhysicsWorld.create(new Rng(3));
    // A few strokes settle the overhang at boot (the overfilled lower floors spill) and the structure clears its
    // footprint; the machine still boots well stocked.
    expect(world.coins.length).toBeGreaterThan(110);
    const spilled = run(world, 3).filter((e) => e.type === 'frontExit' || e.type === 'sideExit');
    expect(spilled.length).toBeLessThan(world.coins.length * 0.05);
    world.dispose();
  });

  it('pushes dropped coins off the front edge and keeps their tag', async () => {
    const world = await PhysicsWorld.create(new Rng(5));
    const events: SimEvent[] = [];
    // A held stream across the swing for 60 s: the deep three-tier tray takes about a minute to start paying steadily.
    for (let i = 0; i < 240; i++) {
      world.drop(dropperX(i * DROPPER.streamInterval), { hot: true }, 'standard');
      events.push(...run(world, DROPPER.streamInterval));
    }
    events.push(...run(world, 5));
    const landed = events.filter((e) => e.type === 'landed');
    const front = events.filter((e) => e.type === 'frontExit');
    expect(landed.length).toBeGreaterThan(220);
    expect(front.length).toBeGreaterThan(30);

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

  it('a full machine retires a resting back coin so drops always go in, and never exceeds the cap', async () => {
    // The jam bug that happened: at the cap drops were refused and refunded, so a run after Last Call never drained.
    const world = await PhysicsWorld.create(new Rng(1));
    while (world.coins.length < MAX_COINS) world.drop(0, null);
    run(world, 2);
    expect(world.drop(DROPPER.halfSwing, null)).not.toBeNull();
    expect(world.coins.length).toBeLessThanOrEqual(MAX_COINS);
    world.dispose();
  });
});
