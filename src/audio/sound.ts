/**
 * Synthesized cartoon SFX (Web Audio, no files). Nothing is created before the first user gesture (`unlock`).
 * Coin clinks are throttled; the combo ladder climbs a major pentatonic scale, Peggle-style.
 */

const PENTATONIC = [0, 2, 4, 7, 9];
/** Most spans sounding at the same instant anywhere within [start, end). Peaks occur where a span begins. */
export function peakOverlap(spans: readonly [number, number][], start: number, end: number): number {
  let peak = 0;
  for (const t of [start, ...spans.map(([s]) => s).filter((s) => s > start && s < end)]) {
    let n = 0;
    for (const [s, e] of spans) if (s <= t && e > t) n++;
    peak = Math.max(peak, n);
  }
  return peak;
}

/** Voice cap; celebrations stack a fanfare, choir, fireworks and cheers, so it leaves headroom for those. */
const MAX_VOICES = 48;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** [start, end] audio-clock times of scheduled voices, to budget by what actually overlaps. */
  private spans: [number, number][] = [];
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

  /**
   * The core action, layered so it never sounds thin: a low mechanical thunk (body), a pneumatic hiss (claw), a
   * spring "boing" (cartoon), and the bright ring of the released coin (reward). `hot` adds a sizzle.
   */
  drop(hot = false): void {
    this.tone(150, 0.12, 0.38, 'sine', 70);
    this.noiseHit(0.05, 600, 0.22, 'lowpass');
    this.noiseHit(0.09, 3200, 0.14, 'highpass', 0.01);
    this.tone(330, 0.18, 0.09, 'triangle', 520, 0.02);
    this.tone(2350, 0.22, 0.08, 'sine', undefined, 0.03);
    this.tone(3530, 0.16, 0.04, 'sine', undefined, 0.03);
    if (hot) this.noiseHit(0.25, 5200, 0.1, 'highpass', 0.03);
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

  /**
   * A dropped coin slamming into the pile: a pitch-varied low thud, a metal crash scaled by how many coins it hit,
   * and a scatter of clinks for the blasted coins. `strength` 0..1.
   */
  slam(strength: number, hit: number): void {
    const vary = 0.85 + Math.random() * 0.3;
    this.tone(120 * vary, 0.16, 0.25 + 0.3 * strength, 'sine', 55 * vary);
    this.noiseHit(0.08 + 0.1 * strength, 900 * vary, 0.18 + 0.2 * strength, 'lowpass');
    this.noiseHit(0.12 + 0.12 * Math.min(1, hit / 6), 4500 * vary, 0.06 + 0.05 * Math.min(1, hit / 6), 'highpass', 0.005);
    this.clink(0.6 + 0.4 * strength);
    for (let i = 0; i < Math.min(3, Math.floor(hit / 2)); i++) this.delayedClink(0.03 + i * 0.045, 0.3 + 0.2 * strength);
  }

  private delayedClink(delay: number, intensity: number): void {
    const f = 2400 + Math.random() * 1800;
    this.tone(f, 0.08, 0.1 * intensity, 'triangle', undefined, delay);
    this.tone(f * 1.51, 0.05, 0.04 * intensity, 'sine', undefined, delay);
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

  /**
   * Celebration fanfare: Beethoven's Ode to Joy (public domain) as a brass lead over a sustained "choir" (detuned
   * saws through a vowel-ish band-pass), timpani on the downbeats and a cymbal swell. About 4.5 s.
   */
  fanfare(): void {
    if (!this.ctx || this.muted) return;
    const beat = 0.27;
    // E E F G | G F E D | C C D E | E. D D (in D major here: F# F# G A | A G F# E | D D E F# | F#. E E)
    const ode: [number, number][] = [
      [66, 1], [66, 1], [67, 1], [69, 1], [69, 1], [67, 1], [66, 1], [64, 1],
      [62, 1], [62, 1], [64, 1], [66, 1], [66, 1.5], [64, 0.5], [64, 2],
    ];
    const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
    let t = 0;
    for (const [n, len] of ode) {
      this.brass(hz(n), beat * len * 0.95, t);
      this.brass(hz(n - 12), beat * len * 0.95, t, 0.05);
      t += beat * len;
    }
    // Choir pads: I – IV – V – I under the tune.
    const chords = [[62, 66, 69], [62, 67, 71], [61, 64, 69], [62, 66, 69]];
    chords.forEach((chord, i) => chord.forEach((n) => this.choir(hz(n), beat * 4.2, i * beat * 4)));
    for (let i = 0; i < 4; i++) this.tone(65, 0.5, 0.45, 'sine', 40, i * beat * 4);
    this.noiseHit(3.4, 7000, 0.08, 'highpass', 0.6);
    this.noiseHit(1.6, 5000, 0.16, 'highpass', t - 0.2);
  }

  /** One firework: a rising whistle, then a boom and crackle. */
  firework(delay = 0): void {
    this.tone(900 + Math.random() * 500, 0.35, 0.04, 'sine', 2400, delay);
    this.tone(60, 0.5, 0.35, 'sine', 35, delay + 0.36);
    this.noiseHit(0.6, 1800, 0.22, 'bandpass', delay + 0.36);
    this.noiseHit(0.9, 6000, 0.07, 'highpass', delay + 0.45);
  }

  /** Crowd cheer: band-passed noise swelling, with a few whistle blips. */
  cheer(): void {
    this.noiseHit(2.2, 1200, 0.2, 'bandpass');
    this.noiseHit(1.8, 2600, 0.1, 'bandpass', 0.15);
    for (let i = 0; i < 3; i++) this.tone(1800 + i * 300, 0.25, 0.04, 'sine', 2600 + i * 200, 0.3 + i * 0.35);
  }

  private brass(freq: number, dur: number, delay: number, gain = 0.09): void {
    const o = this.out(delay, dur);
    if (!o) return;
    const t = o.ctx.currentTime + delay;
    const osc = o.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = o.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 1.5, t);
    filter.frequency.linearRampToValueAtTime(freq * 6, t + 0.05);
    filter.frequency.linearRampToValueAtTime(freq * 3, t + dur);
    const env = o.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    env.gain.setValueAtTime(gain * 0.8, t + dur * 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(env).connect(o.master);
    this.track(osc, t, dur);
  }

  private choir(freq: number, dur: number, delay: number): void {
    for (const detune of [-9, 7]) {
      const o = this.out(delay, dur);
      if (!o) return;
      const t = o.ctx.currentTime + delay;
      const osc = o.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const vowel = o.ctx.createBiquadFilter();
      vowel.type = 'bandpass';
      vowel.frequency.value = 800;
      vowel.Q.value = 3;
      const env = o.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.045, t + 0.35);
      env.gain.setValueAtTime(0.045, t + dur - 0.4);
      env.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(vowel).connect(env).connect(o.master);
      this.track(osc, t, dur);
    }
  }

  credit(): void {
    [0, 7, 12, 16].forEach((s, i) => this.tone(880 * 2 ** (s / 12), 0.1, 0.13, 'square', undefined, i * 0.05));
  }

  /**
   * Context for a new voice starting `delay` s from now and lasting `dur`, or null when muted or when MAX_VOICES
   * voices already sound at that start. Future notes count only while they overlap, so a long scheduled fanfare does
   * not starve its own later chords or the sounds that follow it.
   */
  private out(delay = 0, dur = 0): { ctx: AudioContext; master: GainNode } | null {
    if (!this.ctx || !this.master || this.muted) return null;
    const now = this.ctx.currentTime;
    const start = now + delay;
    const end = start + dur + 0.02;
    this.spans = this.spans.filter(([, e]) => e > now);
    if (peakOverlap(this.spans, start, end) >= MAX_VOICES) return null;
    this.spans.push([start, end]);
    return { ctx: this.ctx, master: this.master };
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType, slideTo?: number, delay = 0): void {
    const o = this.out(delay, dur);
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
    const o = this.out(delay, dur);
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
    node.start(t);
    node.stop(t + dur + 0.02);
  }
}
