import { RUN } from '../config';

/**
 * One run, ported from Neon Reef's bankroll runs (vicky/src/rules/run.ts), with coins for balls.
 * `ready` → `playing` → (`suddenDeath` ↔ `playing`) → `lastCall` → `sweep` → `over`.
 * - Each drop spends one coin from the stock; each coin pushed off the front edge returns one, until Last Call. That is
 *   the anti-jam rule: holding the button only spends the stock faster, so a run always ends.
 * - Out of coins with none still falling: before Last Call a short sudden-death window lets tray spills revive the run;
 *   at Last Call (or when the window closes) the pushers sweep the tray as a finale, then the run is over.
 */
export type RunPhase = 'ready' | 'playing' | 'suddenDeath' | 'lastCall' | 'sweep' | 'over';
export type RunEvent = 'lastCall' | 'suddenDeath' | 'revive' | 'sweep' | 'over' | 'lowStock';

export class Run {
  phase: RunPhase = 'ready';
  stock = 0;
  /** Score of the finished run, kept after the machine is reset for the next one. */
  finalScore = 0;
  now = 0;
  private started = 0;
  private since = 0;
  private events: RunEvent[] = [];

  get active(): boolean {
    return this.phase === 'playing' || this.phase === 'suddenDeath' || this.phase === 'lastCall' || this.phase === 'sweep';
  }

  /** Seconds until Last Call; 0 once it has been called. */
  get clock(): number {
    return this.phase === 'playing' || this.phase === 'suddenDeath' ? Math.max(0, RUN.lastCallSeconds - (this.now - this.started)) : 0;
  }

  /** Seconds left in the sudden-death window. */
  get graceLeft(): number {
    return this.phase === 'suddenDeath' ? Math.max(0, RUN.suddenDeathSeconds - (this.now - this.since)) : 0;
  }

  /** Seconds since the phase began (for the finale and the result screen). */
  get inPhase(): number {
    return this.now - this.since;
  }

  /** A press can start a run: before the first one, or once the last one has been over for a moment. */
  get canStart(): boolean {
    return this.phase === 'ready' || (this.phase === 'over' && this.now - this.since >= RUN.overLockSeconds);
  }

  start(now: number): void {
    this.now = this.started = this.since = now;
    this.phase = 'playing';
    this.stock = RUN.startStock;
    this.finalScore = 0;
    this.events = [];
  }

  /** Spends a coin for one drop; false when the stock is empty or the run is not taking drops. */
  drop(): boolean {
    if (this.stock === 0 || (this.phase !== 'playing' && this.phase !== 'lastCall')) return false;
    this.stock--;
    if (this.stock === RUN.lowStock) this.events.push('lowStock');
    return true;
  }

  /** A drop the machine could not take (the body cap): gives the coin back. */
  refund(): void {
    this.stock = Math.min(RUN.stockCap, this.stock + 1);
  }

  /** Coins left the tray's front edge: each returns to the stock until Last Call. */
  coinsOut(count = 1): void {
    if (this.phase !== 'playing' && this.phase !== 'suddenDeath') return;
    this.stock = Math.min(RUN.stockCap, this.stock + count);
    if (this.phase === 'suddenDeath') {
      this.phase = 'playing';
      this.events.push('revive');
    }
  }

  /** Adds bonus coins (a coin dump's payday, the C button): same cap, no effect once refills have stopped. */
  bonus(count: number): void {
    if (this.phase === 'playing' || this.phase === 'suddenDeath' || this.phase === 'ready') this.stock = Math.min(RUN.stockCap, this.stock + count);
  }

  /**
   * Advances the run to simulated time `now`. `falling` counts dropped coins that have not landed yet; `settled` is
   * true once the tray has calmed down (nothing left to tumble off). `score` is the live score, frozen at the end.
   */
  tick(now: number, falling: number, settled: boolean, score: number): void {
    this.deadlines(now);
    const empty = this.stock === 0 && falling === 0;
    if (this.phase === 'playing' && empty) this.enter('suddenDeath');
    else if (this.phase === 'lastCall' && empty) this.enter('sweep');
    else if (this.phase === 'sweep' && now - this.since >= RUN.sweepSeconds && (settled || now - this.since >= RUN.sweepMaxSeconds)) {
      this.finalScore = score;
      this.enter('over');
    }
  }

  /**
   * Applies the clock's deadlines (Last Call, the end of sudden death) at `now`. Call before a step's tray exits are
   * counted, so a coin that falls after a deadline never refills or revives.
   */
  deadlines(now: number): void {
    this.now = now;
    if ((this.phase === 'playing' || this.phase === 'suddenDeath') && now - this.started >= RUN.lastCallSeconds) {
      this.enter(this.phase === 'suddenDeath' ? 'sweep' : 'lastCall');
    } else if (this.phase === 'suddenDeath' && now - this.since >= RUN.suddenDeathSeconds) {
      this.enter('sweep');
    }
  }

  /** Calls Last Call early (debug). */
  callLast(): void {
    if (this.phase === 'playing' || this.phase === 'suddenDeath') this.enter('lastCall');
  }

  drainEvents(): RunEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private enter(phase: RunPhase): void {
    this.phase = phase;
    this.since = this.now;
    this.events.push(phase as RunEvent);
  }
}
