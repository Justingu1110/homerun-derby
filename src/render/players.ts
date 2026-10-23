import { CylinderGeometry, Mesh, Vector3, type Object3D, type Scene } from 'three';
import { makeAppearance, type Appearance } from '../core';
import { buildCharacter, inked, toon } from './character';

/**
 * The batter and the pitcher: pawapuro-style characters (see character.ts)
 * plus their poses. Every pose is a pure function of one progress number, so
 * the at-bat can drive them from the pitch clock.
 */

const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeIn = (v: number) => v * v;
const easeOut = (v: number) => 1 - (1 - v) * (1 - v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Default looks: home batter in whites with a red helmet, visiting pitcher in blue. */
export const BATTER_LOOK = makeAppearance();
export const PITCHER_LOOK = makeAppearance({
  jersey: '#2a4fb8',
  pants: '#eeeeee',
  cap: '#2a4fb8',
  trim: '#ffffff',
  glove: '#8b5a2b',
  number: '18',
});

/** Where the bat meets an on-time pitch, in world space. */
export const CONTACT_POINT = new Vector3();
/** Where the ball leaves the pitcher's hand, in world space. */
export const RELEASE_POINT = new Vector3(-0.3, 1.65, -17.85);

const HANDS = new Vector3(-0.53, 0.82, 0.2);
const UP = new Vector3(0, 1, 0);
const BAT_LENGTH = 1.0;
const BAT_COLOR = '#d9a55b';

function batDir(yawDeg: number, elevDeg: number, out: Vector3): Vector3 {
  const y = yawDeg * DEG;
  const e = elevDeg * DEG;
  return out.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e));
}
CONTACT_POINT.copy(HANDS).addScaledVector(batDir(90, 5, new Vector3()), 0.72);

export interface Batter {
  /** 0 = stance, 0.4 = bat over the plate (contact), 1 = follow-through. */
  setSwing(a: number): void;
  /** Front-foot stride: 0 = stance, 0.5 = foot up, 1 = planted toward the pitcher. */
  setStride(u: number): void;
}

/** Right-handed batter in the box on the third-base side, facing the plate. */
export function createBatter(scene: Scene, look: Appearance = BATTER_LOOK): Batter {
  // Facing +x world puts the character's left (+x local) toward the pitcher: the ear flap goes there.
  const f = buildCharacter(look, { headgear: 'helmet', flapSide: 1 });
  f.root.position.set(-0.75, 0, 0.2);
  f.root.rotation.y = Math.PI / 2;
  scene.add(f.root, ...f.hands);
  const batGeo = new CylinderGeometry(0.055, 0.028, BAT_LENGTH, 12);
  batGeo.translate(0, BAT_LENGTH / 2, 0);
  const bat = inked(new Mesh(batGeo, toon(BAT_COLOR)), 0.012);
  scene.add(bat);
  const dir = new Vector3();
  const [, front] = f.feet;
  const frontHome = front.position.clone();

  const setSwing = (a: number) => {
    let yaw: number;
    let elev: number;
    if (a <= 0.4) {
      const u = easeIn(a / 0.4);
      yaw = -15 + 105 * u;
      elev = 62 - 57 * u;
    } else {
      const u = easeOut((a - 0.4) / 0.6);
      yaw = 90 + 175 * u;
      elev = 5 + 40 * u;
    }
    batDir(yaw, elev, dir);
    bat.position.copy(HANDS);
    bat.quaternion.setFromUnitVectors(UP, dir);
    f.hands[0].position.copy(HANDS).addScaledVector(dir, 0.04);
    f.hands[1].position.copy(HANDS).addScaledVector(dir, 0.16);
    // Hips turn through contact; a small lean into the ball, then back up on the follow-through.
    f.torso.rotation.y = 0.9 * smooth(clamp01(a / 0.55));
    f.torso.rotation.z = -0.12 * Math.sin(Math.PI * clamp01(a / 0.8));
  };

  const setStride = (u: number) => {
    const s = clamp01(u);
    front.position.set(frontHome.x + 0.14 * smooth(s), frontHome.y + 0.12 * Math.sin(Math.PI * s), frontHome.z);
    // Weight shifts back while the foot is up (load), then forward as it lands.
    f.torso.position.x = 0.05 * smooth(s) - 0.05 * Math.sin(Math.PI * s);
  };

  setSwing(0);
  setStride(0);
  return { setSwing, setStride };
}

export interface Pitcher {
  /** Windup progress: 0 = set, 0.85 = release, 1.2 = follow-through. */
  setWindup(t: number): void;
  /** The throwing hand, to carry the ball until release. */
  hand: Object3D;
}

type Key = [t: number, x: number, y: number, z: number];

/** Throwing hand (pitcher-local): set at the chest, up, back behind the head, release in front, down across. */
const BALL_HAND: Key[] = [
  [0, -0.04, 0.78, 0.3],
  [0.35, 0, 1.0, 0.15],
  [0.7, -0.38, 1.25, -0.45],
  [0.85, -0.3, 1.35, 0.55],
  [1.2, 0.2, 0.55, 0.65],
];
/** Glove hand: with the ball at the set, reaches toward the plate on the stride, tucks in at release. */
const GLOVE_HAND: Key[] = [
  [0, 0.18, 0.8, 0.32],
  [0.35, 0.1, 1.0, 0.2],
  [0.65, 0.42, 0.95, 0.45],
  [0.85, 0.32, 0.75, 0.2],
  [1.2, 0.28, 0.7, 0.3],
];

function track(keys: Key[], t: number, out: Vector3): Vector3 {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = smooth(clamp01((t - a[0]) / (b[0] - a[0])));
  return out.set(lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u));
}

/** Right-handed pitcher on the mound, facing the plate (+z). */
export function createPitcher(scene: Scene, look: Appearance = PITCHER_LOOK): Pitcher {
  const f = buildCharacter(look, { headgear: 'cap', bareHand: true });
  f.root.position.set(0, 0.3, -18.4);
  f.root.add(...f.hands);
  scene.add(f.root);
  const [pivot, lead] = f.feet;
  const leadHome = lead.position.clone();
  const pivotHome = pivot.position.clone();

  const setWindup = (t: number) => {
    track(BALL_HAND, t, f.hands[0].position);
    track(GLOVE_HAND, t, f.hands[1].position);
    // Lean back through the windup, then drive forward over the front leg.
    f.torso.rotation.x = t < 0.7 ? -0.25 * smooth(clamp01(t / 0.7)) : -0.25 + 0.6 * smooth(clamp01((t - 0.7) / 0.3));
    // Coil (turn the back to the batter a little) on the leg kick, uncoil on the throw.
    f.torso.rotation.y = -0.5 * Math.sin(Math.PI * clamp01((t - 0.2) / 0.62));
    // Leg kick with the lead (glove-side) leg, then a stride toward the plate.
    const kick = clamp01((t - 0.3) / 0.55);
    lead.position.set(leadHome.x, leadHome.y + 0.38 * Math.sin(Math.PI * kick), leadHome.z + 0.35 * smooth(kick));
    // The pivot foot drags forward on the follow-through.
    const drag = clamp01((t - 0.85) / 0.35);
    pivot.position.set(pivotHome.x + 0.08 * drag, pivotHome.y + 0.08 * Math.sin(Math.PI * drag), pivotHome.z + 0.2 * smooth(drag));
  };
  setWindup(0);
  return { setWindup, hand: f.hands[0] };
}
