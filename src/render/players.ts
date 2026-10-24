import { LatheGeometry, Mesh, MeshStandardMaterial, Vector2, type Object3D, type Scene, type Vector3 } from 'three';
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
}

/** Right-handed batter in the box on the third-base side, facing the plate. */
export function createBatter(scene: Scene, look: Appearance = BATTER_LOOK): Batter {
  // Facing +x world puts the character's left (+x local) toward the pitcher: the ear flap goes there.
  const f = buildCharacter(look, { headgear: 'helmet', flapSide: 1 });
  scene.add(f.root, ...f.hands);
  const bat = new Mesh(batGeometry(), new MeshStandardMaterial({ color: BAT_COLOR, roughness: 0.45 }));
  bat.castShadow = true;
  scene.add(bat);
  const rig = { ...f, bat };
  let stanceT = 0;
  const apply = (swing: number | null) => {
    poseBatter(rig, batterPose(stanceT, swing));
    f.syncCuffs();
  };
  const batter: Batter = {
    setStance(t) {
      stanceT = t;
      apply(null);
    },
    setSwing: (a) => apply(a),
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
  /** The throwing hand, to carry the ball until release. */
  hand: Object3D;
  /** Where this pitcher's ball hand is at PITCH_RELEASE (world): the pitch starts here. */
  releasePoint: Readonly<Vector3>;
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
  return { setWindup, hand: f.hands[0], releasePoint: releasePoint(look) };
}
