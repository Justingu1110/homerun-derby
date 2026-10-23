import { describe, expect, it } from 'vitest';
import { startRound, type PitchResult, type Round } from './index';

const fixed = (v: number) => () => v;
/** 隨機幅度 0, so a timing error always gives the same direction and 飛距離. */
const start = (random: () => number) => startRound({ random, randomness: 0 });

/**
 * Timing errors and where the ball goes at 隨機幅度 0 (see TUNING):
 * 0 ms → 0°, 150 m; ±12 ms → ±6.6°, 138 m; +28 ms → 15.4°, 122 m; −18 ms → −9.9°, 132 m.
 */
const swingOnce = (round: Round, err: number): PitchResult => {
  round.nextPitch();
  return round.swing(err);
};
const hit = (err: number, random = fixed(0.99)) => swingOnce(start(random), err);
const landingOf = (result: PitchResult) => {
  if (result.kind !== 'homeRun') throw new Error(`expected a home run, got ${result.out}`);
  return result.landing;
};
const facilityKind = (result: PitchResult) => {
  const landing = landingOf(result);
  return landing.kind === 'facility' ? landing.facility.kind : 'stands';
};

describe('a home run hits the 設施 in its direction and 飛距離, or lands in the stands', () => {
  it('a dead-centre perfect swing (0°, 150 m) hits the center-field scoreboard', () => {
    expect(facilityKind(hit(0))).toBe('scoreboard');
  });

  it('a slightly early perfect swing (−6.6°, 138 m) hits a left-field billboard', () => {
    expect(facilityKind(hit(-12))).toBe('billboard');
  });

  it('a slightly late perfect swing (6.6°, 138 m) hits a car on the right-center parking deck', () => {
    expect(facilityKind(hit(12))).toBe('car');
  });

  it('a late, short home run (15.4°, 122 m) hits the right light tower', () => {
    const landing = landingOf(hit(28));
    expect(landing).toMatchObject({ kind: 'facility', facility: { kind: 'lightTower' } });
    if (landing.kind === 'facility') expect(landing.facility.angle).toBeGreaterThan(0);
  });

  it('a home run between two billboards (−9.9°, 132 m) lands in the stands', () => {
    expect(landingOf(hit(-18))).toEqual({ kind: 'stands' });
  });

  it('the same direction and 飛距離 always hit the same facility', () => {
    const a = landingOf(hit(-12));
    const b = landingOf(hit(-12));
    expect(a.kind === 'facility' && b.kind === 'facility' && a.facility.id === b.facility.id).toBe(true);
  });
});

describe('打碎', () => {
  const smashed = (result: PitchResult) => {
    const landing = landingOf(result);
    if (landing.kind !== 'facility') throw new Error('expected a facility hit');
    return landing.smashed;
  };

  it('the farther the home run, the likelier the hit 打碎 the facility: the same roll smashes at 150 m but not at 122 m', () => {
    const roll = fixed(0.5);
    expect(smashed(hit(0, roll))).toBe(true); // scoreboard, 150 m
    expect(smashed(hit(28, roll))).toBe(false); // light tower, 122 m
  });

  it('a low roll smashes even a short hit, and a high roll leaves even a long hit intact', () => {
    expect(smashed(hit(28, fixed(0)))).toBe(true);
    expect(smashed(hit(0, fixed(0.99)))).toBe(false);
  });
});

describe('打碎 lasts for the rest of 一局', () => {
  it('a smashed facility is listed in the round state and stays 打碎 on later pitches', () => {
    const round = start(fixed(0));
    expect(round.state().smashed).toEqual([]);
    expect(landingOf(swingOnce(round, 0))).toMatchObject({ facility: { id: 'scoreboard' }, smashed: true });
    swingOnce(round, 400); // a whiff in between
    expect(round.state().smashed).toEqual(['scoreboard']);
  });

  it('hitting an already smashed facility again is still a hit on it, but it can’t be 打碎 twice', () => {
    const round = start(fixed(0));
    swingOnce(round, 0);
    expect(landingOf(swingOnce(round, 0))).toMatchObject({ kind: 'facility', facility: { id: 'scoreboard' }, smashed: false });
    expect(round.state().smashed).toEqual(['scoreboard']);
  });

  it('smashes add up across the round, in the order they happened', () => {
    const round = start(fixed(0));
    swingOnce(round, 12);
    swingOnce(round, -12);
    const ids = round.state().smashed;
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^car-/);
    expect(ids[1]).toMatch(/^billboard-/);
  });

  it('a new 一局 starts with every facility restored', () => {
    const first = start(fixed(0));
    swingOnce(first, 0);
    const next = start(fixed(0));
    expect(next.state().smashed).toEqual([]);
    expect(landingOf(swingOnce(next, 0))).toMatchObject({ facility: { id: 'scoreboard' }, smashed: true });
  });

  it('打碎 a facility does not change the 分數', () => {
    const smashing = start(fixed(0));
    const intact = start(fixed(0.99));
    expect(landingOf(swingOnce(smashing, 0))).toMatchObject({ smashed: true });
    expect(landingOf(swingOnce(intact, 0))).toMatchObject({ smashed: false });
    expect(smashing.state().score).toBe(intact.state().score);
    expect(smashing.state().score).toBe(100);
  });
});
