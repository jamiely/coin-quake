import { MAX_COINS, SIM } from './config';
import { Stage } from './render/stage';
import { Trigger, dropperX, gateAt } from './rules/dropper';
import { Economy } from './rules/economy';
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
  readonly stage: Stage;

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
    this.trigger.press(this.simTime);
  }

  release(): void {
    this.trigger.release();
  }

  addCredits(): void {
    this.economy.addCredits();
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
    this.stage.dispose();
    this.physics.dispose();
    this.root.replaceChildren();
  }

  private tick(): void {
    this.simTime += 1 / SIM.hz;
    this.economy.tick(this.simTime);
    if (this.trigger.due(this.simTime)) {
      const x = this.dropperX;
      const tag = this.economy.tryDrop(gateAt(x));
      if (tag) {
        if (this.physics.drop(x, tag)) this.lastDropAt = this.simTime;
        else this.economy.coins++; // body cap: refund
      }
    }
    for (const e of this.physics.step()) {
      if (e.type === 'frontExit') this.economy.frontExit(e.tag);
    }
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
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
      },
      this.simTime,
    );
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
        `[S] stress  [C] +coins`;
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
        this.press();
      } else if (e.code === 'KeyC') {
        // The cabinet's credit button; its 1.5 s hold-to-exit is handled outside the game, so ignore key repeats.
        if (!e.repeat) this.addCredits();
      } else if (e.code === 'KeyS' && this.options.debug && !e.repeat) {
        this.stress();
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
