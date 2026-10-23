/**
 * How many device pixels to render per CSS pixel. Fill rate is what slows a phone
 * down most here (frame time scales with pixel count), so: start sharp, capped at 2,
 * and if frames stay slow, step down until the phone keeps up. It never steps back
 * up, so the picture doesn't flicker between sharp and soft.
 */
export const PIXEL_RATIO = {
  max: 2,
  min: 1,
  step: 0.5,
  /** Average frame interval (ms) above which it steps down: under ~38 fps. */
  slowMs: 26,
  /** Time averaged per decision (ms), and the fewest frames that decision needs. */
  windowMs: 1000,
  windowFrames: 5,
  /** Frames ignored at start-up (shader compiles, texture uploads) and after each change. */
  warmup: 10,
  /** A single frame longer than this is a hitch (tab switch, GC), not steady load. */
  hitchMs: 250,
} as const;

export interface PixelRatioGovernor {
  ratio(): number;
  /** Reports one frame's interval; returns the new ratio when it changes, else null. */
  frame(dtMs: number): number | null;
}

export function createPixelRatioGovernor(devicePixelRatio: number): PixelRatioGovernor {
  let ratio = Math.min(devicePixelRatio || 1, PIXEL_RATIO.max);
  const floor = Math.min(ratio, PIXEL_RATIO.min);
  let seen = 0;
  let sum = 0;
  let count = 0;
  return {
    ratio: () => ratio,
    frame(dt) {
      if (++seen <= PIXEL_RATIO.warmup || dt > PIXEL_RATIO.hitchMs || ratio <= floor) return null;
      sum += dt;
      if (++count < PIXEL_RATIO.windowFrames || sum < PIXEL_RATIO.windowMs) return null;
      const slow = sum / count > PIXEL_RATIO.slowMs;
      sum = count = 0;
      if (!slow) return null;
      ratio = Math.max(floor, ratio - PIXEL_RATIO.step);
      // The new size costs a frame or two to settle; don't judge those.
      seen = 0;
      return ratio;
    },
  };
}

/**
 * MSAA costs ~20% frame time (measured under swiftshader at ratio 1) and is
 * invisible at 2+ device pixels per CSS pixel, which is nearly every phone.
 * Decided once from the device, since the renderer can't change it later.
 */
export const wantsAntialias = (devicePixelRatio: number) => (devicePixelRatio || 1) < 2;
