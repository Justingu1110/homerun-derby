import { describe, expect, it } from 'vitest';
import { startRound, type PitchResult, type Round } from './index';

const fixed = (v: number) => () => v;
/** 隨機幅度 0: a timing error always gives the same direction and 飛距離 (see facilities.test.ts). */
const start = (random: () => number) => startRound({ random, randomness: 0, difficulty: 'easy' });
const swingOnce = (round: Round, err: number): PitchResult => {
  const pitch = round.nextPitch();
  return round.swing(pitch.contactMs + err)!;
};
/** random 0.99 never 打碎 a 設施; 0 always does. */
const NEVER = fixed(0.99);
const ALWAYS = fixed(0);
const cinematicOf = (result: PitchResult) => {
  if (result.kind !== 'homeRun') throw new Error(`expected a home run, got ${result.out}`);
  return result.cinematic;
};

describe('the core picks the 全壘打演出 version: full when 打碎 or 飛距離 ≥ 140 m, else short', () => {
  it('a 150 m home run that hits the scoreboard without 打碎 plays the full version', () => {
    expect(cinematicOf(swingOnce(start(NEVER), 0))).toBe('full');
  });

  it('a 132 m home run into the stands plays the short version', () => {
    expect(cinematicOf(swingOnce(start(NEVER), -18))).toBe('short');
  });

  it('a 138 m home run that 打碎 a billboard plays the full version', () => {
    expect(cinematicOf(swingOnce(start(ALWAYS), -12))).toBe('full');
  });

  it('a 138 m home run that hits a billboard without 打碎 plays the short version', () => {
    expect(cinematicOf(swingOnce(start(NEVER), -12))).toBe('short');
  });

  it('hitting an already 打碎 billboard again at 138 m plays the short version', () => {
    const round = start(ALWAYS);
    expect(cinematicOf(swingOnce(round, -12))).toBe('full');
    expect(cinematicOf(swingOnce(round, -12))).toBe('short');
  });

  it('exactly 140 m is long enough for the full version; just under is not', () => {
    // Perfect window: 飛距離 = 150 − |error| m, so ±10 ms is exactly 140 m.
    expect(cinematicOf(swingOnce(start(NEVER), 10))).toBe('full');
    expect(cinematicOf(swingOnce(start(NEVER), 10.5))).toBe('short');
  });
});
