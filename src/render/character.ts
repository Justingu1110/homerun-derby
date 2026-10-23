import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { Appearance } from '../core';

/**
 * Pawapuro-style characters (ADR 0001), built only from primitives and an
 * Appearance: 2-head-tall body, big round head, no arms, hands and feet that
 * float beside the body, toon shading in a few flat steps, ink outline.
 *
 * Local axes: the character faces +z, +y is up, origin is between the feet on
 * the ground. Its back (−z) carries the jersey number.
 */

/** Toon shading steps (shadow, mid, lit). Linear values: the r128 prototype's 110/200/255 after sRGB decode. */
const TOON_STEPS = [70, 190, 255];
const INK = '#1b1124';
const SHOE = '#1d1d26';
const BELT = '#20202a';
const EYE = '#15101c';
const MOUTH = '#7a2b2b';

/** Outline widths (m) per part. */
const LINE = { body: 0.022, head: 0.03, cap: 0.025, small: 0.015, hand: 0.018, foot: 0.02 } as const;

export interface CharacterOptions {
  /** 'cap' for fielders, 'helmet' for the batter. */
  headgear: 'cap' | 'helmet';
  /**
   * Which side gets the helmet ear flap, in local x: +1 = the character's left
   * (+x), −1 = its right. Only used with a helmet; it goes on the side facing the pitcher.
   */
  flapSide?: 1 | -1;
  /** hands[0] is bare (skin colour) instead of gloved: a fielder's throwing hand. */
  bareHand?: boolean;
}

export interface Character {
  /** Place / turn this in the scene. */
  root: Group;
  /** Body and head; rotate it to lean or twist. Pivot at the hips. */
  torso: Group;
  head: Group;
  /** [right (−x), left (+x)], children of root. */
  feet: [Mesh, Mesh];
  /** Floating hands, not attached to anything: add them where they belong (root or scene). hands[1] always wears the glove. */
  hands: [Mesh, Mesh];
}

let gradient: DataTexture | null = null;
function toonGradient(): DataTexture {
  if (gradient) return gradient;
  gradient = new DataTexture(new Uint8Array(TOON_STEPS), TOON_STEPS.length, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export const toon = (color: string, map?: Texture) =>
  new MeshToonMaterial({ color: map ? '#ffffff' : color, map: map ?? null, gradientMap: toonGradient() });

const flat = (color: string) => new MeshBasicMaterial({ color });

let inkMaterial: MeshBasicMaterial | null = null;

/** Inverted-hull outline: a slightly larger back-face-only copy in ink colour. */
export function inked<T extends Mesh>(mesh: T, width: number): T {
  inkMaterial ??= new MeshBasicMaterial({ color: INK, side: BackSide });
  const geo = mesh.geometry;
  geo.computeBoundingSphere();
  const sphere = geo.boundingSphere!;
  const k = width / sphere.radius;
  const hull = new Mesh(geo, inkMaterial);
  hull.scale.setScalar(1 + k);
  hull.position.copy(sphere.center).multiplyScalar(-k);
  mesh.add(hull);
  return mesh;
}

/** Jersey texture: a band wrapped round the body with the number centred on the back. */
function jerseyTexture(look: Appearance): Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext('2d')!;
  x.fillStyle = look.jersey;
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = look.trim;
  x.font = '900 72px system-ui, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  // CylinderGeometry's u = 0.5 is at −z, the character's back.
  x.fillText(look.number, 128, 68);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Builds a character from appearance params. Same params → same look. */
export function buildCharacter(look: Appearance, opts: CharacterOptions): Character {
  const root = new Group();
  const torso = new Group();
  torso.position.y = 0.36;
  root.add(torso);
  const part = (parent: Group, mesh: Mesh, line = 0) => {
    parent.add(line ? inked(mesh, line) : mesh);
    return mesh;
  };

  // Body: jersey (number on the back), rounded shoulders, belt, hips, little legs.
  const body = part(torso, new Mesh(new CylinderGeometry(0.27, 0.31, 0.42, 28), toon(look.jersey, jerseyTexture(look))), LINE.body);
  body.position.y = 0.22;
  const shoulders = part(torso, new Mesh(new SphereGeometry(0.27, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(look.jersey)));
  shoulders.position.y = 0.43;
  shoulders.scale.y = 0.45;
  const belt = part(torso, new Mesh(new CylinderGeometry(0.315, 0.315, 0.06, 28), toon(BELT)));
  belt.position.y = 0;
  const hips = part(torso, new Mesh(new CylinderGeometry(0.31, 0.27, 0.14, 28), toon(look.pants)), LINE.body);
  hips.position.y = -0.1;
  for (const s of [-1, 1]) {
    const leg = part(torso, new Mesh(new SphereGeometry(0.13, 16, 12), toon(look.pants)), LINE.body);
    leg.scale.set(1, 1.15, 1);
    leg.position.set(s * 0.14, -0.22, 0);
  }

  // Head: big round face, vertical oval eyes with a highlight, brows, small mouth, no nose.
  const head = new Group();
  head.position.y = 0.84;
  torso.add(head);
  part(head, new Mesh(new SphereGeometry(0.42, 32, 24), toon(look.skin)), LINE.head);
  for (const s of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.055, 16, 12), flat(EYE));
    eye.scale.set(1, 1.75, 0.5);
    eye.position.set(s * 0.13, 0, 0.39);
    const shine = new Mesh(new SphereGeometry(0.018, 8, 6), flat('#ffffff'));
    shine.position.set(s * 0.13 + 0.018, 0.05, 0.415);
    const brow = new Mesh(new BoxGeometry(0.1, 0.022, 0.02), flat(EYE));
    brow.position.set(s * 0.13, 0.15, 0.385);
    brow.rotation.z = s * -0.12;
    head.add(eye, shine, brow);
  }
  const mouth = new Mesh(new BoxGeometry(0.07, 0.014, 0.01), flat(MOUTH));
  mouth.position.set(0, -0.17, 0.4);
  head.add(mouth);

  // Headgear: a cap (dome + long brim) or a batting helmet (deeper dome, short brim, ear flap).
  const helmet = opts.headgear === 'helmet';
  const dome = part(
    head,
    new Mesh(new SphereGeometry(helmet ? 0.45 : 0.44, 32, 16, 0, Math.PI * 2, 0, Math.PI * (helmet ? 0.56 : 0.5)), toon(look.cap)),
    LINE.cap,
  );
  dome.position.y = helmet ? 0.04 : 0.03;
  const brim = part(head, new Mesh(new CylinderGeometry(0.22, 0.22, 0.03, 24), toon(look.cap)), LINE.small);
  brim.scale.set(1.25, 1, helmet ? 0.8 : 1);
  brim.position.set(0, 0.05, helmet ? 0.41 : 0.43);
  const badge = new Mesh(new CircleGeometry(0.08, 20), flat(look.trim));
  badge.position.set(0, 0.26, helmet ? 0.385 : 0.37);
  badge.rotation.x = -0.6;
  head.add(badge);
  if (helmet) {
    const flap = part(head, new Mesh(new SphereGeometry(0.17, 16, 12), toon(look.cap)), LINE.small);
    flap.scale.set(0.5, 1, 1);
    flap.position.set((opts.flapSide ?? 1) * 0.4, -0.06, 0.02);
  }

  // Floating feet and hands.
  const foot = (side: number) => {
    const m = inked(new Mesh(new SphereGeometry(0.1, 16, 10), toon(SHOE)), LINE.foot);
    m.scale.set(1.2, 0.65, 1.7);
    m.position.set(side * 0.15, 0.06, 0.05);
    root.add(m);
    return m;
  };
  const hand = (color: string) => inked(new Mesh(new SphereGeometry(0.1, 16, 12), toon(color)), LINE.hand);
  const feet: [Mesh, Mesh] = [foot(-1), foot(1)];
  const hands: [Mesh, Mesh] = [hand(opts.bareHand ? look.skin : look.glove), hand(look.glove)];

  return { root, torso, head, feet, hands };
}
