import { describe, expect, it } from 'vitest';
import { Juice, noise1 } from './core';

const recipes = {
  bump: { 1: { trauma: 0.2 }, 3: { trauma: 0.5, flash: { color: '#fff', opacity: 0.8, fade: 0.2 } } },
  stop: { 1: { hitStop: 0.1 } },
  slow: { 1: { slowMo: { scale: 0.25, hold: 0.5 } } },
  punch: { 1: { punch: -4, kick: 1 } },
};

describe('Juice', () => {
  it('adds trauma by weight, falling back to the nearest lower recipe, and caps at 1', () => {
    const j = new Juice(recipes);
    j.fire('bump', 2);
    expect(j.trauma).toBeCloseTo(0.2);
    j.fire('bump', 5);
    expect(j.trauma).toBeCloseTo(0.7);
    j.fire('bump', 3);
    j.fire('bump', 3);
    expect(j.trauma).toBe(1);
    expect(j.fire('missing')).toBeNull();
    expect(new Juice({ x: { 3: { trauma: 1 } } }).fire('x', 1)).toBeNull();
  });

  it('shakes with trauma squared and decays to rest', () => {
    const j = new Juice(recipes);
    j.fire('bump', 3);
    j.update(1 / 60);
    expect(Math.hypot(j.shake.x, j.shake.y)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) j.update(1 / 60);
    expect(j.trauma).toBe(0);
    expect(j.shake).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it('keeps a rumble floor while the trauma is gone', () => {
    const j = new Juice(recipes);
    j.rumble = 0.3;
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      j.update(1 / 60);
      peak = Math.max(peak, Math.abs(j.shake.x));
    }
    expect(peak).toBeGreaterThan(0);
  });

  it('freezes time during hit-stop, then resumes', () => {
    const j = new Juice(recipes);
    j.fire('stop');
    expect(j.stopped).toBe(true);
    expect(j.timeScale).toBe(0);
    j.update(0.11);
    expect(j.stopped).toBe(false);
    expect(j.timeScale).toBe(1);
  });

  it('holds slow-mo then eases back to full speed', () => {
    const j = new Juice(recipes);
    j.fire('slow');
    expect(j.timeScale).toBe(0.25);
    j.update(0.6);
    expect(j.timeScale).toBeGreaterThan(0.25);
    expect(j.timeScale).toBeLessThan(1);
    j.update(1);
    expect(j.timeScale).toBe(1);
  });

  it('fades flashes and reports the brightest', () => {
    const j = new Juice(recipes);
    j.fire('bump', 3);
    expect(j.flash?.opacity).toBeCloseTo(0.8);
    j.update(0.1);
    expect(j.flash!.opacity).toBeLessThan(0.8);
    j.update(0.2);
    expect(j.flash).toBeNull();
  });

  it('punches the FOV and kicks away from the hit, both recovering', () => {
    const j = new Juice(recipes);
    j.fire('punch', 1, { x: 1, y: 0 });
    expect(j.fovOffset).toBe(-4);
    expect(j.kick.x).toBe(-1);
    j.update(0.5);
    expect(Math.abs(j.fovOffset)).toBeLessThan(0.01);
    expect(Math.abs(j.kick.x)).toBeLessThan(0.01);
  });

  it('scales everything by intensity, and zero turns flashes off', () => {
    const j = new Juice(recipes);
    j.tuning.intensity = 0;
    j.fire('bump', 3);
    expect(j.trauma).toBe(0);
    expect(j.flash).toBeNull();
  });

  it('noise stays in range and is continuous', () => {
    for (let t = 0; t < 10; t += 0.01) {
      const v = noise1(t, 1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(noise1(t + 0.001, 1) - v)).toBeLessThan(0.02);
    }
  });
});
