import { LatheGeometry, Mesh, MeshStandardMaterial, Object3D, Vector2, type Scene, type Vector3 } from 'three';
import { makeAppearance, type Appearance } from '../core';
import { buildCharacter } from './character';
import { BAT_PROFILE, batterPose, pitcherPose, poseBatter, posePitcher, releasePoint } from './poses';

/**
 * The batter and the pitcher: pawapuro-style characters (see character.ts)
 * posed from the keyframe tables in poses.ts. Every pose is a pure function of
 * one time number, so the at-bat can drive them from the pitch clock.
 */

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

export { CONTACT_POINT } from './poses';

const BAT_COLOR = '#e8cf9a';

/** A turned bat: knob, thin handle, swelling to a thick barrel, rounded end. Origin at the knob, along +y. */
const batGeometry = () => new LatheGeometry(BAT_PROFILE.map(([r, y]) => new Vector2(r, y)), 24);

export interface Batter {
  /**
   * Stance at motion time t (poses.ts stanceTime): 0 = waggle, load from 0.7,
   * stride planted at STANCE_END. Clears any swing.
   */
  setStance(t: number): void;
  /** Swing from the current stance: 0 = start, 0.4 = bat over the plate (contact), 1 = high finish. */
  setSwing(a: number): void;
  /**
   * 打者甩棒: false lets go of the bat, so setStance/setSwing stop posing it and
   * the cinematic places `bat` itself; true puts it back in the hands.
   */
  holdBat(held: boolean): void;
  /** The bat (a scene child). */
  bat: Object3D;
  /** Tilts the head up by `rad` on top of the current pose (the next setStance/setSwing clears it). */
  lookUp(rad: number): void;
}

/** Right-handed batter in the box on the third-base side, facing the plate. */
export function createBatter(scene: Scene, look: Appearance = BATTER_LOOK): Batter {
  // Facing +x world puts the character's left (+x local) toward the pitcher: the ear flap goes there.
  const f = buildCharacter(look, { headgear: 'helmet', flapSide: 1 });
  scene.add(f.root, ...f.hands);
  const bat = new Mesh(batGeometry(), new MeshStandardMaterial({ color: BAT_COLOR, roughness: 0.45 }));
  bat.castShadow = true;
  scene.add(bat);
  // While the bat is let go, the pose goes to a stand-in and the real bat stays where it was put.
  const holding = { ...f, bat };
  const letGo = { ...f, bat: new Object3D() };
  let held = true;
  let stanceT = 0;
  let lastSwing: number | null = null;
  const apply = (swing: number | null) => {
    lastSwing = swing;
    poseBatter(held ? holding : letGo, batterPose(stanceT, swing));
    f.syncCuffs();
  };
  const batter: Batter = {
    setStance(t) {
      stanceT = t;
      apply(null);
    },
    setSwing: (a) => apply(a),
    holdBat(h) {
      if (h === held) return;
      held = h;
      if (held) apply(lastSwing);
    },
    bat,
    lookUp(rad) {
      f.head.rotation.x -= rad;
    },
  };
  batter.setStance(0);
  return batter;
}

export interface Pitcher {
  /**
   * Motion time (poses.ts): 0 = set, PITCH_RELEASE = ball leaves the hand,
   * PITCH_END = end of the follow-through, PITCH_RESET = back in the set.
   */
  setWindup(t: number): void;
  /**
   * 投手回頭目送: turns the whole pitcher `u` (0..1) of the way to `heading` (yaw, rad;
   * 0 = facing home, π = facing center field). A right-hander turns counter-clockwise
   * seen from above, a left-hander the mirror way. Kept across setWindup (poses never
   * touch the root's rotation); setTurn(0, 0) faces home again.
   */
  setTurn(u: number, heading: number): void;
  /** The throwing hand, to carry the ball until release. */
  hand: Object3D;
  /** Where this pitcher's ball hand is at PITCH_RELEASE (world): the pitch starts here. */
  releasePoint: Readonly<Vector3>;
  /** The whole figure (hands included), e.g. to hide it. setTurn owns root.rotation.y. */
  root: Object3D;
}

/** Pitcher on the mound, facing the plate (+z). A left-hander (look.lefty) is the right-hander's motion mirrored. */
export function createPitcher(scene: Scene, look: Appearance = PITCHER_LOOK): Pitcher {
  const f = buildCharacter(look, { headgear: 'cap', mitt: true });
  f.root.add(...f.hands);
  scene.add(f.root);
  const setWindup = (t: number) => {
    posePitcher(f, pitcherPose(t, look.lefty));
    f.syncCuffs();
  };
  setWindup(0);
  const setTurn = (u: number, heading: number) => {
    const ccw = ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    f.root.rotation.y = u * (look.lefty ? ccw - 2 * Math.PI : ccw);
  };
  return { setWindup, setTurn, hand: f.hands[0], releasePoint: releasePoint(look), root: f.root };
}
