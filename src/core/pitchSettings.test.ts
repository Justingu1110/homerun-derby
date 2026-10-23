import { describe, expect, it } from 'vitest';
import { TUNING, difficultyMultiplier, startRound, type Pitch, type PitchSettings, type PitchType } from './index';

const fixed = (v: number) => () => v;

/** Seeded random source (LCG), so a run is repeatable but covers [0, 1). */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Throws `count` pitches, hitting each one out (a perfect swing) so the round never ends. */
const throwPitches = (settings: PitchSettings, count: number, random = seeded(7)): Pitch[] => {
  const round = startRound({ random, pitchSettings: settings });
  const pitches: Pitch[] = [];
  for (let i = 0; i < count; i++) {
    pitches.push(round.nextPitch());
    round.swing(0);
  }
  return pitches;
};

const typesOf = (pitches: Pitch[]) => new Set(pitches.map((p) => p.type));

describe('難度倍率 = 球速倍率 + 0.2 × (球種數 − 1)', () => {
  it('慢速 + 只有直球 = ×1.0', () => {
    expect(difficultyMultiplier({ types: ['fastball'], speed: 'slow' })).toBe(1);
  });

  it('快速 + 三種球種 = ×2.0', () => {
    expect(difficultyMultiplier({ types: ['fastball', 'changeup', 'curveball'], speed: 'fast' })).toBe(2);
  });

  it.each<[PitchSettings, number]>([
    [{ types: ['fastball'], speed: 'medium' }, 1.3],
    [{ types: ['curveball'], speed: 'fast' }, 1.6],
    [{ types: ['fastball', 'curveball'], speed: 'slow' }, 1.2],
    [{ types: ['changeup', 'curveball'], speed: 'medium' }, 1.5],
    [{ types: ['fastball', 'changeup', 'curveball'], speed: 'slow' }, 1.4],
  ])('%j → ×%d', (settings, expected) => {
    expect(difficultyMultiplier(settings)).toBe(expected);
  });

  it('a round reports the multiplier of its 投球設定 and scores 100 × it per home run', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: { types: ['fastball', 'changeup', 'curveball'], speed: 'fast' } });
    expect(round.state().multiplier).toBe(2);
    round.nextPitch();
    expect(round.swing(0).kind).toBe('homeRun');
    expect(round.state().score).toBe(200);
  });

  it('a round without 投球設定 uses the default: 直球, 中速 (×1.3)', () => {
    const round = startRound({ random: fixed(0.5) });
    expect(round.state().multiplier).toBe(1.3);
    round.nextPitch();
    round.swing(0);
    expect(round.state().score).toBe(130);
  });
});

describe('球種: each pitch is one of the checked 球種', () => {
  it.each<{ types: PitchType[] }>([
    { types: ['fastball'] },
    { types: ['changeup'] },
    { types: ['curveball'] },
    { types: ['fastball', 'curveball'] },
    { types: ['changeup', 'curveball'] },
  ])('only $types appear', ({ types }) => {
    expect(typesOf(throwPitches({ types, speed: 'medium' }, 200))).toEqual(new Set(types));
  });

  it('with all three checked, the pitcher mixes all three', () => {
    const pitches = throwPitches({ types: ['fastball', 'changeup', 'curveball'], speed: 'fast' }, 300);
    for (const type of ['fastball', 'changeup', 'curveball'] as const) {
      const share = pitches.filter((p) => p.type === type).length / pitches.length;
      expect(share).toBeGreaterThan(0.2);
    }
  });
});

describe('球速: each 球種 stays inside a small range for the chosen level', () => {
  const speeds = (type: PitchType, speed: PitchSettings['speed']) => throwPitches({ types: [type], speed }, 200).map((p) => p.speedKmh);

  it.each<{ type: PitchType; speed: PitchSettings['speed'] }>(
    (['fastball', 'changeup', 'curveball'] as const).flatMap((type) => (['slow', 'medium', 'fast'] as const).map((speed) => ({ type, speed }))),
  )('$type at $speed is inside TUNING.pitch.speedKmh and varies by at most 6 km/h', ({ type, speed }) => {
    const all = speeds(type, speed);
    const { min, max } = TUNING.pitch.speedKmh[type][speed];
    for (const v of all) {
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(0);
    expect(max - min).toBeLessThanOrEqual(6);
  });

  it('slow < medium < fast for every 球種', () => {
    for (const type of ['fastball', 'changeup', 'curveball'] as const) {
      expect(Math.max(...speeds(type, 'slow'))).toBeLessThan(Math.min(...speeds(type, 'medium')));
      expect(Math.max(...speeds(type, 'medium'))).toBeLessThan(Math.min(...speeds(type, 'fast')));
    }
  });
});

describe('球種 behave differently in flight', () => {
  const one = (type: PitchType) => throwPitches({ types: [type], speed: 'medium' }, 1, fixed(0.5))[0];

  it('a 變速球 has the same windup as a 直球 but reaches the plate later', () => {
    const fastball = one('fastball');
    const changeup = one('changeup');
    expect(changeup.releaseMs).toBe(fastball.releaseMs);
    expect(changeup.speedKmh).toBeLessThan(fastball.speedKmh);
    expect(changeup.flightMs).toBeGreaterThan(fastball.flightMs);
    expect(changeup.contactMs).toBeGreaterThan(fastball.contactMs);
  });

  it('a 曲球 is slower than a 直球 and drops in flight; the others fly straight', () => {
    const fastball = one('fastball');
    const curveball = one('curveball');
    expect(curveball.flightMs).toBeGreaterThan(fastball.flightMs);
    expect(curveball.dropM).toBeGreaterThan(0);
    expect(fastball.dropM).toBe(0);
    expect(one('changeup').dropM).toBe(0);
  });

  it('timing is judged against each pitch’s own contact moment', () => {
    for (const type of ['fastball', 'changeup', 'curveball'] as const) {
      const round = startRound({ random: fixed(0.5), pitchSettings: { types: [type], speed: 'fast' } });
      round.nextPitch();
      expect(round.swing(0)).toMatchObject({ kind: 'homeRun', timing: 'perfect' });
    }
  });
});
