import { Mesh, MeshPhongMaterial, SphereGeometry, Vector3, type Camera, type Scene } from 'three';
import type { BattedBall, Pitch, PitchResult, Round, RoundState } from '../core';
import { toWorld } from './coords';
import type { Hud } from './hud';
import { CONTACT_POINT, RELEASE_POINT, createBatter, createPitcher } from './players';

/**
 * Plays 一局: one pitch after another (windup, pitch, swing, result) until the
 * core says the round is over, then idles until the next play(). Every judgement
 * comes from the game core; this file only turns timestamps into poses.
 *
 * All positions are computed from high-resolution timestamps (performance.now /
 * event.timeStamp), never by accumulating frame deltas, so a frame hitch
 * can't change where the ball is or how a swing is judged.
 */

/** Presentation timings (not rules: those live in src/core/tuning.ts). */
const SHOW = {
  /** Pause before the first pitch, ms. */
  firstPitchDelayMs: 800,
  /** Out: time from result to the next pitch (spec: within ~1.5 s). */
  outPauseMs: 1500,
  /** Home run: time after the ball lands before the next pitch. */
  homeRunPauseMs: 1200,
  /** Bat reaches the plate this long after the tap, then follows through. */
  swingToContactMs: 70,
  swingFollowMs: 260,
  /** Batter's stride: front foot lifts this long before contact and is planted this long before it. */
  strideLiftBeforeContactMs: 520,
  strideLandBeforeContactMs: 90,
  /** Batted-ball hang time = base + distance / perMetre (seconds). */
  hangBaseS: 0.9,
  hangPerMetre: 60,
  /** Apex height = distance × this (m), at least minApex. */
  apexPerMetre: 0.14,
  minApex: 3,
  /** Ball sag over the pitch flight (m). */
  pitchSag: 0.35,
  /** Far away the ball grows so it never shrinks below ~1/this of its size at this distance (m). */
  ballVisibleDistance: 14,
  /** A missed ball is hidden once it's this far behind the plate (catcher). */
  catcherZ: 1.4,
} as const;

/** Windup pose parameter at release / end of follow-through (see Pitcher.setWindup). */
const WINDUP_RELEASE = 0.85;
const WINDUP_END = 1.2;
const FOLLOW_THROUGH_MS = 350;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Phase =
  | { name: 'idle' }
  | { name: 'waiting'; untilMs: number }
  | { name: 'pitch'; pitch: Pitch; startMs: number; swingAtMs: number | null; result: PitchResult | null; flight: Flight | null; nextAtMs: number };

interface Flight {
  from: Vector3;
  to: Vector3;
  apex: number;
  startMs: number;
  durationMs: number;
}

export interface AtBat {
  /** Starts 一局 at nowMs. onOver runs once its last result has been shown. */
  play(round: Round, nowMs: number, onOver: (state: RoundState) => void): void;
  /** Call every frame with performance.now(). */
  update(nowMs: number): void;
  /** A tap at this high-resolution timestamp (pointer event timeStamp). */
  swing(atMs: number): void;
  /** Current pitch timing, for automated checks (?debug). */
  debug(): { startMs: number; contactMs: number; result: PitchResult | null; round: RoundState | null } | null;
}

export function createAtBat(scene: Scene, camera: Camera, hud: Hud): AtBat {
  const pitcher = createPitcher(scene);
  const batter = createBatter(scene);
  const ball = new Mesh(new SphereGeometry(0.13, 12, 10), new MeshPhongMaterial({ color: '#ffffff', emissive: '#555555', shininess: 30 }));
  scene.add(ball);
  const pitchDir = new Vector3().subVectors(CONTACT_POINT, RELEASE_POINT);
  let phase: Phase = { name: 'idle' };
  let round: Round | null = null;
  let onRoundOver: ((state: RoundState) => void) | null = null;
  let swungOnce = false;

  /** Ball on its way to the plate; p = 0 at release, 1 at the contact point, > 1 past the plate. */
  const pitchPos = (p: number, out: Vector3) => {
    out.copy(RELEASE_POINT).addScaledVector(pitchDir, p);
    if (p <= 1) out.y -= SHOW.pitchSag * Math.sin(Math.PI * p);
    return out;
  };

  const flightPos = (f: Flight, t: number, out: Vector3) => {
    const u = clamp01((t - f.startMs) / f.durationMs);
    out.lerpVectors(f.from, f.to, u);
    out.y = f.from.y * (1 - u) + 4 * f.apex * u * (1 - u);
    return out;
  };

  const launch = (b: BattedBall, from: Vector3, atMs: number): Flight => ({
    from: from.clone(),
    to: toWorld(b.angle, b.distance, 0.13),
    apex: Math.max(SHOW.minApex, b.distance * SHOW.apexPerMetre),
    startMs: atMs,
    durationMs: (SHOW.hangBaseS + b.distance / SHOW.hangPerMetre) * 1000,
  });

  const resolve = (p: Extract<Phase, { name: 'pitch' }>, result: PitchResult, atMs: number) => {
    p.result = result;
    if (result.timing) hud.showTiming(result.timing);
    hud.showResult(result);
    hud.showRound(round!.state());
    if (result.ball) {
      const from = pitchPos(Math.max(0, (atMs - p.startMs - p.pitch.releaseMs) / p.pitch.flightMs), new Vector3());
      p.flight = launch(result.ball, from, atMs);
    }
    p.nextAtMs =
      result.kind === 'homeRun' && p.flight
        ? p.flight.startMs + p.flight.durationMs + SHOW.homeRunPauseMs
        : atMs + SHOW.outPauseMs;
  };

  const startPitch = (atMs: number) => {
    hud.clear();
    batter.setSwing(0);
    batter.setStride(0);
    phase = { name: 'pitch', pitch: round!.nextPitch(), startMs: atMs, swingAtMs: null, result: null, flight: null, nextAtMs: Infinity };
  };

  const endRound = () => {
    const state = round!.state();
    const done = onRoundOver;
    phase = { name: 'idle' };
    round = null;
    onRoundOver = null;
    hud.clear();
    hud.hint(false);
    done?.(state);
  };

  hud.hint(false);

  return {
    play(r, nowMs, onOver) {
      round = r;
      onRoundOver = onOver;
      batter.setSwing(0);
      batter.setStride(0);
      hud.clear();
      hud.hint(!swungOnce);
      hud.showRound(r.state());
      phase = { name: 'waiting', untilMs: nowMs + SHOW.firstPitchDelayMs };
    },

    debug() {
      return phase.name === 'pitch'
        ? { startMs: phase.startMs, contactMs: phase.pitch.contactMs, result: phase.result, round: round!.state() }
        : null;
    },

    swing(atMs) {
      if (phase.name !== 'pitch' || phase.swingAtMs !== null || phase.result) return;
      const elapsed = atMs - phase.startMs;
      if (elapsed > phase.pitch.swingDeadlineMs) return;
      phase.swingAtMs = atMs;
      if (!swungOnce) hud.hint(false);
      swungOnce = true;
      resolve(phase, round!.swing(elapsed - phase.pitch.contactMs), atMs);
    },

    update(now) {
      if (phase.name === 'idle' || phase.name === 'waiting') {
        pitcher.setWindup(0);
        pitcher.hand.getWorldPosition(ball.position);
        ball.visible = true;
        ball.scale.setScalar(1);
        if (phase.name === 'waiting' && now >= phase.untilMs) startPitch(now);
        return;
      }
      const p = phase;
      const elapsed = now - p.startMs;
      const { releaseMs, flightMs } = p.pitch;

      // Pitcher: windup until release, then follow-through.
      pitcher.setWindup(
        elapsed < releaseMs
          ? WINDUP_RELEASE * (elapsed / releaseMs)
          : WINDUP_RELEASE + (WINDUP_END - WINDUP_RELEASE) * clamp01((elapsed - releaseMs) / FOLLOW_THROUGH_MS),
      );

      // Batter: stride timed to the pitch, swing timed to the tap.
      batter.setStride(
        (elapsed - (p.pitch.contactMs - SHOW.strideLiftBeforeContactMs)) /
          (SHOW.strideLiftBeforeContactMs - SHOW.strideLandBeforeContactMs),
      );
      if (p.swingAtMs !== null) {
        const s = now - p.swingAtMs;
        batter.setSwing(s < SHOW.swingToContactMs ? 0.4 * (s / SHOW.swingToContactMs) : 0.4 + 0.6 * clamp01((s - SHOW.swingToContactMs) / SHOW.swingFollowMs));
      }

      // No swing by the deadline → 沒揮棒. Uses the deadline time, not the frame time.
      if (!p.result && elapsed > p.pitch.swingDeadlineMs) resolve(p, round!.noSwing(), p.startMs + p.pitch.swingDeadlineMs);

      // Ball.
      ball.visible = true;
      if (p.flight && now >= p.flight.startMs) flightPos(p.flight, now, ball.position);
      else if (elapsed < releaseMs) pitcher.hand.getWorldPosition(ball.position);
      else {
        pitchPos((elapsed - releaseMs) / flightMs, ball.position);
        ball.visible = ball.position.z < SHOW.catcherZ;
      }

      ball.scale.setScalar(Math.max(1, ball.position.distanceTo(camera.position) / SHOW.ballVisibleDistance));

      if (now >= p.nextAtMs) {
        if (round!.state().over) endRound();
        else startPitch(now);
      }
    },
  };
}
