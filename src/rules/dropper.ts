import { DROPPER, type GateIndex } from '../config';

/** Carriage x at `time`: a sine pendulum, over-driven and clamped so it dwells briefly at each end. */
export function dropperX(time: number): number {
  const s = Math.sin((2 * Math.PI * time) / DROPPER.period) * DROPPER.dwell;
  return Math.max(-1, Math.min(1, s)) * DROPPER.halfSwing;
}

/** The gate under carriage position `x`: three equal thirds of the swing. */
export function gateAt(x: number): GateIndex {
  const third = (2 * DROPPER.halfSwing) / 3;
  if (x < -DROPPER.halfSwing + third) return 0;
  if (x > DROPPER.halfSwing - third) return 2;
  return 1;
}

/**
 * One button: a press drops a coin at once; holding streams coins every `streamInterval`.
 * Feed it press and release edges and simulated time; it returns how many coins to drop now.
 */
export class Trigger {
  private held = false;
  private nextAt = 0;

  press(time: number): void {
    if (this.held) return;
    this.held = true;
    this.nextAt = time;
  }

  release(): void {
    this.held = false;
  }

  /** Coins due at `time` (0 or 1; a long frame never bursts several at the same spot). */
  due(time: number): number {
    if (!this.held || time < this.nextAt) return 0;
    this.nextAt = Math.max(this.nextAt + DROPPER.streamInterval, time - DROPPER.streamInterval);
    return 1;
  }
}
