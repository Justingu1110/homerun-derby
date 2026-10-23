import { CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, Vector3, type Object3D, type Scene } from 'three';

/**
 * Placeholder pitcher and batter: simple 2-head chibi blocks (big head, floating
 * hands and feet). The real pawapuro-style characters are a later ticket; these
 * only need to show the windup, the pitch release and the swing.
 */

const DEG = Math.PI / 180;
const mat = (color: string) => new MeshLambertMaterial({ color });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeIn = (v: number) => v * v;
const easeOut = (v: number) => 1 - (1 - v) * (1 - v);

interface Figure {
  root: Group;
  torso: Group;
  feet: Mesh[];
  hands: Mesh[];
}

function figure(c: { shirt: string; pants: string; cap: string; glove: string }): Figure {
  const root = new Group();
  const torso = new Group();
  torso.position.y = 0.38;
  root.add(torso);
  const body = new Mesh(new CylinderGeometry(0.25, 0.3, 0.44, 12), mat(c.shirt));
  body.position.y = 0.22;
  const pants = new Mesh(new CylinderGeometry(0.3, 0.26, 0.2, 12), mat(c.pants));
  pants.position.y = -0.1;
  const head = new Group();
  head.position.y = 0.8;
  head.add(new Mesh(new SphereGeometry(0.38, 16, 12), mat('#ffd9b5')));
  const cap = new Mesh(new SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c.cap));
  cap.position.y = 0.03;
  head.add(cap);
  for (const s of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.05, 8, 6), mat('#15101c'));
    eye.scale.set(1, 1.6, 0.5);
    eye.position.set(s * 0.12, 0, 0.35);
    head.add(eye);
  }
  torso.add(body, pants, head);
  const feet = [-1, 1].map((s) => {
    const f = new Mesh(new SphereGeometry(0.1, 10, 8), mat('#1d1d26'));
    f.scale.set(1.2, 0.65, 1.7);
    f.position.set(s * 0.15, 0.06, 0.05);
    root.add(f);
    return f;
  });
  const hands = [0, 1].map(() => new Mesh(new SphereGeometry(0.1, 10, 8), mat(c.glove)));
  return { root, torso, feet, hands };
}

/** Where the bat meets an on-time pitch, in world space. */
export const CONTACT_POINT = new Vector3();
/** Where the ball leaves the pitcher's hand, in world space. */
export const RELEASE_POINT = new Vector3(-0.3, 1.65, -17.85);

const HANDS = new Vector3(-0.53, 0.82, 0.2);
const UP = new Vector3(0, 1, 0);
const BAT_LENGTH = 1.0;

function batDir(yawDeg: number, elevDeg: number, out: Vector3): Vector3 {
  const y = yawDeg * DEG;
  const e = elevDeg * DEG;
  return out.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e));
}
CONTACT_POINT.copy(HANDS).addScaledVector(batDir(90, 5, new Vector3()), 0.72);

export interface Batter {
  /** 0 = stance, 0.4 = bat over the plate (contact), 1 = follow-through. */
  setSwing(a: number): void;
}

export function createBatter(scene: Scene): Batter {
  const f = figure({ shirt: '#f7f7f7', pants: '#f7f7f7', cap: '#d6322b', glove: '#ffffff' });
  f.root.position.set(-0.75, 0, 0.2);
  f.root.rotation.y = Math.PI / 2;
  scene.add(f.root, ...f.hands);
  const batGeo = new CylinderGeometry(0.055, 0.028, BAT_LENGTH, 8);
  batGeo.translate(0, BAT_LENGTH / 2, 0);
  const bat = new Mesh(batGeo, mat('#d9a55b'));
  scene.add(bat);
  const dir = new Vector3();

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
    f.torso.rotation.y = 0.9 * smooth(clamp01(a / 0.55));
  };
  setSwing(0);
  return { setSwing };
}

export interface Pitcher {
  /** Windup progress: 0 = set, 0.85 = release, 1.2 = follow-through. */
  setWindup(t: number): void;
  /** The throwing hand, to carry the ball until release. */
  hand: Object3D;
}

const WINDUP_KEYS: [number, [number, number, number]][] = [
  [0, [0.05, 0.78, 0.3]],
  [0.35, [0, 1.0, 0.15]],
  [0.7, [-0.38, 1.25, -0.45]],
  [0.85, [-0.3, 1.35, 0.55]],
  [1.2, [0.2, 0.55, 0.65]],
];

export function createPitcher(scene: Scene): Pitcher {
  const f = figure({ shirt: '#2a4fb8', pants: '#eeeeee', cap: '#2a4fb8', glove: '#8b5a2b' });
  f.root.position.set(0, 0.3, -18.4);
  f.root.add(...f.hands);
  f.hands[1].position.set(0.25, 0.82, 0.3);
  scene.add(f.root);

  const setWindup = (t: number) => {
    let i = 0;
    while (i < WINDUP_KEYS.length - 2 && t > WINDUP_KEYS[i + 1][0]) i++;
    const [t0, a] = WINDUP_KEYS[i];
    const [t1, b] = WINDUP_KEYS[i + 1];
    const u = smooth(clamp01((t - t0) / (t1 - t0)));
    f.hands[0].position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    f.torso.rotation.x = t < 0.7 ? -0.25 * smooth(clamp01(t / 0.7)) : -0.25 + 0.6 * smooth(clamp01((t - 0.7) / 0.3));
    f.feet[0].position.y = 0.06 + 0.35 * Math.sin(Math.PI * clamp01((t - 0.3) / 0.55));
  };
  setWindup(0);
  return { setWindup, hand: f.hands[0] };
}
