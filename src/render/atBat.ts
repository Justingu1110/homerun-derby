import { Mesh, MeshPhongMaterial, SphereGeometry, Vector3, type PerspectiveCamera, type Scene } from 'three';
import type { BattedBall, HomeRun, Pitch, PitchResult, Round, RoundState } from '../core';
import { createCinematic } from './cinematic';
import type { CinematicOverlay } from './cinematicOverlay';
import { toWorld } from './coords';
import { createFacilityView } from './facilities';
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
  /** Out: time from result to the next pitch (spec: within ~1.5 s). The camera stays put. */
  outPauseMs: 1500,
  /** Bat reaches the plate this long after the tap, then follows through. */
  swingToContactMs: 70,
  swingFollowMs: 260,
  /** Batter's stride: front foot lifts this long before contact and is planted this long before it. */
  strideLiftBeforeContactMs: 520,
  strideLandBeforeContactMs: 90,
  /** Batted-ball hang time = base + distance / perMetre (seconds)… */
  hangBaseS: 0.9,
  hangPerMetre: 60,
  /** …but an 出局's ball always lands this long before the next pitch, so it never vanishes mid-air. */
  landBeforeNextPitchMs: 250,
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

/**
 * Height offset of a 曲球 over its flight, in units of its dropM: 0 at release and
 * at the contact point, peaks at +1 a little past halfway, then falls fastest at
 * the plate. Past the plate it carries on down at that slope.
 */
const CURVE_PEAK = 1 / (2 / (3 * Math.sqrt(3))); // normalises p(1 − p²) to a peak of 1
const curveBreak = (p: number) => (p <= 1 ? CURVE_PEAK * p * (1 - p * p) : -2 * CURVE_PEAK * (p - 1));

type Phase =
  | { name: 'idle' }
  | { name: 'waiting'; untilMs: number }
  | { name: 'pitch'; pitch: Pitch; startMs: number; swingAtMs: number | null; result: PitchResult | null; flight: Flight | null; nextAtMs: number };

/** An 出局's batted ball (a 全壘打 flies inside the 全壘打演出 instead). */
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
  debug(): { startMs: number; contactMs: number; pitch: Pitch; result: PitchResult | null; round: RoundState | null } | null;
}

/** Moments the app layer reacts to (音效, 震動). All optional. */
export interface AtBatEvents {
  /** A tap was taken as a 揮棒. */
  swing?(): void;
  /** A pitch was decided (swing or no swing). result.ball is set when the bat touched the ball. */
  result?(result: PitchResult): void;
  /** 全壘打演出: the ball cleared the wall ("HOME RUN!!"). */
  homeRun?(result: HomeRun): void;
  /** 全壘打演出: the ball reached its 設施 or the stands; result.landing.smashed says 打碎. */
  impact?(result: HomeRun): void;
}

export function createAtBat(scene: Scene, camera: PerspectiveCamera, hud: Hud, overlay: CinematicOverlay, events: AtBatEvents = {}): AtBat {
  const pitcher = createPitcher(scene);
  const batter = createBatter(scene);
  const facilities = createFacilityView(scene);
  const ball = new Mesh(new SphereGeometry(0.13, 12, 10), new MeshPhongMaterial({ color: '#ffffff', emissive: '#555555', shininess: 30 }));
  scene.add(ball);
  const cinematic = createCinematic(
    { scene, camera, ball, batter, pitcher, facilities, overlay },
    {
      homeRun: (r) => events.homeRun?.(r),
      impact: (r) => events.impact?.(r),
      returning: () => {
        hud.cinematic(false);
        if (round) hud.showRound(round.state());
      },
    },
  );
  let lastNowMs = -Infinity;
  const pitchDir = new Vector3().subVectors(CONTACT_POINT, RELEASE_POINT);
  let phase: Phase = { name: 'idle' };
  let round: Round | null = null;
  let onRoundOver: ((state: RoundState) => void) | null = null;
  let swungOnce = false;

  /**
   * Ball on its way to the plate; p = 0 at release, 1 at the contact point, > 1 past the plate.
   * A 曲球 (dropM > 0) leaves the hand on a rising hump, then breaks down ever faster
   * into the contact point, and keeps falling past it.
   */
  const pitchPos = (pitch: Pitch, p: number, out: Vector3) => {
    out.copy(RELEASE_POINT).addScaledVector(pitchDir, p);
    if (p <= 1) out.y -= SHOW.pitchSag * Math.sin(Math.PI * p);
    out.y += pitch.dropM * curveBreak(p);
    return out;
  };

  const flightPos = (f: Flight, t: number, out: Vector3) => {
    const u = clamp01((t - f.startMs) / f.durationMs);
    out.lerpVectors(f.from, f.to, u);
    out.y = f.from.y * (1 - u) + f.to.y * u + 4 * f.apex * u * (1 - u);
    return out;
  };

  const launch = (b: BattedBall, from: Vector3, atMs: number): Flight => ({
    from: from.clone(),
    to: toWorld(b.angle, b.distance, 0.13),
    apex: Math.max(SHOW.minApex, b.distance * SHOW.apexPerMetre),
    startMs: atMs,
    durationMs: Math.min((SHOW.hangBaseS + b.distance / SHOW.hangPerMetre) * 1000, SHOW.outPauseMs - SHOW.landBeforeNextPitchMs),
  });

  const resolve = (p: Extract<Phase, { name: 'pitch' }>, result: PitchResult, atMs: number) => {
    p.result = result;
    events.result?.(result);
    if (result.kind === 'homeRun') {
      // The 全壘打演出 owns the screen; the next pitch waits for its end.
      hud.cinematic(true);
      cinematic.play(result, (u, out) => pitchPos(p.pitch, u, out), atMs);
      p.nextAtMs = Infinity;
      return;
    }
    if (result.timing) hud.showTiming(result.timing);
    hud.showResult(result);
    hud.showRound(round!.state());
    if (result.ball) {
      const from = pitchPos(p.pitch, Math.max(0, (atMs - p.startMs - p.pitch.releaseMs) / p.pitch.flightMs), new Vector3());
      p.flight = launch(result.ball, from, atMs);
    }
    p.nextAtMs = atMs + SHOW.outPauseMs;
  };

  const startPitch = (atMs: number) => {
    hud.clear();
    batter.setSwing(0);
    batter.setStride(0);
    facilities.sync(round!.state().smashed);
    phase = { name: 'pitch', pitch: round!.nextPitch(), startMs: atMs, swingAtMs: null, result: null, flight: null, nextAtMs: Infinity };
  };

  /** After a result has been shown: the next pitch, or the end of 一局. */
  const advance = (atMs: number) => {
    if (round!.state().over) endRound();
    else startPitch(atMs);
  };

  /** Far away the ball grows so it stays visible. */
  const scaleBall = () => ball.scale.setScalar(Math.max(1, ball.position.distanceTo(camera.position) / SHOW.ballVisibleDistance));

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
      facilities.sync(r.state().smashed);
      phase = { name: 'waiting', untilMs: nowMs + SHOW.firstPitchDelayMs };
    },

    debug() {
      return phase.name === 'pitch'
        ? { startMs: phase.startMs, contactMs: phase.pitch.contactMs, pitch: phase.pitch, result: phase.result, round: round!.state() }
        : null;
    },

    swing(atMs) {
      // A tap during the 全壘打演出 skips to the 飛距離 shot.
      if (cinematic.playing()) return cinematic.skip(Math.max(atMs, lastNowMs));
      if (phase.name !== 'pitch' || phase.result) return;
      // The core decides whether this tap still counts as a 揮棒 (null: the pitch has gone by).
      const result = round!.swing(atMs - phase.startMs);
      if (!result) return;
      phase.swingAtMs = atMs;
      if (!swungOnce) hud.hint(false);
      swungOnce = true;
      events.swing?.();
      resolve(phase, result, atMs);
    },

    update(now) {
      lastNowMs = now;
      // Cinematic first: its cues may start a 設施 impact that must be drawn as of `now`.
      cinematic.update(now);
      facilities.update(now);
      if (phase.name === 'idle' || phase.name === 'waiting') {
        pitcher.setWindup(0);
        pitcher.hand.getWorldPosition(ball.position);
        ball.visible = true;
        ball.scale.setScalar(1);
        if (phase.name === 'waiting' && now >= phase.untilMs) startPitch(now);
        return;
      }
      const p = phase;
      if (p.result?.kind === 'homeRun') {
        if (cinematic.playing()) scaleBall();
        // It just ended (the camera is back behind the batter).
        else advance(now);
        return;
      }
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

      // Undecided pitch: the core says when it has gone by (沒揮棒). Shown from the deadline, not the frame time.
      if (!p.result) {
        const passed = round!.tick(elapsed);
        if (passed) resolve(p, passed, p.startMs + p.pitch.swingDeadlineMs);
      }

      // 球種 + 球速 label from the moment the pitch leaves the hand.
      if (elapsed >= releaseMs) hud.showPitch(p.pitch);

      // Ball.
      ball.visible = true;
      const f = p.flight;
      if (f && now >= f.startMs) {
        flightPos(f, now, ball.position);
      } else if (elapsed < releaseMs) pitcher.hand.getWorldPosition(ball.position);
      else {
        pitchPos(p.pitch, (elapsed - releaseMs) / flightMs, ball.position);
        ball.visible = ball.position.z < SHOW.catcherZ;
      }

      scaleBall();
      if (now >= p.nextAtMs) advance(now);
    },
  };
}
