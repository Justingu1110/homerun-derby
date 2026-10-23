import { describe, expect, it } from 'vitest';
import { readBestScore, startRound, type BestScore, type BestScoreStorage, type PitchSettings, type Round } from './index';

const fixed = (v: number) => () => v;

/** 慢速 + 只有直球: 難度倍率 ×1.0, so each 全壘打 is worth 100. */
const X1: PitchSettings = { types: ['fastball'], speed: 'slow' };

/** Swing timing errors (ms) with known results at random 0.5. */
const PERFECT = 0;
const WHIFF = 200;

const pitchAndSwing = (round: Round, err: number) => {
  const pitch = round.nextPitch();
  return round.swing(pitch.contactMs + err)!;
};

describe('一局: 10 outs end the round', () => {
  it('reports each out, and the round ends after the 10th', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: X1 });
    expect(round.state()).toMatchObject({ outs: 0, maxOuts: 10, over: false });
    for (let i = 1; i <= 9; i++) {
      pitchAndSwing(round, WHIFF);
      expect(round.state()).toMatchObject({ outs: i, over: false });
    }
    const pitch = round.nextPitch();
    round.tick(pitch.swingDeadlineMs + 1);
    expect(round.state()).toMatchObject({ outs: 10, over: true });
  });

  it('home runs are not outs', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: X1 });
    for (let i = 0; i < 15; i++) pitchAndSwing(round, PERFECT);
    expect(round.state()).toMatchObject({ outs: 0, over: false });
  });

  it('accepts no more pitches or swings once the round is over', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: X1 });
    for (let i = 0; i < 10; i++) pitchAndSwing(round, WHIFF);
    expect(() => round.nextPitch()).toThrow();
    expect(() => round.swing(PERFECT)).toThrow();
    expect(() => round.tick(Infinity)).toThrow();
    expect(round.state().outs).toBe(10);
  });
});

describe('分數', () => {
  it('a round starts at zero, at the multiplier of its 投球設定 (×1.0 here)', () => {
    expect(startRound({ random: fixed(0.5), pitchSettings: X1 }).state()).toMatchObject({
      score: 0,
      multiplier: 1,
      homeRuns: 0,
      totalDistance: 0,
      longest: null,
    });
  });

  it('each home run scores 100 × the difficulty multiplier; outs score nothing', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: X1 });
    pitchAndSwing(round, PERFECT);
    expect(round.state()).toMatchObject({ score: 100, homeRuns: 1 });
    pitchAndSwing(round, WHIFF);
    pitchAndSwing(round, 60); // fly out
    expect(round.state()).toMatchObject({ score: 100, homeRuns: 1 });
    pitchAndSwing(round, PERFECT);
    pitchAndSwing(round, PERFECT);
    expect(round.state()).toMatchObject({ score: 300, homeRuns: 3 });
  });

  it('adds up the home runs’ distances and keeps the longest one', () => {
    const round = startRound({ random: fixed(0.5), pitchSettings: X1 });
    const a = pitchAndSwing(round, PERFECT); // dead centre: longest
    const b = pitchAndSwing(round, 10);
    pitchAndSwing(round, 60); // fly out: its distance doesn't count
    const c = pitchAndSwing(round, -5);
    if (a.kind !== 'homeRun' || b.kind !== 'homeRun' || c.kind !== 'homeRun') throw new Error('expected home runs');
    const state = round.state();
    expect(state.totalDistance).toBeCloseTo(a.ball.distance + b.ball.distance + c.ball.distance);
    expect(state.longest).toEqual(a.ball);
  });
});

/** In-memory 最高分 storage; `saved` lists every write. */
const memoryStorage = (initial: BestScore | null = null) => {
  let stored = initial;
  const saved: BestScore[] = [];
  const storage: BestScoreStorage = {
    load: () => stored,
    save: (best) => {
      stored = best;
      saved.push(best);
    },
  };
  return { storage, saved };
};

/** Plays a whole round: these swings (timing errors, ms), then whiffs until 10 outs. */
const playRound = (storage: BestScoreStorage, swings: number[]) => {
  const round = startRound({ random: fixed(0.5), pitchSettings: X1, storage });
  for (const err of swings) pitchAndSwing(round, err);
  while (!round.state().over) pitchAndSwing(round, WHIFF);
  return round.state();
};

describe('最高分', () => {
  it('a round that beats the best score writes it and is marked as a new record', () => {
    const { storage, saved } = memoryStorage({ score: 100, totalDistance: 150 });
    const state = playRound(storage, [PERFECT, PERFECT]);
    expect(state.newBest).toBe(true);
    expect(saved).toEqual([{ score: 200, totalDistance: state.totalDistance, pitchSettings: X1 }]);
    expect(readBestScore(storage)).toEqual({ score: 200, totalDistance: state.totalDistance, pitchSettings: X1 });
  });

  it('the best score keeps the 投球設定 it was set with', () => {
    const { storage, saved } = memoryStorage({ score: 100, totalDistance: 150, pitchSettings: X1 });
    const hard: PitchSettings = { types: ['fastball', 'changeup', 'curveball'], speed: 'fast' };
    const round = startRound({ random: fixed(0.5), pitchSettings: hard, storage });
    pitchAndSwing(round, PERFECT);
    while (!round.state().over) pitchAndSwing(round, WHIFF);
    expect(saved).toEqual([{ score: 200, totalDistance: round.state().totalDistance, pitchSettings: hard }]);
    expect(readBestScore(storage)?.pitchSettings).toEqual(hard);
  });

  it('the first round with a home run sets the best score on a fresh device', () => {
    const { storage, saved } = memoryStorage();
    expect(readBestScore(storage)).toBeNull();
    expect(playRound(storage, [PERFECT]).newBest).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('a round without a home run is not a record, even on a fresh device', () => {
    const { storage, saved } = memoryStorage();
    expect(playRound(storage, []).newBest).toBe(false);
    expect(saved).toEqual([]);
  });

  it('a lower score does not overwrite the best score', () => {
    const { storage, saved } = memoryStorage({ score: 500, totalDistance: 700 });
    expect(playRound(storage, [PERFECT, PERFECT]).newBest).toBe(false);
    expect(saved).toEqual([]);
    expect(readBestScore(storage)).toEqual({ score: 500, totalDistance: 700 });
  });

  it('an equal score breaks the tie on total distance', () => {
    // Two perfect home runs: 200 points, 300 m (150 m each, dead centre).
    const longer = memoryStorage({ score: 200, totalDistance: 299 });
    expect(playRound(longer.storage, [PERFECT, PERFECT]).newBest).toBe(true);
    expect(longer.saved).toHaveLength(1);

    const shorter = memoryStorage({ score: 200, totalDistance: 301 });
    expect(playRound(shorter.storage, [PERFECT, PERFECT]).newBest).toBe(false);
    expect(shorter.saved).toEqual([]);
  });

  it('is only judged when the round ends', () => {
    const { storage, saved } = memoryStorage();
    const round = startRound({ random: fixed(0.5), pitchSettings: X1, storage });
    for (let i = 0; i < 5; i++) pitchAndSwing(round, PERFECT);
    for (let i = 0; i < 9; i++) pitchAndSwing(round, WHIFF);
    expect(round.state().newBest).toBe(false);
    expect(saved).toEqual([]);
    pitchAndSwing(round, WHIFF);
    expect(round.state().newBest).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('the game plays on when the storage fails (e.g. private browsing)', () => {
    const broken: BestScoreStorage = {
      load: () => {
        throw new Error('SecurityError');
      },
      save: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readBestScore(broken)).toBeNull();
    const state = playRound(broken, [PERFECT]);
    expect(state).toMatchObject({ over: true, score: 100, outs: 10 });
  });
});
