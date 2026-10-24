import { describe, expect, it } from 'vitest';
import { track, type Keys } from './motion';

const slope = (keys: Keys, t: number, h = 1e-6) => (track(keys, t + h)[0] - track(keys, t - h)[0]) / (2 * h);

describe('track (Catmull-Rom through keyframes)', () => {
  const keys: Keys = [
    [0, [0, 10]],
    [1, [2, 10]],
    [1.5, [1, 4]],
    [3, [5, 0]],
  ];

  it('passes exactly through every key', () => {
    expect(track(keys, 0)).toEqual([0, 10]);
    expect(track(keys, 1)).toEqual([2, 10]);
    expect(track(keys, 1.5)).toEqual([1, 4]);
    expect(track(keys, 3)).toEqual([5, 0]);
  });

  it('holds the first and last key outside the track', () => {
    expect(track(keys, -2)).toEqual([0, 10]);
    expect(track(keys, 9)).toEqual([5, 0]);
  });

  it('flows through an inner key instead of stopping on it', () => {
    // Neighbours of the key at t = 1 are 0 and 1 (value) at t = 0 and 1.5: slope (1 − 0) / 1.5.
    expect(slope(keys, 1)).toBeCloseTo(1 / 1.5, 3);
    expect(slope(keys, 1.5)).toBeCloseTo((5 - 2) / (3 - 1), 3);
  });

  it('has no kink at a key with uneven spacing on either side', () => {
    const h = 1e-6;
    const left = (track(keys, 1.5)[0] - track(keys, 1.5 - h)[0]) / h;
    const right = (track(keys, 1.5 + h)[0] - track(keys, 1.5)[0]) / h;
    expect(right).toBeCloseTo(left, 2);
  });

  it('eases in and out at the ends of the track', () => {
    expect(slope(keys, 1e-3)).toBeCloseTo(0, 1);
    expect(slope(keys, 3 - 1e-3)).toBeCloseTo(0, 1);
  });

  it('is a straight line between inner keys that lie on one', () => {
    const line: Keys = [
      [0, [0]],
      [1, [2]],
      [3, [6]],
      [4, [8]],
      [5, [10]],
    ];
    expect(track(line, 2)[0]).toBeCloseTo(4, 9);
    expect(track(line, 3.5)[0]).toBeCloseTo(7, 9);
  });

  it('writes into the out array when given one', () => {
    const out = [0, 0];
    expect(track(keys, 0.5, out)).toBe(out);
  });
});
