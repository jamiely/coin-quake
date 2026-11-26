/** Every tunable in one place. Units: cm, seconds. */

export const GRAVITY = -981;

export const SIM = {
  hz: 60,
  /** At most this many fixed steps per rendered frame, so a slow frame cannot spiral. */
  maxStepsPerFrame: 3,
  solverIterations: 2,
};

/** A chunky cartoon coin, flat on the tray (Rapier cylinders stand on the Y axis); a little bounce so landings read. */
export const COIN = { radius: 1.5, halfThickness: 0.35, density: 7, friction: 0.45, restitution: 0.32 };

/**
 * Coin kinds (the user: "different kinds of coins, some with different sizes"). Radius and thickness scale the
 * standard coin; `value` multiplies its points; `pitch` scales its clink; `odds` weight how often a drop is this kind.
 * Lead is heavy and shoves the pile hard; gold and rainbow are rare bonus coins.
 */
export const COIN_KINDS = {
  standard: { scale: 1, thick: 1, density: 7, value: 1, pitch: 1, odds: 70, face: '#ffc83a', rim: '#d98a10' },
  dime: { scale: 0.68, thick: 0.8, density: 7, value: 1, pitch: 1.5, odds: 12, face: '#dfe6ee', rim: '#8e9aa8' },
  jumbo: { scale: 1.55, thick: 1.4, density: 7, value: 3, pitch: 0.7, odds: 8, face: '#ffb02e', rim: '#b5650d' },
  lead: { scale: 1.2, thick: 1.6, density: 26, value: 2, pitch: 0.55, odds: 5, face: '#8a8fa8', rim: '#4b4f63' },
  gold: { scale: 1.1, thick: 1.1, density: 9, value: 5, pitch: 1.25, odds: 4, face: '#fff08a', rim: '#ffb800' },
  rainbow: { scale: 1.2, thick: 1.1, density: 7, value: 10, pitch: 1.35, odds: 1, face: '#ffffff', rim: '#ff5ad1' },
} as const;
export type CoinKind = keyof typeof COIN_KINDS;

/**
 * Prize figurines ("objects like little figurines to the stacks"): chunky cartoon toys that ride the pile and pay
 * big when pushed off the front. Sizes in cm (half extents); a few start on the tray, more drop in now and then.
 */
export const FIGURINES = {
  kinds: ['critter', 'professor', 'bolt', 'duck'] as const,
  halfSize: 1.6,
  density: 4,
  points: 250,
  onTray: 3,
  /** Chance per drop that a figurine falls in with the coin (a prize drop). */
  dropChance: 0.02,
  max: 8,
};

/**
 * Random coin dumps ("randomly dump a bunch of coins on the playfield"): every so often a siren sounds, then a load
 * of coins crashes onto the tray from above. Seconds of simulated time.
 */
export const DUMP = { minGap: 45, maxGap: 90, warning: 1.6, coins: 45, spread: 13 };

/** The lower tray: coins pushed past `front` fall off and pay; past the open corners they fall off the sides. */
export const TRAY = {
  halfWidth: 18,
  back: -32,
  front: 10,
  /** Side rails stop this far short of the front edge, so coins at the corners are lost. */
  openCorner: 5,
  railHeight: 3,
};

/** One kinematic block: its front face pushes the lower tray; its top is the upper shelf, scraped by a fixed wall. */
export const PUSHER = {
  height: 4,
  depth: 20,
  frontMin: -12,
  frontMax: -4,
  period: 2.6,
  /** The fixed wall above the shelf; coins on the shelf are scraped off its front as the pusher retracts. */
  scraperZ: -19,
};

/**
 * Cartoon impacts (drama over realism). A dropped coin falls with extra gravity, and on landing it blasts the coins
 * around it: an upward hop plus a radial push, weaker with distance. The sideways part is capped so the blast
 * scatters the pile without throwing coins over the side rails.
 */
export const IMPACT = {
  /** Extra downward acceleration on a dropped coin until it lands (cm/s², on top of GRAVITY). */
  extraGravity: -1400,
  /** Coins within this radius of the landing point are hit. */
  radius: 7,
  /** Upward speed given at the centre (cm/s), and the radial push. */
  hop: 95,
  push: 55,
  /** Random spin given to hit coins (rad/s), so they flip and tumble. */
  spin: 14,
  /** Landing speed (cm/s) at which the blast is full strength; slower landings scale down. */
  fullSpeed: 190,
  /** Hits within this distance of a side rail get no outward push. */
  railMargin: 4,
};

/** Hard cap on live coin bodies (measured: ~6 ms/step at 350 on an M-series Mac with the SIMD build). */
export const MAX_COINS = 350;

/** The swinging dropper above the shelf. */
export const DROPPER = {
  y: 30,
  z: -15.5,
  halfSwing: 15,
  period: 3.2,
  /** sin() is scaled past 1 and clamped, so the carriage pauses briefly at each end. */
  dwell: 1.18,
  /** Seconds between coins while the button is held (4 per second). */
  streamInterval: 0.25,
};

/**
 * The Works: the machinery coins fall through between the gates and the shelf, inside the slab between the scraper
 * wall (z -19) and the drop-zone glass (z -11.8). Each gate route meets a different machine: L the gear wheel, C the
 * peg field and its BONUS slot, R the pipe loop; flippers catch everything at the bottom and Tesla coils zap passers-by.
 */
export const WORKS = {
  z: -15.4,
  halfDepth: 3.4,
  gear: { x: -10.5, y: 15.5, hub: 2, reach: 5.4, paddles: 6, spin: 1.8, fling: 70 },
  pegs: { rows: [21.5, 18.8, 16.1, 13.4], spacing: 5, halfSpan: 5, radius: 0.6, kick: 35 },
  /** The BONUS slot under the peg field; a coin through it spins the bonus wheel. */
  bonus: { x: 0, y: 10.6, halfWidth: 1.9 },
  loop: { x: 11, y: 15, radius: 4, entryY: 20.4, time: 0.75, exit: { x: 5.6, y: 10.5, vx: -45, vy: -35 } },
  flippers: { x: 12.8, y: 8.4, length: 6, rest: -0.42, up: 0.5, kick: { vx: 55, vy: -55 }, cooldown: 0.35 },
  tesla: { x: 16.4, y: 14, range: 6.5, cooldown: 0.4 },
  /** A coin above the shelf moving slower than this (cm/s) for `stuckTime` gets nudged loose. */
  stuckSpeed: 3,
  stuckTime: 0.9,
};

/** Three gates under the swing; one is HOT and doubles that coin's points. */
export const GATES = ['L', 'C', 'R'] as const;
export type GateIndex = 0 | 1 | 2;

export const RULES = {
  startCoins: 50,
  /** One credit press (the cabinet's C button). */
  creditCoins: 50,
  freePlay: true,
  /** With free play, an empty bank refills after this long. */
  freePlayRefillAfter: 10,
  pointsPerCoin: 10,
  hotMultiplier: 2,
  hotMinHold: 20,
  hotMaxHold: 30,
  /** Coins already on the machine when it boots. */
  startPile: 290,
};
