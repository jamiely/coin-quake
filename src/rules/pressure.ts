/**
 * Pressure, combos and QUAKE fever (GAME_DESIGN.md §4.2–4.5). Pure: fed events and simulated time, returns what
 * happened so the game can fire juice and sound.
 */

export const PRESSURE = {
  /** Pressure (0..100) per event. */
  perLanding: 0.6,
  perFrontCoin: 1.1,
  perHotCoin: 2.2,
  /** Each combo step past 1 adds this much on top. */
  perComboStep: 0.35,
  /** Drain per second after `drainDelay` seconds without gains. */
  drain: 1.5,
  drainDelay: 4,
  /** Pressure tiers: 0 Calm, 1 Warm, 2 Hot, 3 Critical. */
  tiers: [25, 50, 75] as const,
  /** Payouts within this many seconds of each other chain a combo. */
  comboWindow: 1.5,
  /** Combo milestones that get a big reaction. */
  milestones: [10, 25, 50] as const,
  feverDuration: 25,
  feverMultiplier: 3,
};

export type Tier = 0 | 1 | 2 | 3;

export type PressureEvent =
  | { type: 'tier'; tier: Tier; from: Tier }
  | { type: 'combo'; count: number }
  | { type: 'milestone'; count: number }
  | { type: 'comboEnd'; count: number }
  | { type: 'quake' }
  | { type: 'feverEnd' };

export class Pressure {
  value = 0;
  /** Set when a run ends: nothing builds pressure or starts a fever until the next run's fresh Pressure. */
  frozen = false;
  combo = 0;
  /** Seconds of fever left; > 0 while QUAKE fever runs. */
  fever = 0;
  quakes = 0;
  private lastGainAt = 0;
  private lastPayAt = -Infinity;
  private now = 0;

  get tier(): Tier {
    const [a, b, c] = PRESSURE.tiers;
    return this.value >= c ? 3 : this.value >= b ? 2 : this.value >= a ? 1 : 0;
  }

  get inFever(): boolean {
    return this.fever > 0;
  }

  /** Point multiplier for payouts right now. */
  get multiplier(): number {
    return this.inFever ? PRESSURE.feverMultiplier : 1;
  }

  /** A dropped coin landed on the shelf. */
  landing(): PressureEvent[] {
    return this.gain(PRESSURE.perLanding);
  }

  /** A coin fell off the front: chains the combo and builds pressure. */
  payout(hot: boolean): PressureEvent[] {
    const events: PressureEvent[] = [];
    if (this.frozen) return events;
    this.combo = this.now - this.lastPayAt <= PRESSURE.comboWindow ? this.combo + 1 : 1;
    this.lastPayAt = this.now;
    events.push({ type: 'combo', count: this.combo });
    if ((PRESSURE.milestones as readonly number[]).includes(this.combo)) events.push({ type: 'milestone', count: this.combo });
    const amount = (hot ? PRESSURE.perHotCoin : PRESSURE.perFrontCoin) + PRESSURE.perComboStep * (this.combo - 1);
    events.push(...this.gain(amount));
    return events;
  }

  /** A coin hit the machinery (a peg, the gear, a flipper, the bonus slot): builds `amount` pressure. */
  machine(amount: number): PressureEvent[] {
    return this.gain(amount);
  }

  /** Forces a QUAKE (debug, or a future Bonus Wheel segment). */
  quake(): PressureEvent[] {
    return this.gain(100);
  }

  tick(simTime: number): PressureEvent[] {
    const dt = Math.max(0, simTime - this.now);
    this.now = simTime;
    const events: PressureEvent[] = [];
    if (this.frozen) return events;
    if (this.combo > 0 && this.now - this.lastPayAt > PRESSURE.comboWindow) {
      events.push({ type: 'comboEnd', count: this.combo });
      this.combo = 0;
    }
    if (this.inFever) {
      this.fever = Math.max(0, this.fever - dt);
      // Fever burns the gauge down to zero over its duration, so the cool-down lands calm.
      this.setValue((this.fever / PRESSURE.feverDuration) * 100, events);
      if (!this.inFever) events.push({ type: 'feverEnd' });
    } else if (this.now - this.lastGainAt > PRESSURE.drainDelay) {
      this.setValue(this.value - PRESSURE.drain * dt, events);
    }
    return events;
  }

  private gain(amount: number): PressureEvent[] {
    const events: PressureEvent[] = [];
    if (this.inFever || this.frozen) return events;
    this.lastGainAt = this.now;
    this.setValue(this.value + amount, events);
    if (this.value >= 100) {
      this.fever = PRESSURE.feverDuration;
      this.quakes++;
      events.push({ type: 'quake' });
    }
    return events;
  }

  private setValue(v: number, events: PressureEvent[]): void {
    const from = this.tier;
    this.value = Math.max(0, Math.min(100, v));
    const to = this.tier;
    if (to !== from) events.push({ type: 'tier', tier: to, from });
  }
}
