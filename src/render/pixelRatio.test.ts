import { describe, expect, it } from 'vitest';
import { createPixelRatioGovernor, wantsAntialias } from './pixelRatio';

/** Feeds `n` frames of `dtMs` and returns the ratios it switched to. */
const run = (g: ReturnType<typeof createPixelRatioGovernor>, n: number, dtMs: number) => {
  const changes: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = g.frame(dtMs);
    if (r !== null) changes.push(r);
  }
  return changes;
};

describe('pixel ratio: sharp where the phone keeps up, lower where it does not', () => {
  it('starts at the device pixel ratio, capped at 2', () => {
    expect(createPixelRatioGovernor(3).ratio()).toBe(2);
    expect(createPixelRatioGovernor(2.75).ratio()).toBe(2);
    expect(createPixelRatioGovernor(1.5).ratio()).toBe(1.5);
    expect(createPixelRatioGovernor(1).ratio()).toBe(1);
  });

  it('stays put on a phone that holds 60 fps', () => {
    const g = createPixelRatioGovernor(3);
    expect(run(g, 2000, 16.7)).toEqual([]);
    expect(g.ratio()).toBe(2);
  });

  it('steps down 2 → 1.5 → 1 while frames stay slow, and no lower than 1', () => {
    const g = createPixelRatioGovernor(3);
    expect(run(g, 2000, 50)).toEqual([1.5, 1]);
    expect(g.ratio()).toBe(1);
  });

  it('reacts within a few seconds even on a very slow device', () => {
    const g = createPixelRatioGovernor(3);
    expect(run(g, 40, 140)).toEqual([1.5, 1]); // 40 frames = 5.6 s
  });

  it('never steps back up once it has stepped down', () => {
    const g = createPixelRatioGovernor(3);
    run(g, 400, 50);
    const lowered = g.ratio();
    expect(run(g, 3000, 8)).toEqual([]);
    expect(g.ratio()).toBe(lowered);
  });

  it('ignores the first frames (shader compiles) and one-off hitches such as a tab switch', () => {
    const g = createPixelRatioGovernor(2);
    expect(run(g, 10, 200)).toEqual([]); // start-up
    const changes: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const r = g.frame(i % 100 === 0 ? 2000 : 16.7);
      if (r !== null) changes.push(r);
    }
    expect(changes).toEqual([]);
  });
});

describe('antialiasing (MSAA) only where edges would show', () => {
  it('is on for screens under 2 device pixels per CSS pixel and off for phone screens at 2 and up', () => {
    expect(wantsAntialias(1)).toBe(true);
    expect(wantsAntialias(1.5)).toBe(true);
    expect(wantsAntialias(2)).toBe(false);
    expect(wantsAntialias(3)).toBe(false);
  });
});
