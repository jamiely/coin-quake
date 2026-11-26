import { Sound } from './audio/sound';
import { MAX_COINS, SIM } from './config';
import { Fx } from './fx';
import { Stage } from './render/stage';
import { Trigger, dropperX, gateAt } from './rules/dropper';
import { Economy } from './rules/economy';
import { Pressure } from './rules/pressure';
import { Rng } from './rng';
import { PhysicsWorld } from './sim/physics';

export interface GameOptions {
  seed: number;
  debug: boolean;
}

export function optionsFromUrl(search: string, random: () => number): GameOptions {
  const q = new URLSearchParams(search);
  const seed = Number(q.get('seed'));
  return { seed: Number.isFinite(seed) && q.has('seed') ? seed : Math.floor(random() * 2 ** 31), debug: q.has('debug') };
}

/** Fixed-step loop, input and event routing. Rules decide, physics simulates, the stage draws. */
export class Game {
  simTime = 0;
  frames = 0;
  /** Rolling per-frame timings (ms) for the perf HUD. */
  readonly perf = { frame: 0, physics: 0, render: 0, fps: 0 };
  private readonly trigger = new Trigger();
  private lastDropAt = -1;
  /** The current button gesture was used by a celebration; ignore it until released. */
  private swallowed = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private fpsWindow: number[] = [];
  private perfEl: HTMLElement | null = null;
  private readonly unlisten: (() => void)[] = [];

  static async create(root: HTMLElement, options: GameOptions): Promise<Game> {
    const rng = new Rng(options.seed);
    const physics = await PhysicsWorld.create(rng);
    return new Game(root, options, rng, physics);
  }

  readonly economy: Economy;
  readonly pressure = new Pressure();
  readonly stage: Stage;
  readonly sound = new Sound();
  readonly fx: Fx;

  private constructor(
    private readonly root: HTMLElement,
    readonly options: GameOptions,
    rng: Rng,
    readonly physics: PhysicsWorld,
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
    if (options.debug) {
      this.perfEl = document.createElement('pre');
      this.perfEl.id = 'perf';
      root.appendChild(this.perfEl);
    }
    this.bindInput(viewport);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get dropperX(): number {
    return dropperX(this.simTime);
  }

  press(): void {
    this.sound.unlock();
    // A celebration owns the button: a press skips it (once allowed) and never drops, and the gesture stays swallowed
    // until released, so a hold that skipped cannot start streaming paid coins.
    if (this.fx.skip()) {
      this.swallowed = true;
      return;
    }
    if (this.swallowed) return;
    this.trigger.press(this.simTime);
  }

  release(): void {
    this.swallowed = false;
    this.trigger.release();
  }

  addCredits(): void {
    this.sound.unlock();
    this.economy.addCredits();
    this.fx.credit();
  }

  /** Debug: QUAKE now. */
  quake(): void {
    for (const e of this.pressure.quake()) this.fx.pressure(e);
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

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const off of this.unlisten) off();
    this.fx.overlay.dispose();
    this.stage.dispose();
    this.physics.dispose();
    this.root.replaceChildren();
  }

  private tick(): void {
    this.simTime += 1 / SIM.hz;
    this.economy.tick(this.simTime);
    for (const e of this.pressure.tick(this.simTime)) this.fx.pressure(e);
    if (this.fx.celebration.active) {
      // A hold that started before the celebration stops dispensing; the player presses again afterwards.
      if (this.trigger.held) this.swallowed = true;
      this.trigger.cancel();
    }
    if (this.trigger.due(this.simTime)) {
      const x = this.dropperX;
      const fever = this.pressure.inFever;
      const tag = this.economy.tryDrop(gateAt(x), fever);
      if (tag) {
        if (this.physics.drop(x, tag)) {
          this.lastDropAt = this.simTime;
          this.fx.drop(x, tag.hot);
        } else if (!fever) {
          this.economy.coins++; // body cap: refund
        }
      }
    }
    for (const e of this.physics.step()) {
      if (e.type === 'frontExit') {
        const hot = Boolean(e.tag?.hot);
        const fever = this.pressure.inFever;
        const won = this.economy.frontExit(e.tag, this.pressure.multiplier);
        const events = this.pressure.payout(hot);
        this.fx.payout(e.x, won, this.pressure.combo, hot, fever);
        for (const pe of events) this.fx.pressure(pe);
      } else if (e.type === 'sideExit') {
        this.fx.loss(e.x);
      } else if (e.type === 'landed') {
        this.fx.land(e.x, e.y, e.z, e.strength, e.hit);
        for (const pe of this.pressure.landing()) this.fx.pressure(pe);
      } else {
        // The Works: every hit on the machinery reacts, and builds a little pressure.
        this.fx.works(e);
        for (const pe of this.pressure.machine(e.type === 'bonus' ? 6 : 0.4)) this.fx.pressure(pe);
      }
    }
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
        coins: this.economy.coins,
        sinceDrop: this.lastDropAt < 0 ? 99 : this.simTime - this.lastDropAt,
        tier: this.pressure.tier,
        pressure: this.pressure.value,
        fever: this.pressure.fever,
        combo: this.pressure.combo,
        cheering: this.fx.celebration.active,
      },
      this.simTime,
      now / 1000,
    );
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
        `[S] stress  [Q] quake  [C] +coins`;
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
      } else if (e.code === 'KeyS' && this.options.debug && !e.repeat) {
        this.stress();
      } else if (e.code === 'KeyQ' && this.options.debug && !e.repeat) {
        this.quake();
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
