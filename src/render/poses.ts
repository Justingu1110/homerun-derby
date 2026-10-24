import { Object3D, Vector3 } from 'three';
import type { Appearance } from '../core';
import { HAND_RADIUS, HELMET, buildSkeleton, type Skeleton } from './character';
import { track, type Keys } from './motion';

/**
 * Player motion as keyframe tables (port of prototype v6 setPitcher /
 * setStance / setSwing). Every table is a Catmull-Rom track (motion.ts), so
 * the figures flow through each pose. Poses are plain data computed from one
 * time number; posePitcher / poseBatter put them on a character (or a bare
 * skeleton, for checks without a DOM).
 *
 * Times are in "motion seconds" of the prototype's pitch shot; the at-bat maps
 * the pitch clock onto them (windupTime, stanceTime, swingProgress below), so
 * the game core's timing (release, contact) stays authoritative.
 */

type V3 = [number, number, number];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const v3 = (keys: Keys, t: number) => track(keys, t) as V3;
const one = (keys: Keys, t: number) => track(keys, t)[0];

// ---------------------------------------------------------------- pitcher

/** Motion time at which the ball leaves the hand. */
export const PITCH_RELEASE = 1.6;
/** End of the follow-through (hold this for 投手回頭目送 etc.). */
export const PITCH_END = 2.4;
/** Back in the set position, ready for the next pitch. */
export const PITCH_RESET = 3.2;

/** Where the pitcher stands: the rubber, on top of the mound. */
export const MOUND = { x: 0, y: 0.3, z: -18.4 } as const;

/**
 * Right-hander, pitcher-local (+z toward the plate, his right is −x). Set with
 * both hands together in front of the chest, below the chin → high leg kick,
 * closing (turn) → stride, glove reaching to the plate, ball hand down, back
 * and up behind the head → hips and shoulders fire, release out in front →
 * big forward lean, ball hand across to the other knee, back foot kicks up
 * and comes down → back to the set.
 */
const SET_BALL: V3 = [0.05, 0.48, 0.36];
const SET_GLOVE: V3 = [0.1, 0.48, 0.4];
const SET_LEAD: V3 = [0.15, 0, 0.05];
const SET_PIVOT: V3 = [-0.15, 0, 0.05];
export const PITCHER_KEYS = {
  ballHand: [
    [0, SET_BALL], [0.35, [0.05, 0.5, 0.37]], [0.9, [0.0, 0.62, 0.42]], [1.12, [-0.42, 0.55, -0.5]], [1.36, [-0.55, 1.5, -0.38]],
    [PITCH_RELEASE, [-0.25, 1.5, 0.72]], [1.7, [0.1, 0.8, 0.95]], [1.82, [0.3, 0.4, 0.62]], [PITCH_END, [0.3, 0.45, 0.5]], [PITCH_RESET, SET_BALL],
  ],
  gloveHand: [
    [0, SET_GLOVE], [0.9, [0.06, 0.6, 0.44]], [1.2, [0.45, 1.15, 0.7]], [1.48, [0.45, 0.92, 0.62]], [PITCH_RELEASE, [0.42, 0.52, 0.3]],
    [PITCH_END, [0.42, 0.42, 0.28]], [PITCH_RESET, SET_GLOVE],
  ],
  leadFoot: [
    [0, SET_LEAD], [0.35, SET_LEAD], [0.75, [-0.22, 0.72, 0.05]], [1.0, [-0.18, 0.64, 0]], [1.28, [0.22, 0.16, 0.75]], [1.4, [0.22, 0, 0.85]],
    [PITCH_END, [0.22, 0, 0.85]], [2.75, [0.2, 0.12, 0.45]], [PITCH_RESET, SET_LEAD],
  ],
  pivotFoot: [
    [0, SET_PIVOT], [1.5, SET_PIVOT], [1.72, [-0.15, 0.2, -0.15]], [1.95, [-0.2, 0.55, -0.35]], [2.25, [-0.05, 0, 0.55]],
    [PITCH_END, [-0.05, 0, 0.55]], [2.95, [-0.12, 0.12, 0.3]], [PITCH_RESET, SET_PIVOT],
  ],
  /** Torso yaw (radians, + = toward his left): closing on the kick, opening through release. */
  turn: [[0, [0]], [0.4, [0]], [0.9, [-1.25]], [1.3, [-1.1]], [PITCH_RELEASE, [0.38]], [2.0, [0.55]], [PITCH_END, [0.4]], [PITCH_RESET, [0]]],
  /** Torso pitch (radians, + = forward). */
  lean: [[0, [0]], [0.9, [-0.1]], [1.3, [-0.22]], [PITCH_RELEASE, [0.45]], [1.85, [0.75]], [PITCH_END, [0.4]], [PITCH_RESET, [0]]],
  /** Whole body: [rise (m), drive toward the plate (m), torso height squash]. */
  body: [
    [0, [0, 0, 1]], [0.9, [0.1, 0, 1.08]], [1.35, [-0.14, 0.22, 1]], [PITCH_RELEASE, [-0.18, 0.42, 0.9]], [1.8, [-0.18, 0.5, 1]],
    [PITCH_END, [-0.06, 0.55, 1]], [PITCH_RESET, [0, 0, 1]],
  ],
} satisfies Record<string, Keys>;

export interface PitcherPose {
  /** Pitcher-local positions (already mirrored for a left-hander). */
  ballHand: V3;
  gloveHand: V3;
  /** Glove-side (striding) foot and the pivot (rubber) foot. */
  leadFoot: V3;
  pivotFoot: V3;
  /** Torso yaw (mirrored) and forward lean, radians. */
  turn: number;
  lean: number;
  /** Body offsets in world metres: up, toward the plate. */
  rise: number;
  drive: number;
  /** Torso height scale (compression at release). */
  squash: number;
}

/** The pitcher at motion time t. A left-hander (lefty) is the right-hander mirrored in x. */
export function pitcherPose(t: number, lefty: boolean): PitcherPose {
  const sx = lefty ? -1 : 1;
  const mirror = (v: V3): V3 => [v[0] * sx, v[1], v[2]];
  const [rise, drive, squash] = track(PITCHER_KEYS.body, t);
  return {
    ballHand: mirror(v3(PITCHER_KEYS.ballHand, t)),
    gloveHand: mirror(v3(PITCHER_KEYS.gloveHand, t)),
    leadFoot: mirror(v3(PITCHER_KEYS.leadFoot, t)),
    pivotFoot: mirror(v3(PITCHER_KEYS.pivotFoot, t)),
    turn: sx * one(PITCHER_KEYS.turn, t),
    lean: one(PITCHER_KEYS.lean, t),
    rise,
    drive,
    squash,
  };
}

/** A posable pitcher: skeleton plus [ball hand, glove] as children of the root. */
export interface PitcherRig extends Skeleton {
  hands: [Object3D, Object3D];
}

/**
 * Puts a pitcher pose on a rig. Feet keep to the ground while the body rises
 * or sinks.
 */
export function posePitcher(rig: PitcherRig, pose: PitcherPose): void {
  const s = rig.root.scale.y;
  rig.root.position.set(MOUND.x, MOUND.y + pose.rise, MOUND.z + pose.drive);
  rig.hands[0].position.set(...pose.ballHand);
  rig.hands[1].position.set(...pose.gloveHand);
  const ground = -pose.rise / s;
  // The shoes are alike, so feet[1] always takes the lead foot (on −x for a left-hander), as in v6.
  rig.feet[0].position.set(pose.pivotFoot[0], pose.pivotFoot[1] + ground, pose.pivotFoot[2]);
  rig.feet[1].position.set(pose.leadFoot[0], pose.leadFoot[1] + ground, pose.leadFoot[2]);
  rig.torso.rotation.set(pose.lean, pose.turn, 0);
  rig.torso.scale.set(1, pose.squash, 1);
  // Keeps looking at the plate.
  rig.head.rotation.set(0, -pose.turn * 0.6, 0);
}

/** Where the ball leaves this pitcher's hand (world): his ball hand at PITCH_RELEASE, mirrored for a left-hander. */
export function releasePoint(look: Appearance): Vector3 {
  const rig: PitcherRig = { ...buildSkeleton(look), hands: [new Object3D(), new Object3D()] };
  rig.root.add(...rig.hands);
  posePitcher(rig, pitcherPose(PITCH_RELEASE, look.lefty));
  rig.root.updateWorldMatrix(true, true);
  return rig.hands[0].getWorldPosition(new Vector3());
}

// ---------------------------------------------------------------- batter

/** Motion time at which the stride is planted and the batter is ready to swing (stanceTime maps it before contact). */
export const STANCE_END = 1.95;
/** Swing progress at which the bat is over the plate (contact). */
export const SWING_CONTACT = 0.4;
/** Where the batter stands: right-handed, in the box on the third-base side, facing the plate (+x). */
export const BATTER_SPOT = { x: -0.75, z: 0.2 } as const;

/** The bat: [radius, height] profile from the knob (origin) to the end, along +y. */
export const BAT_LENGTH = 1.05;
export const BAT_PROFILE: readonly (readonly [r: number, y: number])[] = (
  [[0, 0], [0.034, 0], [0.036, 0.02], [0.024, 0.05], [0.024, 0.32], [0.04, 0.55], [0.058, 0.78], [0.064, 0.93], [0.05, 0.99], [0, 1]] as const
).map(([r, y]) => [r * 1.25, y * BAT_LENGTH] as const);
/** From the hands to the sweet spot, along the bat. */
const SWEET_SPOT = 0.62;

/**
 * World-space tracks (the hands are not children of the batter). Stance: the
 * waggle → load (hands back and up, front knee up) → stride. Swing: hands
 * down and through to contact (0.4) → extension → high finish. Bat angles are
 * [yaw, elevation] in degrees (batDir).
 */
export const BATTER_KEYS = {
  stanceHands: [[0, [-0.42, 1.0, 0.86]], [0.7, [-0.42, 1.0, 0.86]], [1.3, [-0.4, 1.12, 0.98]], [STANCE_END, [-0.4, 1.06, 0.92]]],
  /** Front (+x local, toward the pitcher) foot, batter-local. */
  stanceFront: [[0, [0.16, 0, 0.05]], [1.0, [0.16, 0, 0.05]], [1.4, [0.22, 0.34, 0.2]], [STANCE_END, [0.58, 0, 0.05]]],
  swingHands: [
    [0, [-0.4, 1.06, 0.92]], [0.15, [-0.37, 0.97, 0.74]], [0.3, [-0.26, 0.86, 0.48]], [SWING_CONTACT, [-0.2, 0.8, 0.2]],
    [0.5, [-0.1, 0.86, 0.02]], [0.6, [-0.16, 0.98, -0.16]], [0.8, [-0.28, 1.25, -0.32]], [1, [-0.34, 1.42, -0.34]],
  ],
  swingBat: [[0, [15, 50]], [0.15, [24, 42]], [0.3, [52, 20]], [SWING_CONTACT, [90, 5]], [0.5, [122, 8]], [0.6, [152, 16]], [0.8, [195, 45]], [1, [220, 67]]],
  /** Hips and shoulders turning through the ball. */
  swingTwist: [[0, [-0.4]], [0.2, [-0.1]], [SWING_CONTACT, [1.0]], [0.7, [1.55]], [1, [1.75]]],
  /** Upper body staying back (away from the plate) through contact. */
  swingLean: [[0, [0.04]], [0.25, [-0.1]], [SWING_CONTACT, [-0.16]], [0.75, [-0.06]], [1, [0]]],
} satisfies Record<string, Keys>;

export interface BatterPose {
  /** Top hand position (world) and the bat's [yaw, elevation] (degrees). */
  hands: V3;
  bat: [yaw: number, elev: number];
  /** Torso rotation (x, y, z radians) and hip height; head rotation; root z (weight shift). */
  torso: V3;
  torsoY: number;
  head: V3;
  rootZ: number;
  /** Batter-local feet: front (feet[1]) and back (feet[0]) position, back-foot rotation (the pivot). */
  front: V3;
  back: V3;
  backTurn: V3;
}

function stancePose(t: number): BatterPose {
  const load = smooth(clamp01((t - 0.7) / 0.6));
  const calm = 1 - load;
  const stride = smooth(clamp01((t - 1.4) / 0.55));
  const w = Math.sin(t * 5.5);
  const w2 = Math.cos(t * 5.5);
  const h = v3(BATTER_KEYS.stanceHands, t);
  // Lean over the plate, rock back, then forward.
  const torso: V3 = [0.08 - 0.04 * load, -0.15 - 0.45 * load + 0.25 * stride, 0.2 * load - 0.12 * stride];
  return {
    hands: [h[0] + 0.035 * w2 * calm, h[1] + 0.035 * w * calm, h[2]],
    // Bat waggle, then still.
    bat: [10 + 8 * load + 20 * w * calm, 58 - 10 * load + 8 * w2 * calm],
    torso,
    torsoY: 0.36 - 0.05 * load + 0.02 * w * calm,
    head: [-torso[0], -torso[1] * 0.9, -torso[2] * 0.8],
    rootZ: BATTER_SPOT.z + 0.05 * load - 0.13 * stride,
    front: v3(BATTER_KEYS.stanceFront, t),
    back: [-0.16, 0, 0.05],
    backTurn: [0, 0, 0],
  };
}

function swingPose(a: number): BatterPose {
  const twist = one(BATTER_KEYS.swingTwist, a);
  const piv = smooth(clamp01((a - 0.2) / 0.45));
  return {
    hands: v3(BATTER_KEYS.swingHands, a),
    bat: track(BATTER_KEYS.swingBat, a) as [number, number],
    torso: [one(BATTER_KEYS.swingLean, a), twist, 0.06 - 0.2 * clamp01((a - SWING_CONTACT) / 0.6)],
    torsoY: 0.325 - 0.03 * Math.sin(Math.PI * clamp01(a / 0.7)),
    // Eyes on the ball until contact, then following it up.
    head: [-0.35 * smooth(clamp01((a - SWING_CONTACT) / 0.4)), -twist * 0.75 + (a < SWING_CONTACT ? 0 : (twist - 1) * 0.4), 0],
    rootZ: 0.07,
    front: [0.58, 0, 0.05],
    back: [-0.14, 0.05 * piv, 0.05],
    backTurn: [0.5 * piv, 1.1 * piv, 0],
  };
}

const mix = (a: number, b: number, w: number) => a + (b - a) * w;
const mixV = <T extends number[]>(a: T, b: T, w: number) => a.map((v, i) => mix(v, b[i], w)) as T;

/**
 * The batter at stance time t, swinging (swing = progress 0..1, 0.4 = contact)
 * or not (null). A swing blends in from the stance over its first moment, so
 * an early tap (before the stride is down) doesn't jump.
 */
export function batterPose(t: number, swing: number | null): BatterPose {
  const s = stancePose(t);
  if (swing === null) return s;
  const w = smooth(clamp01(swing / 0.2));
  if (w === 0) return s;
  const g = swingPose(swing);
  return {
    hands: mixV(s.hands, g.hands, w),
    bat: mixV(s.bat, g.bat, w),
    torso: mixV(s.torso, g.torso, w),
    torsoY: mix(s.torsoY, g.torsoY, w),
    head: mixV(s.head, g.head, w),
    rootZ: mix(s.rootZ, g.rootZ, w),
    front: mixV(s.front, g.front, w),
    back: mixV(s.back, g.back, w),
    backTurn: mixV(s.backTurn, g.backTurn, w),
  };
}

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);

/** Unit direction of the bat from the hands. Yaw 0 points at the catcher (+z), 90 at the pitcher's side of the plate (+x). */
export function batDir(yawDeg: number, elevDeg: number, out = new Vector3()): Vector3 {
  const y = yawDeg * DEG;
  const e = elevDeg * DEG;
  return out.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e));
}

/** Sweet spot of the bat in this pose (world). */
export function sweetSpot(pose: BatterPose): Vector3 {
  return batDir(...pose.bat).multiplyScalar(SWEET_SPOT).add(new Vector3(...pose.hands));
}

/** Where the bat meets an on-time pitch, in world space. */
export const CONTACT_POINT = sweetSpot(swingPose(SWING_CONTACT));

/** A posable batter: skeleton, [top, bottom] batting-glove hands and the bat (world objects, no parent). */
export interface BatterRig extends Skeleton {
  hands: [Object3D, Object3D];
  bat: Object3D;
}

const dir = new Vector3();
export function poseBatter(rig: BatterRig, pose: BatterPose): void {
  rig.root.position.set(BATTER_SPOT.x, 0, pose.rootZ);
  rig.root.rotation.y = Math.PI / 2;
  rig.torso.rotation.set(...pose.torso);
  rig.torso.position.y = pose.torsoY;
  rig.head.rotation.set(...pose.head);
  rig.feet[1].position.set(...pose.front);
  rig.feet[0].position.set(...pose.back);
  rig.feet[0].rotation.set(...pose.backTurn);
  batDir(...pose.bat, dir);
  rig.bat.position.set(...pose.hands);
  rig.bat.quaternion.setFromUnitVectors(UP, dir);
  rig.hands[0].position.set(...pose.hands).addScaledVector(dir, 0.05);
  rig.hands[1].position.set(...pose.hands).addScaledVector(dir, 0.24);
}

const batRadius = (y: number) => {
  for (let i = 1; i < BAT_PROFILE.length; i++) {
    const [r1, y1] = BAT_PROFILE[i];
    if (y <= y1) {
      const [r0, y0] = BAT_PROFILE[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
    }
  }
  return 0;
};

/**
 * Smallest gap (m) between the bat or the hands and the helmet (the glossy
 * dome, a hemisphere, and the ear flap on the side facing the pitcher) for
 * this look in this pose; < 0 means they overlap.
 */
export function batClearance(look: Appearance, pose: BatterPose): number {
  const rig: BatterRig = { ...buildSkeleton(look), hands: [new Object3D(), new Object3D()], bat: new Object3D() };
  poseBatter(rig, pose);
  rig.root.updateWorldMatrix(true, true);
  const k = look.headScale * look.scale;
  const local = new Vector3();
  const flap = new Vector3(...HELMET.flap);
  // In head space (unit scale); r is in world metres.
  const gap = (p: Vector3, r: number) => {
    rig.head.worldToLocal(local.copy(p));
    const dy = local.y - HELMET.domeY;
    const rho = Math.hypot(local.x, local.z);
    const dome = dy >= 0 ? Math.hypot(rho, dy) - HELMET.domeRadius : Math.hypot(Math.max(0, rho - HELMET.domeRadius), dy);
    return Math.min(dome, local.distanceTo(flap) - HELMET.flapRadius) * k - r;
  };
  const along = batDir(...pose.bat);
  const p = new Vector3();
  let worst = Math.min(...rig.hands.map((h) => gap(h.position, HAND_RADIUS)));
  for (let y = 0; y <= BAT_LENGTH + 1e-9; y += 0.01) {
    worst = Math.min(worst, gap(p.set(...pose.hands).addScaledVector(along, y), batRadius(y)));
  }
  return worst;
}

// ---------------------------------------------------------------- timeline

/** The front foot is down this long before the ideal contact moment. */
const STRIDE_PLANTED_BEFORE_CONTACT_MS = 150;
/** The bat reaches the plate this long after the tap… */
export const SWING_TO_CONTACT_MS = 70;
/** …then follows through for about this long. */
const SWING_FOLLOW_MS = 360;

interface PitchClock {
  releaseMs: number;
  contactMs: number;
}

/** Pitcher motion time, elapsedMs into a pitch: PITCH_RELEASE exactly at the core's release, the same pace after. */
export function windupTime(elapsedMs: number, pitch: PitchClock): number {
  return (PITCH_RELEASE * Math.max(0, elapsedMs)) / pitch.releaseMs;
}

/** Batter stance time, elapsedMs into a pitch: the stride is planted (STANCE_END) a little before contact. */
export function stanceTime(elapsedMs: number, pitch: PitchClock): number {
  return (STANCE_END * Math.max(0, elapsedMs)) / (pitch.contactMs - STRIDE_PLANTED_BEFORE_CONTACT_MS);
}

/**
 * Swing progress msSinceTap after the tap: accelerating to the plate
 * (SWING_CONTACT at SWING_TO_CONTACT_MS), then carrying that speed into a
 * follow-through that settles at 1.
 */
export function swingProgress(msSinceTap: number): number {
  const T = SWING_TO_CONTACT_MS;
  if (msSinceTap <= 0) return 0;
  if (msSinceTap < T) return SWING_CONTACT * (msSinceTap / T) ** 2;
  // Ease-out power chosen so the speed at contact (2·0.4/T) carries on unchanged.
  const k = (SWING_FOLLOW_MS * (2 * SWING_CONTACT)) / T / (1 - SWING_CONTACT);
  const w = clamp01((msSinceTap - T) / SWING_FOLLOW_MS);
  return SWING_CONTACT + (1 - SWING_CONTACT) * (1 - (1 - w) ** k);
}
