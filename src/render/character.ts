import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import type { Appearance } from '../core';

/**
 * Pawapuro-style characters (ADR 0002), built only from primitives and an
 * Appearance: an egg-shaped jersey body with a big round head straight on top
 * (no neck), round pants, no arms, big round hands and two-tone shoes that
 * float beside the body, hair showing under the cap. Soft lit materials that
 * cast shadows; no outline.
 *
 * Local axes: the character faces +z, +y is up, origin is between the feet on
 * the ground. Its back (−z) carries the name and number.
 */

const EYE = '#141018';
const SHOE_WHITE = '#f4f4f4';
const GLOVE_WEB = '#5a3418';
/** Height of the torso pivot (the hips) above the ground. */
export const HIP_Y = 0.36;
/** Skull radius (head space), helmet dome and ear flap (centre in head space, radius), hand radii: for clearance checks. */
export const HEAD_RADIUS = 0.4;
export const HELMET = { domeY: 0.03, domeRadius: 0.445, flap: [0.39, -0.08, 0.02], flapRadius: 0.2 } as const;
export const HAND_RADIUS = 0.15;
export const GLOVE_RADIUS = 0.205;
/** Where a cuff points to: the chest, in torso space (scaled by the torso height). */
const CHEST_Y = 0.26;
/** How far a cuff sits from its hand's centre, toward the chest. */
const CUFF_OFFSET = 0.19;

export interface CharacterOptions {
  /** 'cap' for fielders, 'helmet' for the batter (glossy, with an ear flap). */
  headgear: 'cap' | 'helmet';
  /**
   * Which side gets the helmet ear flap, in local x: +1 = the character's left
   * (+x), −1 = its right. Only used with a helmet; it goes on the side facing the pitcher.
   */
  flapSide?: 1 | -1;
  /** hands[1] wears a big fielding glove and hands[0] is bare: a fielder. Otherwise both wear batting gloves. */
  mitt?: boolean;
}

export interface Character {
  /** Place / turn this in the scene. Carries the appearance's overall scale. */
  root: Group;
  /** Body and head; rotate it to lean or twist. Pivot at the hips. */
  torso: Group;
  head: Group;
  /** Shoes, [right (−x), left (+x)], children of root. Their origin is on the ground. */
  feet: [Group, Group];
  /** Floating hands, not attached to anything: add them where they belong (root or scene). With `mitt`, hands[1] is the glove. */
  hands: [Mesh, Mesh];
  /** Turns each sleeve cuff toward the chest; call after moving the hands or the torso. No-op without sleeves. */
  syncCuffs(): void;
}

const lit = (color: string, roughness = 0.62, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });

const SCRIPT_FONT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", "Dancing Script", cursive';
const BLOCK_FONT = '"Arial Black", "Helvetica Neue", system-ui, sans-serif';

/**
 * Jersey texture, wrapped once round the body sphere: the front (u = 0.25) has
 * the team name in script with a small number below it, the back (u = 0.75) the
 * name over a big number.
 */
function uniformTexture(look: Appearance): Texture {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const x = cv.getContext('2d')!;
  x.fillStyle = look.jersey;
  x.fillRect(0, 0, 1024, 512);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.strokeStyle = '#ffffff';

  // Only a band of the front shows between the chin and the pants (rows ~165–275),
  // so the script sits high and the small number tucks under its tail.
  x.save();
  x.translate(256, 200);
  x.rotate(-0.12);
  x.font = `italic 700 96px ${SCRIPT_FONT}`;
  x.lineWidth = 10;
  x.fillStyle = look.trim;
  x.strokeText(look.team, 0, 0, 340);
  x.fillText(look.team, 0, 0, 340);
  x.fillRect(-150, 46, 290, 8);
  x.restore();

  x.font = `900 52px ${BLOCK_FONT}`;
  x.lineWidth = 7;
  x.fillStyle = look.frontNumberColor;
  x.strokeText(look.number, 352, 262);
  x.fillText(look.number, 352, 262);

  x.fillStyle = look.trim;
  if (look.nameOnBack) {
    x.font = `900 46px ${BLOCK_FONT}`;
    x.fillText(look.nameOnBack, 768, 175, 300);
  }
  x.font = `900 150px ${BLOCK_FONT}`;
  x.lineWidth = 12;
  x.strokeText(look.number, 768, 300);
  x.fillText(look.number, 768, 300);

  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tiny deterministic random source, so the same params always curl the same way. */
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function addHair(head: Group, look: Appearance) {
  const hair = lit(look.hair, 0.8);
  // Back and sides only, just below the cap.
  head.add(new Mesh(new SphereGeometry(0.41, 32, 16, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.42, Math.PI * 0.16), hair));
  if (look.hairStyle === 'long') {
    // Loose curls over the back half of the head, falling to the shoulders.
    const curls = lit(look.hair, 0.85);
    const r = seeded(7);
    for (let k = 0; k < 34; k++) {
      const a = Math.PI * (1.05 + 0.9 * r());
      const y = -0.02 - 0.36 * r();
      const rad = 0.37 + 0.06 * r();
      const curl = new Mesh(new SphereGeometry(0.075 + 0.04 * r(), 10, 8), curls);
      curl.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.95 - 0.03);
      head.add(curl);
    }
  }
  if (look.hairStyle === 'pigtails') {
    for (const s of [-1, 1]) {
      const tie = new Mesh(new TorusGeometry(0.045, 0.018, 8, 16), lit(look.cap, 0.5));
      tie.position.set(s * 0.4, 0, -0.12);
      tie.rotation.y = Math.PI / 2;
      const tail = new Mesh(new SphereGeometry(0.09, 14, 10), lit(look.hair, 0.85));
      tail.scale.set(0.8, 1.6, 0.8);
      tail.position.set(s * 0.47, -0.14, -0.13);
      tail.rotation.z = s * 0.35;
      head.add(tie, tail);
    }
  }
}

function addFace(head: Group, look: Appearance) {
  const skin = lit(look.skin, 0.75);
  const skull = new Mesh(new SphereGeometry(HEAD_RADIUS, 40, 30), skin);
  skull.scale.set(1.04, 0.97, 1);
  head.add(skull);
  const ear = lit(`#${new Color(look.skin).multiplyScalar(0.94).getHexString()}`, 0.75);
  const eyeMat = lit(EYE, 0.25);
  const shineMat = new MeshBasicMaterial({ color: '#ffffff' });
  const browMat = lit(look.hair, 0.8);
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.07, 14, 10), ear);
    e.scale.set(0.5, 1, 0.8);
    e.position.set(s * 0.405, -0.02, 0);
    // Upright oval eyes with a highlight, thick brows.
    const eye = new Mesh(new SphereGeometry(0.052, 20, 14), eyeMat);
    eye.scale.set(0.82, 1.6, 0.4);
    eye.position.set(s * 0.14, 0.02, 0.375);
    const shine = new Mesh(new SphereGeometry(0.017, 10, 8), shineMat);
    shine.position.set(s * 0.14 + 0.018, 0.065, 0.395);
    const brow = new Mesh(new SphereGeometry(0.055, 14, 8), browMat);
    brow.scale.set(1, 0.26, 0.3);
    brow.rotation.z = s * 0.12;
    brow.position.set(s * 0.14, 0.15, 0.37);
    head.add(e, eye, shine, brow);
  }
  if (look.beard === 'mustache') {
    const m = new Mesh(new SphereGeometry(0.06, 14, 10), browMat);
    m.scale.set(1.8, 0.45, 0.45);
    m.position.set(0, -0.12, 0.37);
    head.add(m);
  }
  if (look.goatee) {
    const g = new Mesh(new SphereGeometry(0.055, 14, 10), lit(look.hair, 0.85));
    g.scale.set(1.1, 0.8, 0.6);
    g.position.set(0, -0.27, 0.31);
    head.add(g);
  }
}

function addHeadgear(head: Group, look: Appearance, opts: CharacterOptions) {
  const helmet = opts.headgear === 'helmet';
  // The helmet is glossy (low roughness, a touch of metalness for the sheen); the cap is cloth.
  const mat = helmet ? lit(look.cap, 0.18, 0.15) : lit(look.cap, 0.7);
  const dome = new Mesh(new SphereGeometry(helmet ? HELMET.domeRadius : 0.425, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
  dome.position.y = HELMET.domeY;
  // Half-disc brim, only in front.
  const brim = new Mesh(new CylinderGeometry(0.22, 0.24, 0.035, 28, 1, false, 0, Math.PI), mat);
  brim.rotation.set(-0.12, -Math.PI / 2, 0);
  brim.scale.set(1, 1, helmet ? 0.55 : 0.8);
  brim.position.set(0, 0.06, 0.32);
  head.add(dome, brim);
  if (helmet) {
    const flap = new Mesh(new SphereGeometry(HELMET.flapRadius, 20, 14), mat);
    flap.scale.set(0.45, 1, 0.95);
    flap.position.set((opts.flapSide ?? 1) * HELMET.flap[0], HELMET.flap[1], HELMET.flap[2]);
    head.add(flap);
  } else {
    const badge = new Mesh(new CircleGeometry(0.075, 24), new MeshBasicMaterial({ color: look.trim }));
    badge.position.set(0, 0.25, 0.36);
    badge.rotation.x = -0.62;
    head.add(badge);
  }
}

/** Big two-tone shoe: coloured upper, white toe cap and sole. Origin on the ground. */
function shoe(look: Appearance): Group {
  const f = new Group();
  const upper = new Mesh(new SphereGeometry(0.12, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), lit(look.shoe, 0.5));
  upper.scale.set(1.15, 1, 1.85);
  const toe = new Mesh(new SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lit(SHOE_WHITE, 0.45));
  toe.scale.set(1.1, 0.9, 0.9);
  toe.position.z = 0.12;
  const sole = new Mesh(new CylinderGeometry(0.135, 0.135, 0.03, 24), lit(SHOE_WHITE, 0.6));
  sole.scale.set(1.02, 1, 1.75);
  sole.position.y = 0.012;
  f.add(upper, toe, sole);
  return f;
}

/** A round hand; the fielding glove is bigger (nearly head-sized) with a darker web. Shape is baked into the geometry so children (the cuff) are not stretched. */
function hand(look: Appearance, glove: boolean, bare: boolean): Mesh {
  if (!glove) return new Mesh(new SphereGeometry(HAND_RADIUS, 28, 20), lit(bare ? look.skin : look.glove, 0.7));
  const g = new Mesh(new SphereGeometry(GLOVE_RADIUS / 1.08, 28, 20).scale(1, 1.08, 0.78), lit(look.glove, 0.55));
  const web = new Mesh(new SphereGeometry(0.12, 18, 12).scale(0.9, 0.9, 0.5), lit(GLOVE_WEB, 0.6));
  web.position.set(0, 0.05, 0.12);
  g.add(web);
  return g;
}

const castShadows = (o: Object3D) =>
  o.traverse((m) => {
    if ((m as Mesh).isMesh) m.castShadow = true;
  });

/** The posable parts of a character, without meshes: what a pose moves. */
export interface Skeleton {
  root: Object3D;
  torso: Object3D;
  head: Object3D;
  /** [right (−x), left (+x)]. */
  feet: [Object3D, Object3D];
}

/** Root, torso pivot, head and shoe anchors at their rest places for this look (no meshes, no DOM). */
export function buildSkeleton(look: Appearance): { root: Group; torso: Group; head: Group; feet: [Group, Group] } {
  const root = new Group();
  root.scale.setScalar(look.scale);
  const torso = new Group();
  torso.position.y = HIP_Y;
  root.add(torso);
  const head = new Group();
  head.position.y = 0.64 + (look.torsoHeight - 1) * 0.42;
  head.scale.setScalar(look.headScale);
  torso.add(head);
  const feet: [Group, Group] = [new Group(), new Group()];
  feet.forEach((f, i) => f.position.set((i === 0 ? -1 : 1) * 0.16, 0, 0.05));
  root.add(...feet);
  return { root, torso, head, feet };
}

/** Builds a character from appearance params. Same params → same look. */
export function buildCharacter(look: Appearance, opts: CharacterOptions): Character {
  const { root, torso, head, feet } = buildSkeleton(look);

  // Egg-shaped jersey over round pants and a belt; width and torso height stretch only the body.
  const body = new Group();
  body.scale.set(look.width, look.torsoHeight, look.width);
  torso.add(body);
  const jersey = new Mesh(new SphereGeometry(0.33, 40, 28), new MeshStandardMaterial({ map: uniformTexture(look), roughness: 0.7 }));
  jersey.scale.set(1, 1.02, 0.9);
  jersey.position.y = 0.2;
  const pants = new Mesh(new SphereGeometry(0.31, 36, 24, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), lit(look.pants, 0.75));
  pants.scale.set(1.02, 0.95, 0.92);
  pants.position.y = 0.08;
  const belt = new Mesh(new TorusGeometry(0.305, 0.024, 10, 40), lit(look.belt, 0.5));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.9, 1);
  belt.position.y = 0.06;
  body.add(jersey, pants, belt);

  // Big round head right on the body (no neck).
  addFace(head, look);
  addHair(head, look);
  addHeadgear(head, look, opts);

  feet.forEach((f) => f.add(shoe(look)));

  const hands: [Mesh, Mesh] = [hand(look, false, !!opts.mitt), hand(look, !!opts.mitt, false)];

  // No arms: the undershirt sleeve shows as a cuff just inside each hand.
  const cuffs = look.sleeve
    ? hands.map((h) => {
        const c = new Mesh(new SphereGeometry(0.12, 16, 12).scale(1, 1, 1.4), lit(look.sleeve!, 0.6));
        h.add(c);
        return c;
      })
    : [];
  const chest = new Vector3();
  const local = new Vector3();
  const syncCuffs = () => {
    if (!cuffs.length) return;
    root.updateWorldMatrix(true, true);
    torso.localToWorld(chest.set(0, CHEST_Y * look.torsoHeight, 0));
    cuffs.forEach((c, i) => {
      const h = hands[i];
      h.updateWorldMatrix(true, false);
      h.worldToLocal(local.copy(chest));
      c.position.copy(local.normalize()).multiplyScalar(CUFF_OFFSET);
      c.lookAt(chest);
    });
  };

  castShadows(root);
  hands.forEach(castShadows);
  return { root, torso, head, feet, hands, syncCuffs };
}
