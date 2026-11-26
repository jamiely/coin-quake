import { describe, expect, it } from 'vitest';
import { DROPPER } from '../config';
import { Trigger, dropperX, gateAt } from './dropper';

describe('dropper', () => {
  it('swings across the full width and dwells at the ends', () => {
    const xs = Array.from({ length: 640 }, (_, i) => dropperX((i / 640) * DROPPER.period));
    expect(Math.max(...xs)).toBeCloseTo(DROPPER.halfSwing);
    expect(Math.min(...xs)).toBeCloseTo(-DROPPER.halfSwing);
    const atEnd = xs.filter((x) => Math.abs(x) === DROPPER.halfSwing).length;
    expect(atEnd).toBeGreaterThan(0);
  });

  it('maps the swing onto three gates', () => {
    expect(gateAt(-DROPPER.halfSwing)).toBe(0);
    expect(gateAt(0)).toBe(1);
    expect(gateAt(DROPPER.halfSwing)).toBe(2);
  });
});

describe('Trigger', () => {
  it('drops one coin on a tap', () => {
    const t = new Trigger();
    t.press(1);
    expect(t.due(1)).toBe(1);
    t.release();
    expect(t.due(2)).toBe(0);
  });

  it('keeps a tap released before the next tick', () => {
    const t = new Trigger();
    t.press(0);
    t.release();
    expect(t.due(1 / 60)).toBe(1);
    expect(t.due(2 / 60)).toBe(0);
  });

  it('streams four coins a second while held', () => {
    const t = new Trigger();
    t.press(0);
    let n = 0;
    for (let time = 0; time < 2 - 1e-9; time += 1 / 60) n += t.due(time);
    expect(n).toBe(8);
  });

  it('ignores key-repeat presses while held', () => {
    const t = new Trigger();
    t.press(0);
    expect(t.due(0)).toBe(1);
    t.press(0.05);
    expect(t.due(0.05)).toBe(0);
  });
});
