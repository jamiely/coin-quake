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
  fullSpeed: 260,
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
