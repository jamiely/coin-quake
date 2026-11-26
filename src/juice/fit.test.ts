import { describe, expect, it } from 'vitest';
import { fitScale, slamStart } from './fit';

describe('fit', () => {
  it('shrinks wide text to the available width and leaves narrow text alone', () => {
    expect(fitScale({ offsetWidth: 1200 } as HTMLElement, 900)).toBeCloseTo(0.75);
    expect(fitScale({ offsetWidth: 600 } as HTMLElement, 900)).toBe(1);
    expect(fitScale({ offsetWidth: 0 } as HTMLElement, 900)).toBe(1);
  });

  it('caps a slam-in so the word overshoots the screen by a bounded amount', () => {
    // A word resting at 900 px on a 1050 px screen may start at most 1.25 * 1050 wide.
    expect(slamStart(900, 1050, 4)).toBeCloseTo((1050 * 1.25) / 900);
    expect(slamStart(200, 1050, 4)).toBe(4);
    expect(slamStart(2000, 1050, 4)).toBe(1);
  });
});
