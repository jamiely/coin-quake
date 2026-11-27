import { RULES, type CoinKind, type GateIndex } from '../config';
import type { Rng } from '../rng';

/** Coins returned to the run's stock for one thing pushed off the front: bigger prizes pay more back. */
export function refillFor(kind: CoinKind, figurine?: string, hot = false): number {
  if (figurine) return 5;
  const base = kind === 'rainbow' ? 3 : kind === 'jumbo' || kind === 'gold' ? 2 : 1;
  // A coin you dropped through the HOT gate refills RULES.hotRefill times over: aiming is how a run lasts.
  return hot ? base * RULES.hotRefill : base;
}

/** What a coin carries from the gate it fell through to the edge it falls off. */
export interface CoinTag {
  hot: boolean;
}

export type RuleEvent = { type: 'hotMoved'; gate: GateIndex };

/**
 * Points and the HOT gate. The coin stock belongs to the run (rules/run.ts). Pure: takes simulated time, never reads a
 * clock, never touches physics or rendering.
 */
export class Economy {
  points = 0;
  hotGate: GateIndex;
  private nextHotAt: number;

  constructor(private readonly rng: Rng) {
    this.hotGate = Math.floor(rng.next() * 3) as GateIndex;
    this.nextHotAt = this.holdTime();
  }

  /** Tags a coin dropped through `gate`. */
  tag(gate: GateIndex): CoinTag {
    return { hot: gate === this.hotGate };
  }

  /** A prize (a figurine pushed off the front) pays `points`. Returns them. */
  prize(points: number): number {
    this.points += points;
    return points;
  }

  /** A coin pushed off the front edge scores. `multiplier` is any extra (fever, coin kind). Returns the points won. */
  frontExit(tag: CoinTag | null, multiplier = 1): number {
    const won = RULES.pointsPerCoin * (tag?.hot ? RULES.hotMultiplier : 1) * multiplier;
    this.points += won;
    return won;
  }

  /** Advances rule timers to `simTime`: moves the HOT tag every 20–30 s. */
  tick(simTime: number): RuleEvent[] {
    if (simTime < this.nextHotAt) return [];
    this.hotGate = ((this.hotGate + 1 + Math.floor(this.rng.next() * 2)) % 3) as GateIndex;
    this.nextHotAt = simTime + this.holdTime();
    return [{ type: 'hotMoved', gate: this.hotGate }];
  }

  private holdTime(): number {
    return this.rng.range(RULES.hotMinHold, RULES.hotMaxHold);
  }
}
