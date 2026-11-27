import { describe, expect, it } from 'vitest';
import { RULES } from '../config';
import { Rng } from '../rng';
import { Economy, refillFor } from './economy';

describe('Economy', () => {
  it('tags coins dropped through the HOT gate and pays them double', () => {
    const e = new Economy(new Rng(1));
    const hot = e.tag(e.hotGate);
    const cold = e.tag(((e.hotGate + 1) % 3) as 0 | 1 | 2);
    expect(hot).toEqual({ hot: true });
    expect(cold).toEqual({ hot: false });
    expect(e.frontExit(hot)).toBe(RULES.pointsPerCoin * RULES.hotMultiplier);
    expect(e.frontExit(cold)).toBe(RULES.pointsPerCoin);
    // Coins from the starting pile have no tag and pay the base rate.
    expect(e.frontExit(null)).toBe(RULES.pointsPerCoin);
    expect(e.points).toBe(RULES.pointsPerCoin * (RULES.hotMultiplier + 2));
  });

  it('applies extra multipliers (fever, coin kind)', () => {
    const e = new Economy(new Rng(1));
    expect(e.frontExit({ hot: false }, 3)).toBe(RULES.pointsPerCoin * 3);
  });

  it('pays prizes in points', () => {
    const e = new Economy(new Rng(1));
    expect(e.prize(250)).toBe(250);
    expect(e.points).toBe(250);
  });

  it('refills more coins for bigger prizes', () => {
    expect(refillFor('standard')).toBe(1);
    expect(refillFor('jumbo')).toBe(2);
    expect(refillFor('rainbow')).toBe(3);
    expect(refillFor('standard', 'duck')).toBe(5);
    expect(refillFor('standard', undefined, true)).toBe(2);
  });

  it('moves the HOT tag to a different gate every 20 to 30 seconds', () => {
    const e = new Economy(new Rng(7));
    const moves: number[] = [];
    let gate = e.hotGate;
    for (let t = 0; t <= 300; t += 0.5) {
      for (const ev of e.tick(t)) {
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
});
