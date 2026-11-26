import { RULES, type CoinKind, type GateIndex } from '../config';

/** Coins returned to the run's stock for one thing pushed off the front: bigger prizes pay more back. */
export function refillFor(kind: CoinKind, figurine?: string): number {
  if (figurine) return 5;
  return kind === 'rainbow' ? 3 : kind === 'jumbo' || kind === 'gold' ? 2 : 1;
}
import type { Rng } from '../rng';

/** What a coin carries from the gate it fell through to the edge it falls off. */
export interface CoinTag {
  hot: boolean;
}

export type RuleEvent =
  | { type: 'hotMoved'; gate: GateIndex }
  | { type: 'refill'; coins: number };

/**
 * Coins, points and the HOT gate. Pure: takes simulated time, never reads a clock, never touches physics or rendering.
 */
export class Economy {
  coins = RULES.startCoins;
  points = 0;
  hotGate: GateIndex;
  private nextHotAt: number;
  private emptySince: number | null = null;

  constructor(private readonly rng: Rng) {
    this.hotGate = Math.floor(rng.next() * 3) as GateIndex;
    this.nextHotAt = this.holdTime();
  }

  /** Spends one coin for a drop through `gate` (nothing when `free`, as in fever); null when the bank is empty. */
  tryDrop(gate: GateIndex, free = false): CoinTag | null {
    if (!free && this.coins <= 0) return null;
    if (!free) this.coins--;
    return { hot: gate === this.hotGate };
  }

  /** A prize (a figurine pushed off the front) pays `points`. Returns them. */
  prize(points: number): number {
    this.points += points;
    return points;
  }

  addCredits(): void {
    this.coins += RULES.creditCoins;
  }

  /**
   * A coin pushed off the front edge: the coin comes back to the bank and scores. `multiplier` is any extra (QUAKE
   * fever). Returns the points won.
   */
  frontExit(tag: CoinTag | null, multiplier = 1): number {
    const won = RULES.pointsPerCoin * (tag?.hot ? RULES.hotMultiplier : 1) * multiplier;
    this.coins++;
    this.points += won;
    return won;
  }

  /** Advances rule timers to `simTime`: moves the HOT tag and refills an empty bank in free play. */
  tick(simTime: number): RuleEvent[] {
    const events: RuleEvent[] = [];
    if (simTime >= this.nextHotAt) {
      this.hotGate = ((this.hotGate + 1 + Math.floor(this.rng.next() * 2)) % 3) as GateIndex;
      this.nextHotAt = simTime + this.holdTime();
      events.push({ type: 'hotMoved', gate: this.hotGate });
    }
    if (this.coins > 0) {
      this.emptySince = null;
    } else if (RULES.freePlay) {
      this.emptySince ??= simTime;
      if (simTime - this.emptySince >= RULES.freePlayRefillAfter) {
        this.coins += RULES.creditCoins;
        this.emptySince = null;
        events.push({ type: 'refill', coins: RULES.creditCoins });
      }
    }
    return events;
  }

  private holdTime(): number {
    return this.rng.range(RULES.hotMinHold, RULES.hotMaxHold);
  }
}
