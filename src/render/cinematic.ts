import {
  CatmullRomCurve3,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TubeGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { FIELD, type HomeRun, type TimingGrade } from '../core';
import { bouncePath, createBallFx, createBursts, createCrowd, TRAIL, type BurstSpec } from './cinematicFx';
import type { CinematicOverlay } from './cinematicOverlay';
import { seededRandom } from './coords';
import { FACILITY_POP, type FacilityView } from './facilities';
import { TIMING_LABEL } from './hud';
import { CONTACT_POINT, RELEASE_POINT, type Batter, type Pitcher } from './players';
import { BATTER_VIEW } from './view';

/**
 * 全壘打演出: the director. A home run plays a list of shots (camera, poses,
 * ball) on a fixed schedule of timestamps, plus cues that fire once at exact
 * times (contact flash, HOME RUN!!, the impact). Every frame is a pure function
 * of `now`: the shot is looked up by time, its local time is scaled by its
 * playback rate, and the ball, camera and effects are evaluated from that. So
 * the slow motion, the hit-stop and the skip don't depend on the frame rate.
 *
 * Shot list and look come from the storyboard prototype (prototype/hr-cinematic).
 */

const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeIn = (v: number) => v * v;

export type ShotId = 'swing' | 'contact' | 'chase' | 'impact' | 'distance' | 'return';

interface Shot {
  id: ShotId;
  /** Length in shot time, s. */
  dur: number;
  /** Shot seconds per real second (> 1 plays it faster). */
  rate: number;
}

/**
 * Shot lengths (shot time, s) and playback rates. Tune feel here.
 * full: every shot at 1×. short: a faster 揮棒特寫, no 擊球特寫, a quicker chase / impact / 飛距離.
 */
const SHOTS = {
  swing: { dur: 1.4, rate: { full: 1, short: 1.5 } },
  contact: { dur: 1.0, rate: { full: 1, short: 0 } }, // rate 0 = left out
  /** Chase length = base + (飛距離 − 128 m) / perMetre. */
  chase: { base: { full: 1.6, short: 1.2 }, perMetre: 40, rate: { full: 1, short: 1 } },
  impact: { dur: 2.0, rate: { full: 1, short: 1.3 } },
  distance: { dur: 2.6, rate: { full: 1, short: 1.6 } },
  return: { dur: 1.3, rate: { full: 1, short: 1.3 } },
} as const;

/** Moments inside shots (shot time, s) and flight fractions at shot ends. */
const BEAT = {
  /** 揮棒特寫: the slowed pitch arrives at the bat… */
  contactS: 0.9,
  /** …the hit-stop holds until here, then the ball leaves. */
  releaseS: 1.08,
  /** The 揮棒特寫 starts its slow-motion re-run of the pitch this far (m) before the bat. */
  approachM: 1.6,
  /** Flight fraction (0 = bat, 1 = landing) at the end of: 揮棒特寫, 擊球特寫, chase. */
  fSwing: 0.004,
  fContact: 0.06,
  fChase: 0.88,
  /** Impact shot: the ball reaches its landing this far in. */
  impactS: 0.4,
  /** Speed lines stay on this long into the chase. */
  speedLinesIntoChaseS: 0.4,
  /** The chase camera trails the ball by this much (s), like a critically damped follow. */
  chaseLagS: 1 / 6,
} as const;

const FX = {
  /** Apex of the cinematic flight = 飛距離 × this. */
  apexPerMetre: 0.17,
  /** Camera shake amplitudes (m) and decay (1/s). */
  shakeContact: 0.12,
  shakeSmash: 0.9,
  shakeHit: 0.45,
  shakeDecay: 9,
  fireworkEveryMs: { min: 350, max: 700 },
  contactSparkle: { n: 50, speed: 3, size: 0.12, lifeMs: 450, colors: ['#ffffff', '#ffe08a'], gravity: 0 },
  firework: { n: 110, speed: 15, size: 1.8, lifeMs: 1900, gravity: 6 },
  fireworkColors: [
    ['#ff5a5a', '#ffd23d'],
    ['#5ad1ff', '#ffffff'],
    ['#b47cff', '#f08bd0'],
    ['#7dff8a', '#ffd23d'],
  ],
  smashSparks: { n: 70, speed: 9, size: 0.7, lifeMs: 700, colors: ['#fff6c0', '#ffd23d', '#ff9d3d'], gravity: 14 },
  lampBurst: { n: 120, speed: 16, size: 0.9, lifeMs: 1200, colors: ['#ffffff', '#fff4c8', '#9fd3ff'], gravity: 18 },
  hitSparks: { n: 30, speed: 5, size: 0.5, lifeMs: 500, colors: ['#ffffff', '#ffd23d'], gravity: 10 },
  /** Ball velocity after it lands (along its direction, up), m/s. */
  afterStands: [5, 6],
  afterSmash: [22, 2],
  afterHit: [-9, 4],
  tubeRadius: 0.45,
  tubeColor: '#ffc83d',
} as const;

/** Words that pop up (the 設施 ones are FACILITY_POP). The 時機評價 is the HUD's label, shouted: PERFECT!, 太早！. */
const timingPop = (grade: TimingGrade) => {
  const label = TIMING_LABEL[grade];
  return /[\x20-\x7e]$/.test(label) ? `${label.toUpperCase()}!` : `${label}！`;
};
const STANDS_POP = '落入觀眾席';

export interface CinematicCast {
  scene: Scene;
  camera: Camera;
  ball: Mesh;
  batter: Batter;
  pitcher: Pitcher;
  facilities: FacilityView;
  overlay: CinematicOverlay;
}

/** Moments the at-bat / app react to. */
export interface CinematicCues {
  /** The ball cleared the wall: "HOME RUN!!". */
  homeRun?(result: HomeRun): void;
  /** The ball reached its landing (result.landing says whether it 打碎 something). */
  impact?(result: HomeRun): void;
  /** The camera starts heading back to the batter. */
  returning?(result: HomeRun): void;
}

export interface Cinematic {
  /**
   * Plays the 全壘打演出 for `result` (its `cinematic` picks full or short), starting at atMs.
   * `approach(p, out)` is the pitch path (p = 1 at the contact point), for the slow-motion re-run of the pitch.
   */
  play(result: HomeRun, approach: (p: number, out: Vector3) => Vector3, atMs: number): void;
  /** True from play() until the last shot ends. */
  playing(): boolean;
  /** When the current 全壘打演出 ends (Infinity if none is playing). */
  endMs(): number;
  /** A tap: jumps to the 飛距離 shot (does nothing once it's there). */
  skip(atMs: number): void;
  /** Call every frame with performance.now(). Also runs leftover effects after the end. */
  update(nowMs: number): void;
}

type BallState = 'approach' | 'stop' | 'flight' | 'landed' | 'pitcher';

interface Plan {
  result: HomeRun;
  shots: Shot[];
  /** Real start time of each shot; a shot ends where the next starts. */
  startMs: number[];
  endMs: number;
  contactMs: number;
  crossMs: number;
  impactMs: number;
  approach: (p: number, out: Vector3) => Vector3;
  /** Flight: contact point → landing, apex. */
  to: Vector3;
  apex: number;
  dir: Vector3;
  perp: Vector3;
  side: number;
  /** Ball after landing, seconds since impactMs. */
  after: (tS: number, out: Vector3) => Vector3;
  fired: Set<'contact' | 'cross' | 'impact' | 'returning'>;
  shakes: { atMs: number; amp: number }[];
  fireworkNextMs: number;
  tube: Mesh | null;
  returnFrom: { position: Vector3; quaternion: Quaternion } | null;
  skipped: boolean;
}

const shotIndexAt = (plan: Plan, ms: number) => {
  let i = 0;
  while (i < plan.shots.length - 1 && plan.startMs[i + 1] <= ms) i++;
  return i;
};
const shotTime = (plan: Plan, i: number, ms: number) => Math.min(plan.shots[i].dur, Math.max(0, ((ms - plan.startMs[i]) / 1000) * plan.shots[i].rate));
/** Real time at which shot i reaches shot time tS. */
const realAt = (plan: Plan, i: number, tS: number) => plan.startMs[i] + (tS / plan.shots[i].rate) * 1000;
const startOf = (plan: Plan, id: ShotId) => plan.startMs[plan.shots.findIndex((s) => s.id === id)];

/** Deterministic noise in [-1, 1] that changes every ~16 ms (shake jitter independent of frame rate). */
const noise = (ms: number, seed: number) => {
  const v = Math.sin(Math.floor(ms / 16) * 12.9898 + seed * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

export function createCinematic(cast: CinematicCast, cues: CinematicCues = {}): Cinematic {
  const { scene, camera, ball, batter, pitcher, facilities, overlay } = cast;
  const bursts = createBursts(scene);
  const crowd = createCrowd(scene);
  const ballFx = createBallFx(scene);
  const rand = seededRandom(4242);
  const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!reducedMotion?.matches;
  const approachP = 1 - BEAT.approachM / RELEASE_POINT.distanceTo(CONTACT_POINT);
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const look = new Vector3();
  const batterQuat = (() => {
    const q = camera.quaternion.clone();
    const p = camera.position.clone();
    camera.position.set(...BATTER_VIEW.position);
    camera.lookAt(...BATTER_VIEW.lookAt);
    const out = camera.quaternion.clone();
    camera.position.copy(p);
    camera.quaternion.copy(q);
    return out;
  })();
  let plan: Plan | null = null;

  const flightPos = (p: Plan, f: number, out: Vector3) => {
    out.lerpVectors(CONTACT_POINT, p.to, f);
    out.y = CONTACT_POINT.y + (p.to.y - CONTACT_POINT.y) * f + 4 * p.apex * f * (1 - f);
    return out;
  };

  /** Where the ball is at time ms, and in what state. Pure in (plan, ms). */
  const ballAt = (p: Plan, ms: number, out: Vector3): BallState => {
    if (ms >= p.impactMs) {
      if (shotIndexAt(p, ms) === p.shots.length - 1) {
        pitcher.hand.getWorldPosition(out);
        return 'pitcher';
      }
      p.after((ms - p.impactMs) / 1000, out);
      return 'landed';
    }
    const i = shotIndexAt(p, ms);
    const s = p.shots[i];
    const t = shotTime(p, i, ms);
    switch (s.id) {
      case 'swing':
        if (t < BEAT.contactS) {
          p.approach(approachP + ((1 - approachP) * t) / BEAT.contactS, out);
          return 'approach';
        }
        if (t < BEAT.releaseS) {
          out.copy(CONTACT_POINT);
          return 'stop';
        }
        flightPos(p, BEAT.fSwing * clamp01((t - BEAT.releaseS) / (s.dur - BEAT.releaseS)), out);
        return 'flight';
      case 'contact':
        flightPos(p, BEAT.fSwing + (BEAT.fContact - BEAT.fSwing) * easeIn(clamp01(t / s.dur)), out);
        return 'flight';
      case 'chase': {
        const f0 = p.result.cinematic === 'full' ? BEAT.fContact : BEAT.fSwing;
        flightPos(p, f0 + (BEAT.fChase - f0) * clamp01(t / s.dur), out);
        return 'flight';
      }
      default:
        flightPos(p, BEAT.fChase + (1 - BEAT.fChase) * clamp01(t / BEAT.impactS), out);
        return 'flight';
    }
  };

  const setCam = (px: number, py: number, pz: number, lx: number, ly: number, lz: number) => {
    camera.position.set(px, py, pz);
    camera.lookAt(lx, ly, lz);
  };

  /** Camera + figures for shot i at shot time t. */
  const pose = (p: Plan, i: number, t: number, ms: number) => {
    const s = p.shots[i];
    const { dir, perp, side, to } = p;
    pitcher.setWindup(s.id === 'return' ? 0 : 1.2);
    batter.setStride(s.id === 'return' ? 0 : 1);
    switch (s.id) {
      case 'swing': {
        const u = clamp01(t / s.dur);
        setCam(1.15 - 0.2 * u, 0.7 + 0.08 * u, -2.0 + 0.3 * u, -0.4, 0.95, 0.2);
        if (t < BEAT.contactS) batter.setSwing(0.4 * clamp01((t - 0.25) / (BEAT.contactS - 0.25)));
        else if (t < BEAT.releaseS) batter.setSwing(0.4);
        else batter.setSwing(0.4 + 0.22 * clamp01((t - BEAT.releaseS) / (s.dur - BEAT.releaseS)));
        break;
      }
      case 'contact': {
        batter.setSwing(0.62 + 0.38 * clamp01(t / 0.6));
        camera.position.copy(CONTACT_POINT).addScaledVector(dir, -3.2).addScaledVector(perp, 2.4 * side);
        camera.position.y = 1.1;
        ballAt(p, ms, tmp);
        camera.lookAt(look.set(-0.6, 1.3, 0.2).lerp(tmp, 0.55));
        break;
      }
      case 'chase': {
        batter.setSwing(1);
        // Follow where the ball was a moment ago: a lagging chase cam, but closed-form.
        const lagMs = ms - ((BEAT.chaseLagS / s.rate) * 1000);
        ballAt(p, Math.max(p.startMs[i], lagMs), tmp);
        camera.position.copy(tmp).addScaledVector(dir, -9).addScaledVector(perp, 2.5);
        camera.position.y += 3.5;
        look.copy(tmp).addScaledVector(dir, 15);
        look.y -= 2;
        camera.lookAt(look);
        break;
      }
      case 'impact':
        batter.setSwing(1);
        camera.position.copy(to).addScaledVector(dir, -24).addScaledVector(perp, 16 * side);
        camera.position.y = to.y + 4;
        camera.lookAt(to.x, to.y - 1, to.z);
        break;
      case 'distance': {
        batter.setSwing(1);
        distancePose(p, smooth(clamp01(t / s.dur)));
        break;
      }
      case 'return': {
        batter.setSwing(0);
        if (!p.returnFrom) {
          distancePose(p, 1);
          p.returnFrom = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
        }
        const u = smooth(clamp01(t / s.dur));
        camera.position.lerpVectors(p.returnFrom.position, tmp2.set(...BATTER_VIEW.position), u);
        camera.quaternion.copy(p.returnFrom.quaternion).slerp(batterQuat, u);
        break;
      }
    }
  };

  const distancePose = (p: Plan, u: number) => {
    camera.position.set(0, 0, 0).addScaledVector(p.dir, -32 - 6 * u).addScaledVector(p.perp, 12 * p.side);
    camera.position.y = 46 + 6 * u;
    camera.lookAt(p.to.x * 0.62, 0, p.to.z * 0.62);
  };

  const burst = (spec: Omit<BurstSpec, 'at'>, at: Vector3, ms: number) => bursts.spawn({ ...spec, at }, ms);
  const firework = (ms: number) => {
    const angle = -40 + rand() * 80;
    const r = 135 + rand() * 40;
    const at = new Vector3(Math.sin(angle * DEG) * r, 42 + rand() * 28, -Math.cos(angle * DEG) * r);
    const colors = FX.fireworkColors[Math.floor(rand() * FX.fireworkColors.length)];
    burst({ ...FX.firework, colors }, at, ms);
  };
  const shake = (p: Plan, ms: number, amp: number) => {
    if (!reduced()) p.shakes.push({ atMs: ms, amp });
  };
  const flash = (ms: number) => {
    if (!reduced()) overlay.flash(ms);
  };

  // ── Cues: each fires once, at its exact time (or at the skip, quietly). ──
  const fireContact = (p: Plan, ms: number, quiet: boolean) => {
    p.fired.add('contact');
    if (quiet) return;
    flash(ms);
    shake(p, ms, FX.shakeContact);
    overlay.pop(timingPop(p.result.timing), ms, p.result.timing !== 'perfect');
    burst(FX.contactSparkle, CONTACT_POINT.clone(), ms);
  };
  const fireCross = (p: Plan, ms: number, quiet: boolean) => {
    p.fired.add('cross');
    if (!quiet) overlay.pop('HOME RUN!!', ms);
    crowd.cheer(ms, p.endMs);
    firework(ms);
    firework(ms);
    p.fireworkNextMs = ms + FX.fireworkEveryMs.min;
    cues.homeRun?.(p.result);
  };
  const fireImpact = (p: Plan, ms: number, quiet: boolean) => {
    p.fired.add('impact');
    const { landing } = p.result;
    facilities.impact(p.result.ball, landing, ms, p.dir);
    if (landing.kind === 'stands') {
      if (!quiet) overlay.pop(STANDS_POP, ms, true, 1);
    } else if (landing.smashed) {
      burst(FX.smashSparks, p.to.clone(), ms);
      if (landing.facility.kind === 'lightTower') burst(FX.lampBurst, p.to.clone(), ms);
      if (!quiet) {
        overlay.pop(FACILITY_POP[landing.facility.kind].smash, ms, false, 1);
        shake(p, ms, FX.shakeSmash);
        flash(ms);
      }
    } else {
      burst(FX.hitSparks, p.to.clone(), ms);
      if (!quiet) {
        overlay.pop(FACILITY_POP[landing.facility.kind].hit, ms, true, 1);
        shake(p, ms, FX.shakeHit);
      }
    }
    cues.impact?.(p.result);
  };

  const fireDue = (p: Plan, now: number) => {
    if (!p.fired.has('contact') && now >= p.contactMs) fireContact(p, p.contactMs, false);
    if (!p.fired.has('cross') && now >= p.crossMs) fireCross(p, p.crossMs, false);
    if (!p.fired.has('impact') && now >= p.impactMs) fireImpact(p, p.impactMs, false);
    const returnMs = startOf(p, 'return');
    if (!p.fired.has('returning') && now >= returnMs) {
      p.fired.add('returning');
      cues.returning?.(p.result);
    }
    while (p.fireworkNextMs <= now && p.fireworkNextMs < p.endMs) {
      firework(p.fireworkNextMs);
      p.fireworkNextMs += FX.fireworkEveryMs.min + rand() * (FX.fireworkEveryMs.max - FX.fireworkEveryMs.min);
    }
  };

  /** Overlay spans that follow from the schedule (re-sent after a skip). */
  const scheduleOverlay = (p: Plan) => {
    const startMs = p.startMs[0];
    const returnMs = startOf(p, 'return');
    const distanceMs = startOf(p, 'distance');
    const chaseMs = startOf(p, 'chase');
    overlay.letterbox(startMs, returnMs);
    overlay.skipHint(startMs, distanceMs);
    const speedOn = p.result.cinematic === 'full' ? startOf(p, 'contact') : chaseMs;
    const speedOff = Math.min(distanceMs, chaseMs + BEAT.speedLinesIntoChaseS * 1000);
    overlay.speedLines(speedOn, speedOff);
    overlay.distance(Math.round(p.result.ball.distance), distanceMs, returnMs);
  };

  const finish = (p: Plan) => {
    ballFx.hide();
    if (p.tube) {
      scene.remove(p.tube);
      p.tube.geometry.dispose();
      (p.tube.material as MeshBasicMaterial).dispose();
    }
    overlay.clear();
    setCam(...BATTER_VIEW.position, ...BATTER_VIEW.lookAt);
    plan = null;
  };

  const showTube = (p: Plan) => {
    const pts = Array.from({ length: 41 }, (_, i) => flightPos(p, i / 40, new Vector3()));
    p.tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 60, FX.tubeRadius, 6), new MeshBasicMaterial({ color: FX.tubeColor, fog: false }));
    p.tube.name = 'cinematic-trajectory';
    scene.add(p.tube);
  };

  return {
    play(result, approach, atMs) {
      if (plan) finish(plan);
      const version = result.cinematic;
      const dist = result.ball.distance;
      const shots: Shot[] = [
        { id: 'swing', dur: SHOTS.swing.dur, rate: SHOTS.swing.rate[version] },
        ...(version === 'full' ? [{ id: 'contact' as const, dur: SHOTS.contact.dur, rate: SHOTS.contact.rate.full }] : []),
        { id: 'chase', dur: SHOTS.chase.base[version] + (dist - 128) / SHOTS.chase.perMetre, rate: SHOTS.chase.rate[version] },
        { id: 'impact', dur: SHOTS.impact.dur, rate: SHOTS.impact.rate[version] },
        { id: 'distance', dur: SHOTS.distance.dur, rate: SHOTS.distance.rate[version] },
        { id: 'return', dur: SHOTS.return.dur, rate: SHOTS.return.rate[version] },
      ];
      const startMs: number[] = [];
      let t = atMs;
      for (const s of shots) {
        startMs.push(t);
        t += (s.dur / s.rate) * 1000;
      }
      const a = result.ball.angle * DEG;
      const dir = new Vector3(Math.sin(a), 0, -Math.cos(a));
      const to = facilities.impactPoint(result.ball, result.landing);
      const { landing } = result;
      const [along, up] = landing.kind === 'stands' ? FX.afterStands : landing.smashed ? FX.afterSmash : FX.afterHit;
      const p: Plan = {
        result,
        shots,
        startMs,
        endMs: t,
        contactMs: 0,
        crossMs: 0,
        impactMs: 0,
        approach,
        to,
        apex: dist * FX.apexPerMetre,
        dir,
        perp: new Vector3(Math.cos(a), 0, Math.sin(a)),
        side: result.ball.angle >= 0 ? -1 : 1,
        after: bouncePath(to, dir.clone().multiplyScalar(along).setY(up)),
        fired: new Set(),
        shakes: [],
        fireworkNextMs: Infinity,
        tube: null,
        returnFrom: null,
        skipped: false,
      };
      p.contactMs = realAt(p, 0, BEAT.contactS);
      const impactShot = shots.findIndex((s) => s.id === 'impact');
      p.impactMs = realAt(p, impactShot, BEAT.impactS);
      // The ball clears the wall: first sampled moment past the fence.
      p.crossMs = p.impactMs;
      for (let ms = p.contactMs; ms < p.impactMs; ms += 4) {
        if (ballAt(p, ms, tmp) === 'flight' && Math.hypot(tmp.x, tmp.z) >= FIELD.fenceDistance) {
          p.crossMs = ms;
          break;
        }
      }
      plan = p;
      crowd.cheer(Infinity, Infinity);
      scheduleOverlay(p);
    },

    playing: () => plan !== null,
    endMs: () => plan?.endMs ?? Infinity,

    skip(atMs) {
      const p = plan;
      if (!p || p.skipped) return;
      const distanceIdx = p.shots.findIndex((s) => s.id === 'distance');
      if (atMs >= p.startMs[distanceIdx]) return;
      p.skipped = true;
      // Shots between here and 飛距離 shrink to nothing; everything after moves up.
      const shift = p.startMs[distanceIdx] - atMs;
      for (let i = 0; i < p.shots.length; i++) {
        if (i < distanceIdx) p.startMs[i] = Math.min(p.startMs[i], atMs);
        else p.startMs[i] -= shift;
      }
      p.endMs -= shift;
      if (!p.fired.has('contact')) fireContact(p, atMs, true);
      if (!p.fired.has('cross')) fireCross(p, atMs, true);
      else crowd.cheer(p.crossMs, p.endMs);
      if (!p.fired.has('impact')) {
        p.impactMs = atMs;
        fireImpact(p, atMs, true);
      }
      p.shakes = [];
      scheduleOverlay(p);
      overlay.speedLines(Infinity, Infinity);
    },

    update(now) {
      const p = plan;
      // Cues first: what they spawn is then drawn as of `now`, even after a long frame.
      if (p) fireDue(p, now);
      bursts.update(now);
      crowd.update(now);
      if (!p) return;
      if (now >= p.endMs) {
        finish(p);
        overlay.render(now, reduced());
        return;
      }
      const i = shotIndexAt(p, now);
      const shot = p.shots[i];
      pose(p, i, shotTime(p, i, now), now);

      // Camera shake: decaying, jittered offsets from timestamps.
      let amp = 0;
      for (const s of p.shakes) if (now >= s.atMs) amp += s.amp * Math.exp((-FX.shakeDecay * (now - s.atMs)) / 1000);
      if (amp > 0.001) {
        camera.position.x += noise(now, 1) * amp;
        camera.position.y += noise(now, 2) * amp;
      }

      // Ball, its glow and trail.
      const state = ballAt(p, now, ball.position);
      ball.visible = true;
      const glowing = shot.id !== 'distance' && shot.id !== 'return';
      ballFx.glow.visible = glowing;
      if (glowing) ballFx.glow.position.copy(ball.position);
      ballFx.beads.forEach((bead, k) => {
        const ms = now - (2 * k + 1) * TRAIL.stepMs;
        const s = glowing && state !== 'approach' ? ballAt(p, ms, bead.position) : 'approach';
        bead.visible = s === 'flight' || s === 'landed';
      });

      if (shot.id === 'distance' && !p.tube) showTube(p);
      if (shot.id === 'return' && p.tube) {
        scene.remove(p.tube);
        p.tube.geometry.dispose();
        (p.tube.material as MeshBasicMaterial).dispose();
        p.tube = null;
      }
      overlay.render(now, reduced());
    },
  };
}
