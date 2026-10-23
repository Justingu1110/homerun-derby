import { FIELD } from './field';
import { TUNING } from './tuning';

/** Injected random source: returns a number in [0, 1), like Math.random. */
export type RandomSource = () => number;

export interface RoundOptions {
  random: RandomSource;
}

export type PitchType = 'fastball';

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

export interface Round {
  /** Throws the next pitch. Each pitch takes exactly one swing() or noSwing(). */
  nextPitch(): Pitch;
  /** Swing with this timing error (ms, negative = early) against the current pitch. */
  swing(timingErrorMs: number): PitchResult;
  /** The current pitch reached the plate without a swing. */
  noSwing(): PitchResult;
}

export function startRound(options: RoundOptions): Round {
  const { random } = options;
  let current: Pitch | null = null;
  const takePitch = () => {
    if (!current) throw new Error('No pitch in flight: call nextPitch() first');
    current = null;
  };
  return {
    nextPitch() {
      const { windupMs, flightDistance, fastballKmh } = TUNING.pitch;
      const speedKmh = fastballKmh.min + (fastballKmh.max - fastballKmh.min) * random();
      const flightMs = (flightDistance / (speedKmh / 3.6)) * 1000;
      const contactMs = windupMs + flightMs;
      const swingDeadlineMs = contactMs + TUNING.swing.contactWindowMs + TUNING.swing.deadlineGraceMs;
      current = { type: 'fastball', speedKmh, releaseMs: windupMs, flightMs, contactMs, swingDeadlineMs };
      return current;
    },
    swing(timingErrorMs) {
      takePitch();
      const timing = grade(timingErrorMs);
      if (Math.abs(timingErrorMs) > TUNING.swing.contactWindowMs) return { kind: 'out', out: 'whiff', timing, ball: null };
      const ball = battedBall(timingErrorMs);
      if (Math.abs(ball.angle) > FIELD.foulLineAngle) return { kind: 'out', out: 'foul', timing, ball };
      if (ball.distance < FIELD.fenceDistance) return { kind: 'out', out: 'flyOut', timing, ball };
      return { kind: 'homeRun', timing, ball };
    },
    noSwing() {
      takePitch();
      return { kind: 'out', out: 'noSwing', timing: null, ball: null };
    },
  };
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
