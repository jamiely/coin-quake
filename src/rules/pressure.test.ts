import { describe, expect, it } from 'vitest';
import { PRESSURE, Pressure } from './pressure';

describe('Pressure', () => {
  it('chains payouts within the window into a combo and ends it after', () => {
    const p = new Pressure();
    p.tick(1);
    expect(p.payout(false)).toContainEqual({ type: 'combo', count: 1 });
    p.tick(2);
    expect(p.payout(false)).toContainEqual({ type: 'combo', count: 2 });
    p.tick(2 + PRESSURE.comboWindow + 0.01);
    expect(p.combo).toBe(0);
    p.tick(5);
    expect(p.payout(false)).toContainEqual({ type: 'combo', count: 1 });
  });

  it('reports the combo ending once', () => {
    const p = new Pressure();
    p.payout(false);
    p.payout(false);
    expect(p.tick(10)).toContainEqual({ type: 'comboEnd', count: 2 });
    expect(p.tick(11).filter((e) => e.type === 'comboEnd')).toEqual([]);
  });

  it('flags combo milestones', () => {
    const p = new Pressure();
    const all = Array.from({ length: 10 }, () => p.payout(false)).flat();
    expect(all).toContainEqual({ type: 'milestone', count: 10 });
  });

  it('climbs through tiers, pays hot coins more, and drains after a pause', () => {
    const p = new Pressure();
    p.payout(true);
    const hot = p.value;
    const q = new Pressure();
    q.payout(false);
    expect(hot).toBeGreaterThan(q.value);
    const tiers: number[] = [];
    for (let i = 0; i < 400 && p.tier < 3; i++) for (const e of p.landing()) if (e.type === 'tier') tiers.push(e.tier);
    expect(tiers).toEqual([1, 2, 3]);
    const before = p.value;
    p.tick(PRESSURE.drainDelay - 0.5);
    expect(p.value).toBe(before);
    p.tick(PRESSURE.drainDelay + 10);
    expect(p.value).toBeLessThan(before);
  });

  it('QUAKEs at 100, runs a x3 fever that ignores gains, burns down, and ends calm', () => {
    const p = new Pressure();
    p.tick(1);
    expect(p.quake()).toContainEqual({ type: 'quake' });
    expect(p.inFever).toBe(true);
    expect(p.multiplier).toBe(PRESSURE.feverMultiplier);
    expect(p.quakes).toBe(1);
    expect(p.landing()).toEqual([]);
    p.tick(1 + PRESSURE.feverDuration / 2);
    expect(p.value).toBeCloseTo(50, 0);
    const end = p.tick(1 + PRESSURE.feverDuration + 0.1);
    expect(end).toContainEqual({ type: 'feverEnd' });
    expect(p.inFever).toBe(false);
    expect(p.value).toBe(0);
    expect(p.multiplier).toBe(1);
  });
});
