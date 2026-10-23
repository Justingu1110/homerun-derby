import { recordIfBest, type BestScoreStorage } from './bestScore';
import { difficultyMultiplier, homeRunPoints } from './difficulty';
import { FIELD } from './field';
import { createFacilities, type Landing } from './facilities';
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
  /**
   * 隨機幅度, 0–1 (the 設定 slider's 0–100%). Jitters the 飛距離 and direction of
   * a ball the bat touched outside the perfect window. Default DEFAULT_RANDOMNESS.
   */
  randomness?: number;
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
  /** After this the pitch has gone by: a tap no longer counts, and tick() reports 沒揮棒. */
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
  /** Where it ends up: the 設施 it hit (and whether this hit 打碎 it), or the stands. */
  landing: Landing;
  /** Which 全壘打演出 to play: 'full' when this hit 打碎 a 設施 or flew ≥ TUNING.cinematic.fullDistance, else 'short'. */
  cinematic: CinematicVersion;
}

/** 全壘打演出 version: full (~9 s) or short (~5 s). */
export type CinematicVersion = 'full' | 'short';

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
  /** Ids of the 設施 打碎 so far this round, in order. They stay 打碎 until the round ends. */
  smashed: readonly string[];
}

export interface Round {
  /** The round so far. */
  state(): RoundState;
  /** Throws the next pitch. Each pitch is decided by exactly one swing() or tick() result. */
  nextPitch(): Pitch;
  /**
   * A tap elapsedMs after the start of the current pitch (the same clock as Pitch.contactMs).
   * The core measures the timing error against the ideal contact moment. A tap after
   * Pitch.swingDeadlineMs is not a swing: it returns null and the pitch is still undecided.
   */
  swing(elapsedMs: number): PitchResult | null;
  /**
   * The current pitch has been in flight elapsedMs with no swing. Past Pitch.swingDeadlineMs
   * it has gone by: returns its 沒揮棒 out. Before that, null (still undecided).
   */
  tick(elapsedMs: number): PitchResult | null;
}

export function startRound(options: RoundOptions): Round {
  const { random, storage, pitchSettings = DEFAULT_PITCH_SETTINGS, randomness = TUNING.randomness.default } = options;
  if (!(randomness >= 0 && randomness <= 1)) throw new RangeError(`randomness must be 0–1, got ${randomness}`);
  let current: Pitch | null = null;
  if (pitchSettings.types.length === 0) throw new Error('投球設定 needs at least one 球種');
  const multiplier = difficultyMultiplier(pitchSettings);
  let outs = 0;
  let score = 0;
  let homeRuns = 0;
  let totalDistance = 0;
  let longest: BattedBall | null = null;
  let newBest = false;
  const facilities = createFacilities(random);
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
      return { outs, maxOuts: TUNING.round.maxOuts, over: isOver(), score, multiplier, homeRuns, totalDistance, longest, newBest, smashed: facilities.smashed() };
    },
    nextPitch() {
      if (isOver()) throw new Error('The round is over');
      current = throwPitch(pitchSettings, random);
      return current;
    },
    swing(elapsedMs) {
      if (current && elapsedMs > current.swingDeadlineMs) return null;
      const pitch = takePitch();
      const judged = judgeSwing(elapsedMs - pitch.contactMs, randomness, random);
      if (judged.kind === 'out') return record(judged);
      const landing = facilities.land(judged.ball);
      return record({ ...judged, landing, cinematic: cinematicVersion(judged.ball, landing) });
    },
    tick(elapsedMs) {
      if (current && elapsedMs <= current.swingDeadlineMs) return null;
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

function judgeSwing(timingErrorMs: number, randomness: number, random: RandomSource): Out | Omit<HomeRun, 'landing' | 'cinematic'> {
  const timing = grade(timingErrorMs);
  if (Math.abs(timingErrorMs) > TUNING.swing.contactWindowMs) return { kind: 'out', out: 'whiff', timing, ball: null };
  // A Perfect swing is never jittered: it is always the same home run.
  const ball = timing === 'perfect' ? battedBall(timingErrorMs) : jitter(battedBall(timingErrorMs), randomness, random);
  if (Math.abs(ball.angle) > FIELD.foulLineAngle) return { kind: 'out', out: 'foul', timing, ball };
  if (ball.distance < FIELD.fenceDistance) return { kind: 'out', out: 'flyOut', timing, ball };
  return { kind: 'homeRun', timing, ball };
}

function cinematicVersion(ball: BattedBall, landing: Landing): CinematicVersion {
  const smashed = landing.kind === 'facility' && landing.smashed;
  return smashed || ball.distance >= TUNING.cinematic.fullDistance ? 'full' : 'short';
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

/** 隨機幅度: shift 飛距離 and direction by up to ±(randomness × max spread), uniformly. */
function jitter(ball: BattedBall, randomness: number, random: RandomSource): BattedBall {
  if (randomness === 0) return ball;
  const { maxDistanceSpread, maxAngleSpreadDeg } = TUNING.randomness;
  const d = 2 * random() - 1;
  const a = 2 * random() - 1;
  return {
    distance: ball.distance * (1 + d * randomness * maxDistanceSpread),
    angle: ball.angle + a * randomness * maxAngleSpreadDeg,
  };
}
