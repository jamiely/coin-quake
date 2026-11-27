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

/** Voice cap; celebrations stack the jackpot march, fireworks and cheers, so it leaves headroom for those. */
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

  /** A coin landing; `intensity` 0..1, `pitch` scales it by coin kind (dimes ring high, lead thuds). Throttled. */
  clink(intensity: number, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastClink > 0.1) {
      this.lastClink = now;
      this.clinksInWindow = 0;
    }
    if (++this.clinksInWindow > 6) return;
    const f = (2600 + Math.random() * 1600) * pitch;
    this.tone(f, 0.09, 0.12 * (0.4 + intensity), 'triangle');
    this.tone(f * 1.51, 0.06, 0.05 * (0.4 + intensity), 'sine');
  }

  /**
   * A dropped coin slamming into the pile: a pitch-varied low thud, a metal crash scaled by how many coins it hit,
   * and a scatter of clinks for the blasted coins. `strength` 0..1.
   */
  slam(strength: number, hit: number, pitch = 1): void {
    const vary = (0.85 + Math.random() * 0.3) * pitch;
    this.tone(120 * vary, 0.16, 0.25 + 0.3 * strength, 'sine', 55 * vary);
    this.noiseHit(0.08 + 0.1 * strength, 900 * vary, 0.18 + 0.2 * strength, 'lowpass');
    this.noiseHit(0.12 + 0.12 * Math.min(1, hit / 6), 4500 * vary, 0.06 + 0.05 * Math.min(1, hit / 6), 'highpass', 0.005);
    this.clink(0.6 + 0.4 * strength, pitch);
    for (let i = 0; i < Math.min(3, Math.floor(hit / 2)); i++) this.delayedClink(0.03 + i * 0.045, 0.3 + 0.2 * strength);
  }

  private delayedClink(delay: number, intensity: number): void {
    const f = 2400 + Math.random() * 1800;
    this.tone(f, 0.08, 0.1 * intensity, 'triangle', undefined, delay);
    this.tone(f * 1.51, 0.05, 0.04 * intensity, 'sine', undefined, delay);
  }

  /** Peg ping: a bright bell whose pitch depends on the peg (a xylophone across the field), slightly varied. */
  peg(index: number): void {
    const semis = PENTATONIC[index % 5]! + 12 * (Math.floor(index / 5) % 2);
    const f = 880 * 2 ** (semis / 12) * (0.98 + Math.random() * 0.04);
    this.tone(f, 0.14, 0.09, 'triangle');
    this.tone(f * 2.01, 0.08, 0.03, 'sine');
  }

  /** Gear fling: a ratchet clatter and a spring twang. */
  ratchet(): void {
    for (let i = 0; i < 4; i++) this.noiseHit(0.025, 2200 + i * 200, 0.1, 'bandpass', i * 0.022);
    this.tone(240 * (0.9 + Math.random() * 0.2), 0.2, 0.08, 'triangle', 520);
  }

  /** The pipe loop: a rising whoosh in, a fast slide-whistle out. */
  whoosh(out: boolean): void {
    this.noiseHit(out ? 0.25 : 0.4, out ? 2600 : 1200, 0.12, 'bandpass');
    if (out) this.tone(500, 0.22, 0.08, 'sine', 1600);
  }

  /** Flipper: a solenoid thwack. */
  flipper(): void {
    this.tone(95, 0.08, 0.3, 'square', 60);
    this.noiseHit(0.05, 1800, 0.18, 'bandpass');
  }

  /** Tesla zap: crackling high noise plus a buzzing saw. */
  zap(): void {
    this.noiseHit(0.14, 6000, 0.12, 'highpass');
    this.tone(110 + Math.random() * 40, 0.12, 0.07, 'sawtooth', 70);
    this.noiseHit(0.06, 9000, 0.08, 'highpass', 0.05);
  }

  /**
   * A front payout: a chunky coin clink (body thunk plus a bright metal ring, at the coin's pitch) climbing a
   * semitone with each coin in the chain, over a pickup chime on the combo ladder. Bonus coins add a sparkle.
   */
  payout(combo: number, hot: boolean, pitch = 1, bonus = false): void {
    const step = Math.min(combo - 1, 24);
    const climb = 2 ** (Math.min(combo - 1, 18) / 12);
    const ring = 1900 * pitch * climb * (0.98 + Math.random() * 0.04);
    this.tone(180 * pitch, 0.07, 0.22, 'sine', 90 * pitch);
    this.noiseHit(0.04, 3200 * pitch, 0.12, 'bandpass');
    this.tone(ring, 0.22, 0.11, 'triangle');
    this.tone(ring * 2.76, 0.14, 0.035, 'sine');
    const semis = 12 * Math.floor(step / 5) + PENTATONIC[step % 5]!;
    const f = 660 * 2 ** (semis / 12);
    this.tone(f, 0.12, 0.13, 'square', f * 1.02, 0.02);
    this.tone(f * 2, 0.09, 0.06, 'sine', undefined, 0.02);
    if (hot) this.tone(f * 1.5, 0.16, 0.1, 'sawtooth', f * 1.6, 0.02);
    if (bonus) for (let i = 0; i < 4; i++) this.tone(2600 * 2 ** (PENTATONIC[i]! / 12), 0.09, 0.05, 'sine', undefined, 0.05 + i * 0.04);
  }

  /** A prize figurine over the edge: a squeaky-toy honk, a gong and a rising fanfare stab. */
  prize(): void {
    this.tone(620, 0.12, 0.16, 'square', 980);
    this.tone(980, 0.14, 0.12, 'square', 520, 0.12);
    this.tone(80, 1.2, 0.4, 'sine', 70, 0.05);
    this.noiseHit(1.2, 1400, 0.12, 'bandpass', 0.05);
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.2, 0.12, 'sawtooth', undefined, 0.25 + i * 0.07));
  }

  /** Dump siren: a two-tone warble rising, about `seconds` long. */
  siren(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.4) {
      this.tone(660, 0.2, 0.09, 'square', 880, t);
      this.tone(880, 0.2, 0.09, 'square', 660, t + 0.2);
    }
  }

  /** The dump crashing down: a deep boom and a long metallic avalanche hiss. */
  avalanche(): void {
    this.tone(55, 0.8, 0.55, 'sine', 32);
    this.noiseHit(1.6, 2600, 0.28, 'bandpass');
    this.noiseHit(1.2, 7000, 0.12, 'highpass', 0.1);
    for (let i = 0; i < 8; i++) this.delayedClink(0.05 + i * 0.09, 0.8);
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
   * Coin Quake's own celebration theme, "The Jackpot March" (an original tune, written for this game): a brassy, clanky
   * oompah march in Bb at ~150 bpm. A tuba pumps root-fifth on the beats, honky muted-brass chords stab the offbeats,
   * a trumpet lead strutts a coin-counting melody, cash-register dings land on bar downbeats and a coin cascade
   * shimmers across the bars, then a ragtime stop-time tag slams into a big final chord with a register "ka-ching".
   * About 5 s, for the MEGA QUAKE tally and the GAME OVER finale.
   */
  fanfare(): void {
    if (!this.ctx || this.muted) return;
    const beat = 0.4;
    const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
    // Four bars of march (Bb, Eb, F7, Bb), then a two-bar ragtime tag.
    const bars: { root: number; fifth: number; chord: number[] }[] = [
      { root: 46, fifth: 53, chord: [62, 65, 70] },
      { root: 51, fifth: 46, chord: [63, 67, 70] },
      { root: 53, fifth: 48, chord: [63, 69, 72] },
      { root: 46, fifth: 53, chord: [62, 65, 70] },
    ];
    // Melody, [midi, beats]: a strutting pickup figure that climbs like coins stacking, then tumbles back down.
    const lead: [number, number][] = [
      [70, 0.5], [72, 0.5], [74, 1], [77, 1], [74, 0.5], [77, 0.5],
      [79, 1], [75, 0.5], [79, 0.5], [82, 1], [79, 1],
      [81, 0.5], [79, 0.5], [77, 0.5], [75, 0.5], [74, 1], [72, 1],
      [74, 0.5], [77, 0.5], [82, 1.5], [0, 0.5], [82, 1],
    ];
    bars.forEach((bar, b) => {
      const t0 = b * 4 * beat;
      for (let i = 0; i < 4; i++) {
        // Oompah: tuba on 1 and 3 (root, then fifth), honky brass chord stabs on 2 and 4.
        const t = t0 + i * beat;
        if (i % 2 === 0) this.tuba(hz(i === 0 ? bar.root : bar.fifth), beat * 0.7, t);
        else for (const n of bar.chord) this.honk(hz(n), beat * 0.32, t);
      }
      // A cash-register ding on each bar's downbeat, and a little coin cascade running up the bar.
      this.ding(t0, 1 + b * 0.06);
      this.cascade(t0 + beat * 1.5, 6 + b * 2, beat * 2);
    });
    let t = 0;
    for (const [n, len] of lead) {
      if (n) this.brass(hz(n), beat * len * 0.9, t, 0.08);
      t += beat * len;
    }
    // Ragtime stop-time tag: hits on 1 and the "and" of 2, a chromatic tuba walk-up, then the big chord.
    const tag = 4 * 4 * beat;
    for (const [off, gain] of [[0, 0.11], [beat * 1.5, 0.11]] as const) {
      for (const n of [58, 62, 65, 70]) this.honk(hz(n), beat * 0.4, tag + off, gain);
      this.tuba(hz(46), beat * 0.4, tag + off);
    }
    [41, 42, 43, 44, 45].forEach((n, i) => this.tuba(hz(n), beat * 0.28, tag + beat * 2.2 + i * beat * 0.3));
    const end = tag + beat * 4;
    for (const n of [58, 62, 65, 70, 74, 77]) this.brass(hz(n), beat * 3, end, 0.07);
    this.tuba(hz(34), beat * 3, end);
    this.cascade(end, 18, beat * 2.5);
    this.ding(end + beat * 0.1, 1.5);
    this.noiseHit(2.2, 6500, 0.1, 'highpass', end);
    this.tone(55, 0.6, 0.45, 'sine', 35, end);
  }

  /** Oompah tuba: a round low saw through a low-pass, with a soft lip "bop" attack. */
  private tuba(freq: number, dur: number, delay: number): void {
    const o = this.out(delay, dur);
    if (!o) return;
    const t = o.ctx.currentTime + delay;
    const osc = o.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
    const filter = o.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 4;
    const env = o.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(env).connect(o.master);
    this.track(osc, t, dur);
  }

  /** A honky muted-brass stab: a square wave through a nasal band-pass, short and punchy. */
  private honk(freq: number, dur: number, delay: number, gain = 0.06): void {
    const o = this.out(delay, dur);
    if (!o) return;
    const t = o.ctx.currentTime + delay;
    const osc = o.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const nose = o.ctx.createBiquadFilter();
    nose.type = 'bandpass';
    nose.frequency.value = Math.min(4000, freq * 2.5);
    nose.Q.value = 2.5;
    const env = o.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(nose).connect(env).connect(o.master);
    this.track(osc, t, dur);
  }

  /** A cash-register ding: a bright bell pair plus the drawer's clack. */
  private ding(delay: number, pitch = 1): void {
    this.tone(2093 * pitch, 0.5, 0.09, 'sine', undefined, delay);
    this.tone(3136 * pitch, 0.35, 0.05, 'sine', undefined, delay);
    this.noiseHit(0.04, 2200, 0.12, 'bandpass', delay);
  }

  /** A coin cascade: `count` bright clinks tumbling quickly across `span` seconds, rising in pitch. */
  private cascade(delay: number, count: number, span: number): void {
    for (let i = 0; i < count; i++) {
      const f = (2400 + (i / count) * 1600) * (0.95 + Math.random() * 0.1);
      const at = delay + (i / count) * span + Math.random() * 0.02;
      this.tone(f, 0.07, 0.05, 'triangle', undefined, at);
    }
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
