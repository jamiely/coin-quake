/**
 * Synthesized cartoon SFX (Web Audio, no files). Nothing is created before the first user gesture (`unlock`).
 * Coin clinks are throttled; the combo ladder climbs a major pentatonic scale, Peggle-style.
 */

const PENTATONIC = [0, 2, 4, 7, 9];
const MAX_VOICES = 24;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private lastClink = 0;
  private clinksInWindow = 0;
  muted = false;

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noise = noise;
  }

  /** The dropper's claw: a short pneumatic "psst" plus a click. */
  drop(): void {
    this.noiseHit(0.05, 2400, 0.18, 'highpass');
    this.tone(1300, 0.03, 0.12, 'square', 900);
  }

  /** A coin landing; `intensity` 0..1. Throttled so a pile does not roar. */
  clink(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastClink > 0.1) {
      this.lastClink = now;
      this.clinksInWindow = 0;
    }
    if (++this.clinksInWindow > 6) return;
    const f = 2600 + Math.random() * 1600;
    this.tone(f, 0.09, 0.12 * (0.4 + intensity), 'triangle');
    this.tone(f * 1.51, 0.06, 0.05 * (0.4 + intensity), 'sine');
  }

  /** A front payout: a bright pickup on the combo ladder. Higher combos climb the scale. */
  payout(combo: number, hot: boolean): void {
    const step = Math.min(combo - 1, 24);
    const semis = 12 * Math.floor(step / 5) + PENTATONIC[step % 5]!;
    const f = 660 * 2 ** (semis / 12);
    this.tone(f, 0.12, 0.2, 'square', f * 1.02);
    this.tone(f * 2, 0.09, 0.08, 'sine');
    if (hot) this.tone(f * 1.5, 0.16, 0.12, 'sawtooth', f * 1.6);
  }

  /** A coin lost off a side: a little sad slide-whistle down. */
  loss(): void {
    this.tone(520, 0.28, 0.08, 'triangle', 220);
  }

  /** Combo milestone: a quick rising arpeggio and a cymbal. */
  milestone(count: number): void {
    const base = 523 * (count >= 50 ? 2 : count >= 25 ? 1.5 : 1);
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.16, 0.16, 'square', undefined, i * 0.06));
    this.noiseHit(0.5, 6000, 0.12, 'highpass', 0.18);
  }

  /** Tier change: a gauge "clunk" up or a hiss down. */
  tier(up: boolean): void {
    if (up) {
      this.tone(90, 0.25, 0.35, 'sine', 55);
      this.noiseHit(0.35, 1400, 0.2, 'bandpass', 0.05);
    } else {
      this.noiseHit(0.6, 3000, 0.12, 'highpass');
    }
  }

  /** QUAKE: an air-raid riser into a boom, then a brass stab chord. */
  quake(): void {
    this.tone(220, 0.9, 0.18, 'sawtooth', 880);
    this.tone(45, 1.2, 0.6, 'sine', 30, 0.85);
    this.noiseHit(1.2, 700, 0.5, 'lowpass', 0.85);
    for (const s of [0, 4, 7, 12]) this.tone(262 * 2 ** (s / 12), 0.45, 0.13, 'sawtooth', undefined, 0.95);
  }

  feverEnd(): void {
    this.noiseHit(1.4, 2500, 0.18, 'highpass');
    [12, 7, 4, 0].forEach((s, i) => this.tone(392 * 2 ** (s / 12), 0.2, 0.1, 'triangle', undefined, i * 0.09));
  }

  credit(): void {
    [0, 7, 12, 16].forEach((s, i) => this.tone(880 * 2 ** (s / 12), 0.1, 0.13, 'square', undefined, i * 0.05));
  }

  private out(): { ctx: AudioContext; master: GainNode } | null {
    if (!this.ctx || !this.master || this.muted || this.voices >= MAX_VOICES) return null;
    return { ctx: this.ctx, master: this.master };
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType, slideTo?: number, delay = 0): void {
    const o = this.out();
    if (!o) return;
    const t = o.ctx.currentTime + delay;
    const osc = o.ctx.createOscillator();
    const env = o.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(o.master);
    this.track(osc, t, dur);
  }

  private noiseHit(dur: number, freq: number, gain: number, type: BiquadFilterType, delay = 0): void {
    const o = this.out();
    if (!o || !this.noise) return;
    const t = o.ctx.currentTime + delay;
    const src = o.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = o.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = o.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(o.master);
    this.track(src, t, dur);
  }

  private track(node: AudioScheduledSourceNode, t: number, dur: number): void {
    this.voices++;
    node.onended = () => this.voices--;
    node.start(t);
    node.stop(t + dur + 0.02);
  }
}
