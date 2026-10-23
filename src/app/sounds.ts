/**
 * 音效 recipes, synthesized with Web Audio (no sound files). Each recipe plays
 * one sound into `out` starting at time `t` (AudioContext seconds).
 * To add a sound (e.g. 打碎, 全壘打演出), add an entry here; feedback.play(name)
 * picks it up by name.
 */
export type SoundRecipe = (ctx: AudioContext, out: AudioNode, t: number) => void;

export const SOUNDS = {
  /** 揮棒: a short whoosh. */
  swing(ctx, out, t) {
    const src = noise(ctx, 0.22);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(500, t);
    band.frequency.exponentialRampToValueAtTime(2400, t + 0.16);
    src.connect(band).connect(envelope(ctx, out, t, 0.35, 0.02, 0.2));
    src.start(t);
  },

  /** 擊球: a sharp crack over a low thump. */
  hit(ctx, out, t) {
    const crack = noise(ctx, 0.08);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1800;
    crack.connect(high).connect(envelope(ctx, out, t, 0.9, 0.002, 0.07));
    crack.start(t);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(190, t);
    thump.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    thump.connect(envelope(ctx, out, t, 0.8, 0.002, 0.14));
    thump.start(t);
    thump.stop(t + 0.16);
  },

  /** 全壘打: a rising fanfare arpeggio. */
  homeRun(ctx, out, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const at = t + i * 0.09;
      const last = i === notes.length - 1;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(envelope(ctx, out, at, 0.18, 0.005, last ? 0.5 : 0.12));
      osc.start(at);
      osc.stop(at + (last ? 0.55 : 0.15));
    });
  },
} satisfies Record<string, SoundRecipe>;

export type SoundName = keyof typeof SOUNDS;

/** A white-noise source of this length (s). */
function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

/** A gain node into `out` that rises to `peak` in `attack` s and decays over `decay` s. */
function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  gain.connect(out);
  return gain;
}
