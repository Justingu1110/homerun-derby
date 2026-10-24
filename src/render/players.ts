import { LatheGeometry, Mesh, MeshStandardMaterial, Vector2, Vector3, type Object3D, type Scene } from 'three';
import { makeAppearance, type Appearance } from '../core';
import { buildCharacter } from './character';

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
  sleeve: '#1b2f78',
  belt: '#1b2f78',
  shoe: '#2a4fb8',
  team: 'Stars',
  frontNumberColor: '#ffffff',
  nameOnBack: 'ACE',
});

/** Where the bat meets an on-time pitch, in world space. */
export const CONTACT_POINT = new Vector3();
/** Where the ball leaves the pitcher's hand, in world space. */
export const RELEASE_POINT = new Vector3(-0.3, 1.65, -17.85);

/**
 * Batter's hands (world): set back by the rear shoulder, out over the plate at
 * contact, high over the front shoulder at the finish. They stay outside the
 * helmet, and the bat points away from it, all the way through.
 */
const STANCE_HANDS = new Vector3(-0.42, 0.98, 0.72);
const CONTACT_HANDS = new Vector3(-0.2, 0.8, 0.2);
const FINISH_HANDS = new Vector3(-0.34, 1.42, -0.34);
/** From the hands to the sweet spot. */
const CONTACT_REACH = 0.62;
const UP = new Vector3(0, 1, 0);
const BAT_COLOR = '#e8cf9a';

/** A turned bat: knob, thin handle, swelling to a thick barrel, rounded end. Origin at the knob, along +y. */
function batGeometry(): LatheGeometry {
  const profile: [r: number, y: number][] = [
    [0, 0], [0.034, 0], [0.036, 0.02], [0.024, 0.05], [0.024, 0.32], [0.04, 0.55], [0.058, 0.78], [0.064, 0.93], [0.05, 0.99], [0, 1],
  ];
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r * 1.25, y * 1.05)), 24);
}

function batDir(yawDeg: number, elevDeg: number, out: Vector3): Vector3 {
  const y = yawDeg * DEG;
  const e = elevDeg * DEG;
  return out.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e));
}
CONTACT_POINT.copy(CONTACT_HANDS).addScaledVector(batDir(90, 5, new Vector3()), CONTACT_REACH);

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
  const bat = new Mesh(batGeometry(), new MeshStandardMaterial({ color: BAT_COLOR, roughness: 0.45 }));
  bat.castShadow = true;
  scene.add(bat);
  const hands = new Vector3();
  const dir = new Vector3();
  const [, front] = f.feet;
  const frontHome = front.position.clone();

  const setSwing = (a: number) => {
    let yaw: number;
    let elev: number;
    if (a <= 0.4) {
      const u = easeIn(clamp01(a / 0.4));
      yaw = 10 + 80 * u;
      elev = 58 - 53 * u;
      hands.lerpVectors(STANCE_HANDS, CONTACT_HANDS, u);
    } else {
      const u = easeOut(clamp01((a - 0.4) / 0.6));
      yaw = 90 + 130 * u;
      elev = 5 + 62 * u;
      hands.lerpVectors(CONTACT_HANDS, FINISH_HANDS, u);
    }
    batDir(yaw, elev, dir);
    bat.position.copy(hands);
    bat.quaternion.setFromUnitVectors(UP, dir);
    f.hands[0].position.copy(hands).addScaledVector(dir, 0.05);
    f.hands[1].position.copy(hands).addScaledVector(dir, 0.24);
    // Hips turn through contact; a small lean into the ball, then back up on the follow-through.
    f.torso.rotation.y = 0.9 * smooth(clamp01(a / 0.55));
    f.torso.rotation.z = -0.12 * Math.sin(Math.PI * clamp01(a / 0.8));
    f.syncCuffs();
  };

  const setStride = (u: number) => {
    const s = clamp01(u);
    front.position.set(frontHome.x + 0.14 * smooth(s), frontHome.y + 0.12 * Math.sin(Math.PI * s), frontHome.z);
    // Weight shifts back while the foot is up (load), then forward as it lands.
    f.torso.position.x = 0.05 * smooth(s) - 0.05 * Math.sin(Math.PI * s);
    f.syncCuffs();
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

/** Pitcher on the mound, facing the plate (+z). A left-hander (look.lefty) is the right-hander's motion mirrored. */
export function createPitcher(scene: Scene, look: Appearance = PITCHER_LOOK): Pitcher {
  const f = buildCharacter(look, { headgear: 'cap', mitt: true });
  const sx = look.lefty ? -1 : 1;
  f.root.position.set(0, 0.3, -18.4);
  f.root.add(...f.hands);
  scene.add(f.root);
  const [pivot, lead] = f.feet;
  const leadHome = lead.position.clone();
  const pivotHome = pivot.position.clone();

  const setWindup = (t: number) => {
    track(BALL_HAND, t, f.hands[0].position).x *= sx;
    track(GLOVE_HAND, t, f.hands[1].position).x *= sx;
    // Lean back through the windup, then drive forward over the front leg.
    f.torso.rotation.x = t < 0.7 ? -0.25 * smooth(clamp01(t / 0.7)) : -0.25 + 0.6 * smooth(clamp01((t - 0.7) / 0.3));
    // Coil (turn the back to the batter a little) on the leg kick, uncoil on the throw.
    f.torso.rotation.y = -0.5 * sx * Math.sin(Math.PI * clamp01((t - 0.2) / 0.62));
    // Leg kick with the lead (glove-side) leg, then a stride toward the plate.
    const kick = clamp01((t - 0.3) / 0.55);
    lead.position.set(leadHome.x * sx, leadHome.y + 0.38 * Math.sin(Math.PI * kick), leadHome.z + 0.35 * smooth(kick));
    // The pivot foot drags forward on the follow-through.
    const drag = clamp01((t - 0.85) / 0.35);
    pivot.position.set(sx * (pivotHome.x + 0.08 * drag), pivotHome.y + 0.08 * Math.sin(Math.PI * drag), pivotHome.z + 0.2 * smooth(drag));
    f.syncCuffs();
  };
  setWindup(0);
  return { setWindup, hand: f.hands[0] };
}
