import { describe, expect, it } from 'vitest';
import { peakOverlap } from './sound';

describe('peakOverlap', () => {
  it('counts voices sounding at once, not every voice touching the interval', () => {
    // Ten back-to-back notes under one long cymbal: only one note sounds at any instant.
    const notes: [number, number][] = Array.from({ length: 10 }, (_, i) => [i, i + 1]);
    expect(peakOverlap(notes, 0, 10)).toBe(1);
    expect(peakOverlap([...notes, [2, 3]], 0, 10)).toBe(2);
    expect(peakOverlap(notes, 20, 21)).toBe(0);
  });
});
