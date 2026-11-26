import { Sound } from './audio/sound';
import { COIN_KINDS, FIGURINES, MAX_COINS, RUN, SIM } from './config';
import { Fx } from './fx';
import { Stage } from './render/stage';
import { addHighScore, highScores, InitialsEntry, qualifies, type HighScore } from './rules/arcade';
import { Trigger, dropperX, gateAt } from './rules/dropper';
import { Economy, refillFor } from './rules/economy';
import { Pressure } from './rules/pressure';
import { Run } from './rules/run';
import { Rng } from './rng';
import { PhysicsWorld } from './sim/physics';
import { Hud } from './ui/hud';

export interface GameOptions {
  seed: number;
  debug: boolean;
}

export function optionsFromUrl(search: string, random: () => number): GameOptions {
  const q = new URLSearchParams(search);
  const seed = Number(q.get('seed'));
  return { seed: Number.isFinite(seed) && q.has('seed') ? seed : Math.floor(random() * 2 ** 31), debug: q.has('debug') };
}

const SCORES_KEY = 'coin-quake.scores';
/** Seconds the table ignores presses after it opens. */
const TABLE_LOCK_SECONDS = 1.2;

function parse(text: string | null): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Fixed-step loop, input and event routing. Rules decide, physics simulates, the stage draws.
 * Flow: `ready` (the machine idles, press to start) → a run (drops spend the stock, front coins refill it, Last Call,
 * the sweep) → the finale → initials if the score makes the table → the table → press to play again, which rebuilds
 * the whole machine so every run starts fresh.
 */
export class Game {
  simTime = 0;
  frames = 0;
  /** Rolling per-frame timings (ms) for the perf HUD. */
  readonly perf = { frame: 0, physics: 0, render: 0, fps: 0 };
  private readonly trigger = new Trigger();
  private lastDropAt = -1;
  private lastPayAt = -Infinity;
  private lastPrizeAt = -Infinity;
  private lastLossAt = -Infinity;
  /** The current button gesture was used by a celebration or a screen; ignore it until released. */
  private swallowed = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private fpsWindow: number[] = [];
  private perfEl: HTMLElement | null = null;
  private readonly unlisten: (() => void)[] = [];
  private rebuilding = false;
  /** How many runs this machine has started (the first one starts on the booted machine). */
  runs = 0;

  scores: HighScore[] = highScores(parse(localStorage.getItem(SCORES_KEY)));
  initials: InitialsEntry | null = null;
  /** After initials (or a score that didn't qualify): the table is showing; a press plays again. */
  showingTable = false;
  private tableSince = 0;
  /** The run ended; initials or the table open once the finale card closes. */
  private pendingEnd = false;

  static async create(root: HTMLElement, options: GameOptions): Promise<Game> {
    const rng = new Rng(options.seed);
    const physics = await PhysicsWorld.create(rng);
    return new Game(root, options, rng, physics);
  }

  economy: Economy;
  pressure = new Pressure();
  run = new Run();
  readonly stage: Stage;
  readonly sound = new Sound();
  readonly fx: Fx;
  readonly hud: Hud;

  private constructor(
    private readonly root: HTMLElement,
    readonly options: GameOptions,
    private readonly rng: Rng,
    public physics: PhysicsWorld,
  ) {
    this.economy = new Economy(rng);
    root.classList.add('game');
    const viewport = document.createElement('div');
    viewport.id = 'viewport';
    root.appendChild(viewport);
    this.stage = new Stage(viewport);
    // Effects use their own RNG stream so cosmetic randomness never changes a seeded run.
    const fxRng = new Rng(options.seed ^ 0x5bd1e995);
    this.fx = new Fx(this.stage.scene, root, this.sound, () => fxRng.next());
    this.hud = new Hud(root);
    if (options.debug) {
      this.perfEl = document.createElement('pre');
      this.perfEl.id = 'perf';
      root.appendChild(this.perfEl);
    }
    this.bindInput(viewport);
    this.stage.reveal(this.physics);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get dropperX(): number {
    return dropperX(this.simTime);
  }

  /** The main button. Starts a run, drops during one, steps initials, or plays again from the table. */
  press(): void {
    this.sound.unlock();
    // A celebration owns the button: a press skips it (once allowed) and never drops, and the gesture stays swallowed
    // until released, so a hold that skipped cannot start streaming paid coins.
    if (this.fx.skip()) {
      this.swallowed = true;
      return;
    }
    if (this.rebuilding) return;
    // Initials take every fresh press, even one right after the finale (the swallow only guards dropping).
    if (this.initials) {
      this.swallowed = false;
      this.initials.down(this.simTime);
      return;
    }
    if (this.swallowed) return;
    if (!this.run.active) {
      if (this.run.phase === 'ready' || this.canPlayAgain) void this.startRun();
      // The press that starts a run also starts dropping.
      else return;
    }
    this.trigger.press(this.simTime);
  }

  release(): void {
    this.swallowed = false;
    this.initials?.up(this.simTime);
    this.trigger.release();
  }

  /** The cabinet's C button: free play needs no credits; it just acknowledges with a jingle. */
  addCredits(): void {
    this.sound.unlock();
    this.fx.credit();
  }

  /** Debug: QUAKE now. */
  quake(): void {
    for (const e of this.pressure.quake()) this.fx.pressure(e);
  }

  /** Debug: a coin dump now. */
  dump(): void {
    this.physics.dumpSoon();
  }

  /** Debug: Last Call now. */
  lastCall(): void {
    this.run.callLast();
  }

  /** Debug stress preset: fill the machine to the body cap. */
  stress(): void {
    for (let i = 0; this.physics.coins.length < MAX_COINS && i < MAX_COINS; i++) {
      this.physics.drop(((i % 9) - 4) * 3.5, null);
    }
  }

  /** Runs `seconds` of simulation at once (tests and the smoke check). */
  advance(seconds: number): void {
    const steps = Math.round(seconds * SIM.hz);
    for (let i = 0; i < steps; i++) this.tick();
  }

  /**
   * Starts a run. The first run uses the machine as it booted; every later one rebuilds it from scratch (a new pile,
   * a new structure, fresh pressure and score), so playing again always starts fresh.
   */
  async startRun(): Promise<void> {
    this.showingTable = false;
    if (this.runs > 0) await this.newMachine();
    this.runs++;
    this.run.start(this.simTime);
    this.fx.runStart();
    this.hud.toast(`${RUN.startStock} COINS`);
  }

  /** Rebuilds physics and the rules: the reset behind "play again". */
  async newMachine(): Promise<void> {
    this.rebuilding = true;
    const old = this.physics;
    this.physics = await PhysicsWorld.create(this.rng);
    old.dispose();
    this.economy = new Economy(this.rng);
    this.pressure = new Pressure();
    this.run = new Run();
    this.initials = null;
    this.pendingEnd = false;
    this.trigger.cancel();
    this.fx.reset();
    this.stage.reveal(this.physics);
    this.rebuilding = false;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const off of this.unlisten) off();
    this.fx.overlay.dispose();
    this.stage.dispose();
    this.physics.dispose();
    this.root.replaceChildren();
  }

  private tick(): void {
    if (this.rebuilding) return;
    this.simTime += 1 / SIM.hz;
    this.economy.tick(this.simTime);
    this.run.deadlines(this.simTime);
    for (const e of this.pressure.tick(this.simTime)) this.fx.pressure(e);
    if (this.fx.celebration.active) {
      // A hold that started before the celebration stops dispensing; the player presses again afterwards.
      if (this.trigger.held) this.swallowed = true;
      this.trigger.cancel();
    }
    if (this.trigger.due(this.simTime)) {
      const x = this.dropperX;
      const fever = this.pressure.inFever;
      // Fever drops are free; otherwise each drop spends a coin from the run's stock.
      if (fever || this.run.drop()) {
        const tag = this.economy.tag(gateAt(x));
        const kind = this.physics.drop(x, tag);
        if (kind) {
          this.lastDropAt = this.simTime;
          this.fx.drop(x, tag.hot, kind);
        } else if (!fever) {
          this.run.refund();
        }
      } else if (this.run.active && this.run.stock === 0) {
        this.fx.empty();
      }
    }
    for (const e of this.physics.step()) {
      if (e.type === 'frontExit' && e.figurine) {
        // A prize figurine over the edge: the big prize moment.
        this.lastPrizeAt = this.simTime;
        const won = this.economy.prize(FIGURINES.points * this.pressure.multiplier);
        this.run.coinsOut(refillFor(e.kind, e.figurine));
        this.fx.prize(e.x, e.figurine, won);
        for (const pe of this.pressure.machine(20)) this.fx.pressure(pe);
      } else if (e.type === 'frontExit') {
        this.lastPayAt = this.simTime;
        const hot = Boolean(e.tag?.hot);
        const fever = this.pressure.inFever;
        const won = this.economy.frontExit(e.tag, this.pressure.multiplier * COIN_KINDS[e.kind].value);
        this.run.coinsOut(refillFor(e.kind));
        const events = this.pressure.payout(hot);
        this.fx.payout(e.x, won, this.pressure.combo, hot, fever, e.kind);
        for (const pe of events) this.fx.pressure(pe);
      } else if (e.type === 'sideExit') {
        this.lastLossAt = this.simTime;
        this.fx.loss(e.x);
      } else if (e.type === 'landed') {
        this.fx.land(e.x, e.y, e.z, e.strength, e.hit, e.kind);
        for (const pe of this.pressure.landing()) this.fx.pressure(pe);
      } else if (e.type === 'dumpWarning') {
        this.fx.dumpWarning(e.in);
      } else if (e.type === 'dump') {
        this.fx.dump(e.count);
      } else if (e.type === 'collapse') {
        this.fx.collapse(e.x, e.y, e.z, e.count);
        for (const pe of this.pressure.machine(8)) this.fx.pressure(pe);
      } else {
        // The Works: every hit on the machinery reacts, and builds a little pressure.
        this.fx.works(e);
        if (e.type === 'bonus') this.run.bonus(RUN.bonusCoins);
        // Pegs ping ~10 times per coin, so they barely count; the gear, loop, flippers and zaps a little; BONUS a lot.
        const gain = e.type === 'bonus' ? 6 : e.type === 'peg' ? 0.02 : e.type === 'loopIn' ? 0 : 0.15;
        if (gain) for (const pe of this.pressure.machine(gain)) this.fx.pressure(pe);
      }
    }
    this.stepRun();
  }

  /** Advances the run and the between-run flow: the finale, initials and the table. */
  private stepRun(): void {
    this.run.tick(this.simTime, this.physics.fallingCount, this.physics.settled, this.economy.points);
    for (const event of this.run.drainEvents()) {
      this.fx.run(event, this.run);
      if (event === 'sweep') this.physics.pusherSpeed = RUN.sweepPusherSpeed;
      else if (event === 'over') this.finishRun();
    }
    // Initials and the table wait for the finale card to finish, so the entry's idle timeout only runs while it shows.
    if (this.pendingEnd && !this.fx.celebration.active) {
      this.pendingEnd = false;
      if (qualifies(this.scores, this.run.finalScore)) this.initials = new InitialsEntry(this.simTime);
      else this.openTable();
    }
    if (this.initials) {
      this.initials.tick(this.simTime);
      if (this.initials.done) {
        this.scores = addHighScore(this.scores, { initials: this.initials.text, score: this.run.finalScore });
        localStorage.setItem(SCORES_KEY, JSON.stringify(this.scores));
        this.initials = null;
        this.openTable();
      }
    }
  }

  private openTable(): void {
    this.showingTable = true;
    // A press within TABLE_LOCK_SECONDS is ignored, so the hold that locked the last letter can't play again by itself.
    this.tableSince = this.simTime;
  }

  /** The table is showing and has been up long enough that a press plays again (not an accidental double tap). */
  get canPlayAgain(): boolean {
    return this.showingTable && this.run.canStart && this.simTime - this.tableSince >= TABLE_LOCK_SECONDS;
  }

  private finishRun(): void {
    this.physics.pusherSpeed = 1;
    this.trigger.cancel();
    // The button that was held for the last drops must be released before it enters initials or plays again.
    this.swallowed = true;
    this.fx.finale(this.run.finalScore);
    this.pendingEnd = true;
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    // Hit-stop freezes and slow-mo slows the simulation; effects and rendering run on real time.
    this.acc += dt * this.fx.juice.timeScale;
    let steps = 0;
    let physicsMs = 0;
    while (this.acc >= 1 / SIM.hz && steps < SIM.maxStepsPerFrame) {
      this.tick();
      physicsMs += this.physics.lastStepMs;
      this.acc -= 1 / SIM.hz;
      steps++;
    }
    if (steps === SIM.maxStepsPerFrame) this.acc = 0;
    const t0 = performance.now();
    this.stage.update(
      this.physics,
      {
        dropperX: this.dropperX,
        gate: gateAt(this.dropperX),
        hotGate: this.economy.hotGate,
        points: this.economy.points,
        coins: this.run.stock,
        sinceDrop: this.lastDropAt < 0 ? 99 : this.simTime - this.lastDropAt,
        tier: this.pressure.tier,
        pressure: this.pressure.value,
        fever: this.pressure.fever,
        combo: this.pressure.combo,
        cheering: this.fx.celebration.active,
        sincePayout: this.simTime - this.lastPayAt,
        sincePrize: this.simTime - this.lastPrizeAt,
        sinceLoss: this.simTime - this.lastLossAt,
      },
      this.simTime,
      now / 1000,
    );
    this.hud.update({
      phase: this.run.phase,
      clock: this.run.clock,
      grace: this.run.graceLeft,
      stock: this.run.stock,
      initials: this.initials,
      showingTable: this.showingTable && !this.fx.celebration.active,
      canStart: this.canPlayAgain,
      scores: this.scores,
      finalScore: this.run.finalScore,
      now: this.simTime,
    });
    this.fx.setRumble(this.pressure.tier, this.pressure.inFever);
    this.fx.update(dt, this.stage.camera);
    this.stage.applyCamera(this.fx.juice);
    this.stage.render();
    this.frames++;
    this.recordPerf(dt, physicsMs, performance.now() - t0);
  };

  private recordPerf(dt: number, physicsMs: number, renderMs: number): void {
    const k = 0.1;
    this.perf.physics += (physicsMs - this.perf.physics) * k;
    this.perf.render += (renderMs - this.perf.render) * k;
    this.perf.frame += (dt * 1000 - this.perf.frame) * k;
    this.fpsWindow.push(performance.now());
    while (this.fpsWindow.length && this.fpsWindow[0]! < performance.now() - 1000) this.fpsWindow.shift();
    this.perf.fps = this.fpsWindow.length;
    if (this.perfEl && this.frames % 10 === 0) {
      const info = this.stage.renderer.info.render;
      this.perfEl.textContent =
        `fps ${this.perf.fps}  frame ${this.perf.frame.toFixed(1)} ms\n` +
        `physics ${this.perf.physics.toFixed(2)} ms  render ${this.perf.render.toFixed(2)} ms\n` +
        `coins ${this.physics.coins.length}/${MAX_COINS}  draws ${info.calls}  tris ${info.triangles}\n` +
        `particles ${this.fx.particles.live}  pressure ${this.pressure.value.toFixed(0)}%  combo ${this.pressure.combo}\n` +
        `run ${this.run.phase} stock ${this.run.stock} clock ${this.run.clock.toFixed(0)}\n` +
        `[S] stress  [Q] quake  [D] dump  [L] last call`;
    }
  }

  private bindInput(viewport: HTMLElement): void {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.unlisten.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        // The trigger streams while held; OS key repeat must not count as new presses.
        if (!e.repeat) this.press();
      } else if (e.code === 'KeyC') {
        // The cabinet's credit button; its 1.5 s hold-to-exit is handled outside the game, so ignore key repeats.
        if (!e.repeat) this.addCredits();
      } else if (this.options.debug && !e.repeat) {
        if (e.code === 'KeyS') this.stress();
        else if (e.code === 'KeyQ') this.quake();
        else if (e.code === 'KeyD') this.dump();
        else if (e.code === 'KeyL') this.lastCall();
      }
    });
    on(window, 'keyup', (e) => {
      if (e.code === 'Space') this.release();
    });
    on(viewport, 'pointerdown', () => this.press());
    on(window, 'pointerup', () => this.release());
    on(window, 'blur', () => this.release());
    on(window, 'resize', () => this.stage.resize());
  }
}
