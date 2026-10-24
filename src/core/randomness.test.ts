import { describe, expect, it } from 'vitest';
import { startRound, type PitchResult, type RandomSource } from './index';

const fixed = (v: number): RandomSource => () => v;

/** One pitch, one swing with this timing error, at this 隨機幅度 and random source. */
const swingOnce = (timingErrorMs: number, randomness: number | undefined, random: RandomSource): PitchResult => {
  const round = startRound({ random, randomness, difficulty: 'easy' });
  const pitch = round.nextPitch();
  return round.swing(pitch.contactMs + timingErrorMs)!;
};

/**
 * What 隨機幅度 decides: the kind, timing, ball and the 設施 it hits. Leaves out the
 * 打碎 roll, which takes the random source at any 隨機幅度 (see facilities.test.ts).
 */
const judged = (r: PitchResult) => ({
  kind: r.kind,
  timing: r.timing,
  ball: r.ball,
  hit: r.kind === 'homeRun' ? (r.landing.kind === 'facility' ? r.landing.facility.id : 'stands') : null,
});

/** Timing errors outside the perfect window that still put the bat on the ball. */
const CONTACT_ERRORS = [-60, -35, -20, 20, 35, 60];

describe('隨機幅度 0%: the same timing always gives the same result', () => {
  it('ignores the random source entirely', () => {
    for (const err of CONTACT_ERRORS) {
      const low = judged(swingOnce(err, 0, fixed(0)));
      const mid = judged(swingOnce(err, 0, fixed(0.5)));
      const high = judged(swingOnce(err, 0, fixed(0.999)));
      expect(low).toEqual(mid);
      expect(high).toEqual(mid);
    }
  });
});

describe('隨機幅度 above 0%: distance and direction vary within the set range', () => {
  const spread = (err: number, randomness: number) => {
    const base = swingOnce(err, 0, fixed(0.5)).ball!;
    const lo = swingOnce(err, randomness, fixed(0)).ball!;
    const hi = swingOnce(err, randomness, fixed(0.99999)).ball!;
    return { base, lo, hi };
  };

  it('the default is about ±5% 飛距離', () => {
    for (const err of CONTACT_ERRORS) {
      const base = swingOnce(err, 0, fixed(0.5)).ball!;
      const lo = swingOnce(err, undefined, fixed(0)).ball!;
      const hi = swingOnce(err, undefined, fixed(0.99999)).ball!;
      expect(lo.distance / base.distance).toBeCloseTo(0.95, 3);
      expect(hi.distance / base.distance).toBeCloseTo(1.05, 3);
    }
  });

  it('the range grows with 隨機幅度: 50% is ±10% 飛距離, 100% is ±20%', () => {
    for (const err of CONTACT_ERRORS) {
      const half = spread(err, 0.5);
      expect(half.lo.distance / half.base.distance).toBeCloseTo(0.9, 3);
      expect(half.hi.distance / half.base.distance).toBeCloseTo(1.1, 3);
      const full = spread(err, 1);
      expect(full.lo.distance / full.base.distance).toBeCloseTo(0.8, 3);
      expect(full.hi.distance / full.base.distance).toBeCloseTo(1.2, 3);
    }
  });

  it('the direction shifts by up to ±10° at 100% (±5° at 50%)', () => {
    for (const err of CONTACT_ERRORS) {
      const full = spread(err, 1);
      expect(full.lo.angle - full.base.angle).toBeCloseTo(-10, 2);
      expect(full.hi.angle - full.base.angle).toBeCloseTo(10, 2);
      const half = spread(err, 0.5);
      expect(half.lo.angle - half.base.angle).toBeCloseTo(-5, 2);
      expect(half.hi.angle - half.base.angle).toBeCloseTo(5, 2);
    }
  });

  it('every result stays inside the range for any random value', () => {
    for (const err of CONTACT_ERRORS) {
      const base = swingOnce(err, 0, fixed(0.5)).ball!;
      for (let i = 0; i < 50; i++) {
        const v = i / 50;
        const ball = swingOnce(err, 0.25, fixed(v)).ball!;
        expect(Math.abs(ball.distance / base.distance - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
        expect(Math.abs(ball.angle - base.angle)).toBeLessThanOrEqual(2.5 + 1e-9);
      }
    }
  });

  it('jittered results are judged by the same rules: a long ball can be pushed foul', () => {
    // 80 ms late is fair at 44°; at 100% the jitter can push it past the 45° foul line.
    expect(swingOnce(80, 0, fixed(0.5)).ball!.angle).toBeLessThanOrEqual(45);
    const r = swingOnce(80, 1, fixed(0.99999));
    expect(r.kind).toBe('out');
    expect(Math.abs(r.ball!.angle)).toBeGreaterThan(45);
  });
});

describe('隨機幅度 never touches a Perfect swing', () => {
  it('a swing inside the perfect window is the same home run at any 隨機幅度', () => {
    for (const err of [-15, -8, 0, 8, 15]) {
      const expected = swingOnce(err, 0, fixed(0.5));
      expect(expected).toMatchObject({ kind: 'homeRun', timing: 'perfect' });
      for (const randomness of [0.25, 0.5, 1]) {
        for (const v of [0, 0.3, 0.99999]) {
          expect(judged(swingOnce(err, randomness, fixed(v)))).toEqual(judged(expected));
        }
      }
    }
  });
});

describe('隨機幅度 does not change the 難度倍率', () => {
  it('the multiplier and the points per home run are the same at every 隨機幅度', () => {
    const at = (randomness: number) => {
      const round = startRound({ random: fixed(0.5), randomness, difficulty: 'easy' });
      const pitch = round.nextPitch();
      round.swing(pitch.contactMs)!;
      return round.state();
    };
    const baseline = at(0);
    for (const randomness of [0.25, 0.5, 1]) {
      expect(at(randomness).multiplier).toBe(baseline.multiplier);
      expect(at(randomness).score).toBe(baseline.score);
    }
  });
});

describe('隨機幅度 outside 0–100% is rejected', () => {
  it('throws for a negative or above-100% value', () => {
    for (const randomness of [-0.01, 1.01, Number.NaN]) {
      expect(() => startRound({ random: fixed(0.5), randomness, difficulty: 'easy' })).toThrow(RangeError);
    }
  });
});
