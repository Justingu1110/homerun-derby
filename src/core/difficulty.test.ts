import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, startRound, type DifficultyId, type Pitch, type PitchType, type SpeedLevel } from './index';

const fixed = (v: number) => () => v;

/** Seeded random source (LCG), so a run is repeatable but covers [0, 1). */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Throws `count` pitches on this 難度, hitting each one out (a perfect swing) so the round never ends. */
const throwPitches = (difficulty: DifficultyId, count: number, random = seeded(7)): Pitch[] => {
  const round = startRound({ random, difficulty });
  const pitches: Pitch[] = [];
  for (let i = 0; i < count; i++) {
    const pitch = round.nextPitch();
    pitches.push(pitch);
    round.swing(pitch.contactMs);
  }
  return pitches;
};

const setOf = <T>(items: T[]) => new Set(items);

describe('難度: a fixed 難度倍率 each, and 全壘打 score 100 × it', () => {
  it.each<[DifficultyId, number, number]>([
    ['easy', 1.0, 100],
    ['normal', 1.3, 130],
    ['hard', 1.6, 160],
    ['expert', 2.0, 200],
    ['hell', 2.5, 250],
  ])('%s: ×%d, %d points per 全壘打', (difficulty, multiplier, points) => {
    const round = startRound({ random: fixed(0.5), difficulty });
    expect(round.state().multiplier).toBe(multiplier);
    const pitch = round.nextPitch();
    expect(round.swing(pitch.contactMs)!).toMatchObject({ kind: 'homeRun', timing: 'perfect' });
    expect(round.state().score).toBe(points);
  });

  it('a round reports its 難度 (so the screen knows which 投手 pitches)', () => {
    expect(startRound({ random: fixed(0.5), difficulty: 'hard' }).state().difficulty).toBe('hard');
  });

  it('lists the five 難度 in order, each with its 投手', () => {
    expect(DIFFICULTIES.map((d) => [d.id, d.name, d.pitcher])).toEqual([
      ['easy', '簡易', 'Luna'],
      ['normal', '普通', 'Glasnow'],
      ['hard', '困難', 'Snell'],
      ['expert', '極難', 'Otani'],
      ['hell', '地獄', 'Yamamoto'],
    ]);
  });
});

describe('球種 and 球速 levels: only what the 難度 throws', () => {
  it.each<[DifficultyId, PitchType[], SpeedLevel[]]>([
    ['easy', ['fastball'], ['slow']],
    ['normal', ['fastball', 'changeup'], ['medium']],
    ['hard', ['fastball', 'changeup', 'curveball'], ['medium']],
    ['expert', ['fastball', 'changeup', 'curveball'], ['fast']],
    ['hell', ['fastball', 'changeup', 'curveball'], ['slow', 'medium', 'fast']],
  ])('%s throws exactly %j at %j', (difficulty, types, speeds) => {
    const pitches = throwPitches(difficulty, 300);
    expect(setOf(pitches.map((p) => p.type))).toEqual(setOf(types));
    expect(setOf(pitches.map((p) => p.speed))).toEqual(setOf(speeds));
  });

  it('地獄 mixes 慢, 中 and 快 in about equal shares', () => {
    const pitches = throwPitches('hell', 600);
    for (const speed of ['slow', 'medium', 'fast'] as const) {
      expect(pitches.filter((p) => p.speed === speed).length / pitches.length).toBeGreaterThan(0.25);
    }
  });
});

describe('球速 (mph): inside the range of its 球種 and level', () => {
  /** The ranges from the ticket (原型 v6). */
  const RANGES: Record<PitchType, Record<SpeedLevel, [number, number]>> = {
    fastball: { slow: [78, 82], medium: [86, 90], fast: [94, 99] },
    changeup: { slow: [68, 72], medium: [76, 80], fast: [84, 88] },
    curveball: { slow: [62, 66], medium: [70, 74], fast: [78, 82] },
  };

  it('every pitch of every 難度 has an mph inside its range, and they vary', () => {
    for (const { id } of DIFFICULTIES) {
      const pitches = throwPitches(id, 200);
      for (const p of pitches) {
        const [min, max] = RANGES[p.type][p.speed];
        expect(p.mph).toBeGreaterThanOrEqual(min);
        expect(p.mph).toBeLessThanOrEqual(max);
      }
      expect(Math.max(...pitches.map((p) => p.mph))).toBeGreaterThan(Math.min(...pitches.map((p) => p.mph)));
    }
  });

  it('at the same level, 直球 > 變速球 > 曲球', () => {
    const pitches = throwPitches('hell', 900);
    for (const speed of ['slow', 'medium', 'fast'] as const) {
      const mph = (type: PitchType) => pitches.filter((p) => p.speed === speed && p.type === type).map((p) => p.mph);
      expect(Math.min(...mph('fastball'))).toBeGreaterThan(Math.max(...mph('changeup')));
      expect(Math.min(...mph('changeup'))).toBeGreaterThan(Math.max(...mph('curveball')));
    }
  });

  it('a faster pitch reaches the plate sooner; the windup is the same', () => {
    const pitches = throwPitches('hell', 200).sort((a, b) => a.mph - b.mph);
    const slowest = pitches[0];
    const fastest = pitches[pitches.length - 1];
    expect(fastest.releaseMs).toBe(slowest.releaseMs);
    expect(fastest.flightMs).toBeLessThan(slowest.flightMs);
    // 17.4 m from release to the plate: 80 mph (35.76 m/s) takes about 487 ms.
    const p80 = startRound({ random: fixed(0.5), difficulty: 'easy' }).nextPitch();
    expect(p80.mph).toBeCloseTo(80);
    expect(p80.flightMs).toBeCloseTo(487, 0);
  });

  it('timing is judged against each pitch’s own contact moment', () => {
    const round = startRound({ random: seeded(3), difficulty: 'hell' });
    for (let i = 0; i < 30; i++) {
      const pitch = round.nextPitch();
      expect(round.swing(pitch.contactMs)!).toMatchObject({ kind: 'homeRun', timing: 'perfect' });
    }
  });
});

describe('球種 behave differently in flight', () => {
  it('a 曲球 drops in flight; 直球 and 變速球 fly straight', () => {
    const pitches = throwPitches('hard', 100);
    for (const p of pitches) {
      if (p.type === 'curveball') expect(p.dropM).toBeGreaterThan(0);
      else expect(p.dropM).toBe(0);
    }
  });
});
