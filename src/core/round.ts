import { recordIfBest, type BestScoreStorage } from './bestScore';
import { difficultyMultiplier, homeRunPoints } from './difficulty';
import { FIELD } from './field';
import { DEFAULT_PITCH_SETTINGS, type PitchSettings, type PitchType } from './pitchSettings';
import { TUNING } from './tuning';

/** Injected random source: returns a number in [0, 1), like Math.random. */
export type RandomSource = () => number;

export interface RoundOptions {
  random: RandomSource;
  /** Where the 最高分 is read and written when the round ends. Optional: without it nothing is stored. */
  storage?: BestScoreStorage;
  /** 投球設定 of this round. Optional: defaults to DEFAULT_PITCH_SETTINGS (直球, 中速). */
  pitchSettings?: PitchSettings;
}

export type { PitchType };

/** One pitch, as the renderer needs it. Times are ms from the start of the pitch. */
export interface Pitch {
  type: PitchType;
  speedKmh: number;
  /** When the ball leaves the pitcher's hand (end of the windup). */
  releaseMs: number;
  /** Release → plate flight time. */
  flightMs: number;
  /** Ideal contact moment = releaseMs + flightMs. Timing error is measured against this. */
  contactMs: number;
  /** After this the pitch has gone by: no swing can count, so report noSwing(). */
  swingDeadlineMs: number;
  /** How far (m) the ball breaks downward in flight: > 0 for a 曲球, 0 for the others. */
  dropM: number;
}

/** 時機評價: Perfect／太早／太晚. */
export type TimingGrade = 'perfect' | 'early' | 'late';

/** Where a ball the bat touched goes. */
export interface BattedBall {
  /** 飛距離, metres. */
  distance: number;
  /** Direction angle, degrees from the center-field line (negative = left). */
  angle: number;
}

/** 出局種類: 界內球, 界外, 揮空, 沒揮棒. */
export type OutKind = 'flyOut' | 'foul' | 'whiff' | 'noSwing';

export interface HomeRun {
  kind: 'homeRun';
  timing: TimingGrade;
  ball: BattedBall;
}

export interface Out {
  kind: 'out';
  out: OutKind;
  /** null when there was no swing. */
  timing: TimingGrade | null;
  /** null when the bat never touched the ball (whiff, no swing). */
  ball: BattedBall | null;
}

export type PitchResult = HomeRun | Out;

/** 一局的狀態, as the screen layer shows it. */
export interface RoundState {
  /** 出局 so far. */
  outs: number;
  /** 出局 that end the round (10). */
  maxOuts: number;
  /** True once the round has ended; no more pitches or swings. */
  over: boolean;
  /** 分數: each 全壘打 scores 100 × multiplier. */
  score: number;
  /** 難度倍率 of this round. */
  multiplier: number;
  /** 全壘打 so far. */
  homeRuns: number;
  /** Sum of the 全壘打' 飛距離 (m); breaks a tie in 分數. */
  totalDistance: number;
  /** The longest 全壘打, or null before the first. */
  longest: BattedBall | null;
  /** Set when the round ends: this round beat the 最高分 (and was stored as the new one). */
  newBest: boolean;
}

export interface Round {
  /** The round so far. */
  state(): RoundState;
  /** Throws the next pitch. Each pitch takes exactly one swing() or noSwing(). */
  nextPitch(): Pitch;
  /** Swing with this timing error (ms, negative = early) against the current pitch. */
  swing(timingErrorMs: number): PitchResult;
  /** The current pitch reached the plate without a swing. */
  noSwing(): PitchResult;
}

export function startRound(options: RoundOptions): Round {
  const { random, storage, pitchSettings = DEFAULT_PITCH_SETTINGS } = options;
  let current: Pitch | null = null;
  if (pitchSettings.types.length === 0) throw new Error('投球設定 needs at least one 球種');
  const multiplier = difficultyMultiplier(pitchSettings);
  let outs = 0;
  let score = 0;
  let homeRuns = 0;
  let totalDistance = 0;
  let longest: BattedBall | null = null;
  let newBest = false;
  const takePitch = () => {
    if (!current) throw new Error('No pitch in flight: call nextPitch() first');
    const pitch = current;
    current = null;
    return pitch;
  };
  const record = (result: PitchResult): PitchResult => {
    if (result.kind === 'out') {
      outs++;
    } else {
      score += homeRunPoints(multiplier);
      homeRuns++;
      totalDistance += result.ball.distance;
      if (!longest || result.ball.distance > longest.distance) longest = result.ball;
    }
    if (isOver()) newBest = recordIfBest(storage, { score, totalDistance, pitchSettings });
    return result;
  };
  const isOver = () => outs >= TUNING.round.maxOuts;
  return {
    state() {
      return { outs, maxOuts: TUNING.round.maxOuts, over: isOver(), score, multiplier, homeRuns, totalDistance, longest, newBest };
    },
    nextPitch() {
      if (isOver()) throw new Error('The round is over');
      current = throwPitch(pitchSettings, random);
      return current;
    },
    swing(timingErrorMs) {
      takePitch();
      return record(judgeSwing(timingErrorMs));
    },
    noSwing() {
      takePitch();
      return record({ kind: 'out', out: 'noSwing', timing: null, ball: null });
    },
  };
}

/** Picks one of the checked 球種 and a speed inside its range. Every 球種 has the same windup. */
function throwPitch(settings: PitchSettings, random: RandomSource): Pitch {
  const { windupMs, flightDistance, speedKmh: ranges, curveDropM } = TUNING.pitch;
  const { types } = settings;
  const type = types[Math.min(types.length - 1, Math.floor(random() * types.length))];
  const range = ranges[type][settings.speed];
  const speedKmh = range.min + (range.max - range.min) * random();
  const flightMs = (flightDistance / (speedKmh / 3.6)) * 1000;
  const contactMs = windupMs + flightMs;
  const swingDeadlineMs = contactMs + TUNING.swing.contactWindowMs + TUNING.swing.deadlineGraceMs;
  const dropM = type === 'curveball' ? curveDropM : 0;
  return { type, speedKmh, releaseMs: windupMs, flightMs, contactMs, swingDeadlineMs, dropM };
}

function judgeSwing(timingErrorMs: number): PitchResult {
  const timing = grade(timingErrorMs);
  if (Math.abs(timingErrorMs) > TUNING.swing.contactWindowMs) return { kind: 'out', out: 'whiff', timing, ball: null };
  const ball = battedBall(timingErrorMs);
  if (Math.abs(ball.angle) > FIELD.foulLineAngle) return { kind: 'out', out: 'foul', timing, ball };
  if (ball.distance < FIELD.fenceDistance) return { kind: 'out', out: 'flyOut', timing, ball };
  return { kind: 'homeRun', timing, ball };
}

function grade(timingErrorMs: number): TimingGrade {
  if (Math.abs(timingErrorMs) <= TUNING.swing.perfectWindowMs) return 'perfect';
  return timingErrorMs < 0 ? 'early' : 'late';
}

function battedBall(timingErrorMs: number): BattedBall {
  const { perfectWindowMs } = TUNING.swing;
  const { perfectDistance, falloffMPerMs, minDistance } = TUNING.batted;
  const e = Math.abs(timingErrorMs);
  const distance =
    e <= perfectWindowMs
      ? perfectDistance.max - (perfectDistance.max - perfectDistance.min) * (e / perfectWindowMs)
      : Math.max(minDistance, perfectDistance.min - (e - perfectWindowMs) * falloffMPerMs);
  return { distance, angle: timingErrorMs * TUNING.direction.degPerMs };
}
