import { describe, expect, it } from 'vitest';
import { RULES } from '../config';
import { Rng } from '../rng';
import { Economy } from './economy';

describe('Economy', () => {
  it('spends a coin per drop and refuses with an empty bank', () => {
    const e = new Economy(new Rng(1));
    e.coins = 1;
    expect(e.tryDrop(0)).not.toBeNull();
    expect(e.coins).toBe(0);
    expect(e.tryDrop(0)).toBeNull();
  });

  it('tags coins dropped through the HOT gate and pays them double', () => {
    const e = new Economy(new Rng(1));
    const hot = e.tryDrop(e.hotGate);
    const cold = e.tryDrop(((e.hotGate + 1) % 3) as 0 | 1 | 2);
    expect(hot).toEqual({ hot: true });
    expect(cold).toEqual({ hot: false });
    expect(e.frontExit(hot)).toBe(RULES.pointsPerCoin * RULES.hotMultiplier);
    expect(e.frontExit(cold)).toBe(RULES.pointsPerCoin);
    // Coins from the starting pile have no tag and pay the base rate.
    expect(e.frontExit(null)).toBe(RULES.pointsPerCoin);
    expect(e.points).toBe(RULES.pointsPerCoin * (RULES.hotMultiplier + 2));
  });

  it('drops for free in fever and applies the fever multiplier', () => {
    const e = new Economy(new Rng(1));
    e.coins = 0;
    expect(e.tryDrop(0, true)).not.toBeNull();
    expect(e.coins).toBe(0);
    expect(e.frontExit({ hot: false }, 3)).toBe(RULES.pointsPerCoin * 3);
  });

  it('returns a coin to the bank for every front exit', () => {
    const e = new Economy(new Rng(1));
    const before = e.coins;
    e.frontExit(null);
    expect(e.coins).toBe(before + 1);
  });

  it('adds one credit batch per press', () => {
    const e = new Economy(new Rng(1));
    const before = e.coins;
    e.addCredits();
    expect(e.coins).toBe(before + RULES.creditCoins);
  });

  it('moves the HOT tag to a different gate every 20 to 30 seconds', () => {
    const e = new Economy(new Rng(7));
    const moves: number[] = [];
    let gate = e.hotGate;
    for (let t = 0; t <= 300; t += 0.5) {
      for (const ev of e.tick(t)) {
        if (ev.type !== 'hotMoved') continue;
        expect(ev.gate).not.toBe(gate);
        gate = ev.gate;
        moves.push(t);
      }
    }
    const gaps = moves.slice(1).map((t, i) => t - moves[i]!);
    expect(moves[0]).toBeGreaterThanOrEqual(RULES.hotMinHold);
    expect(moves[0]).toBeLessThanOrEqual(RULES.hotMaxHold + 0.5);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(RULES.hotMinHold);
      expect(gap).toBeLessThanOrEqual(RULES.hotMaxHold + 0.5);
    }
  });

  it('refills an empty bank after a wait in free play', () => {
    const e = new Economy(new Rng(1));
    e.coins = 0;
    expect(e.tick(100).filter((x) => x.type === 'refill')).toEqual([]);
    expect(e.tick(100 + RULES.freePlayRefillAfter - 0.1).filter((x) => x.type === 'refill')).toEqual([]);
    expect(e.tick(100 + RULES.freePlayRefillAfter)).toContainEqual({ type: 'refill', coins: RULES.creditCoins });
    expect(e.coins).toBe(RULES.creditCoins);
  });
});
