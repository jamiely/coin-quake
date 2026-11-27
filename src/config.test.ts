import { describe, expect, it } from 'vitest';
import { DECK, STEPS, TRAY } from './config';

describe('tier geometry', () => {
  it('every step pusher fits under the deck above it, leaving a positive step face', () => {
    // Bug (review): 2.5 cm drops with 1.6 cm pushers gave negative step-face boxes and pushers inside the deck above.
    const decks = [DECK.y, ...STEPS.slice(0, -1).map((s) => s.y)];
    STEPS.forEach((st, i) => {
      const face = decks[i]! - DECK.thickness - (st.y + st.height) - 0.15;
      expect(face).toBeGreaterThan(0);
      expect(st.frontMax).toBeLessThan(st.front);
    });
    expect(STEPS[STEPS.length - 1]!.front).toBe(TRAY.front);
    expect(STEPS[STEPS.length - 1]!.y).toBe(TRAY.y);
  });
});
