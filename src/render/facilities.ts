import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  Points,
  PointsMaterial,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { FACILITIES, type BattedBall, type Facility, type FacilityKind, type Landing } from '../core';
import { seededRandom, toWorld } from './coords';
import { STANDS, standsHeight } from './stadium';

/**
 * 設施 past the outfield wall, built from the core's FACILITIES table, and
 * their impact / 打碎 effects. Every effect is a pure function of its start
 * time and `now`, like the rest of the at-bat: nothing accumulates frame dt.
 */

const DEG = Math.PI / 180;

/** Presentation constants (rules live in src/core/tuning.ts). */
const FX = {
  /** Facility wobble after a hit (not 打碎). */
  wobbleMs: 650,
  wobbleRad: 0.06,
  /** Spark burst at the impact point. */
  sparkCount: 60,
  sparkMs: 900,
  sparkSpeed: 14,
  sparkSize: 1.4,
  /** Shards when 打碎. */
  shardCount: 44,
  shardGravity: 22,
  /** Sideways scatter speed range (m/s). */
  shardSpread: 26,
  /** Shards still in the air after this long are frozen where they are (they've left the screen). */
  shardMaxFlightMs: 4000,
} as const;

const COLORS = {
  frame: '#2a2d38',
  concrete: '#8d93a3',
  concreteDark: '#5d6272',
  bulb: '#fff4c8',
  bulbOff: '#3b3d45',
  glass: '#9fd3ff',
  glassBroken: '#2b3a4a',
  scoreboardBg: '#0d1020',
  scoreboardFg: '#ffc83d',
  carPaints: ['#d6322b', '#2a4fb8', '#f4f4f4', '#ffc83d', '#1f8a5b', '#151515', '#9aa3b5', '#ff7a1a'],
  spark: ['#ffffff', '#fff1a8', '#ffd23d'],
} as const;

/** Billboard ads, by facility id. Purely decorative. */
const ADS: Record<string, { lines: string[]; bg: string; fg: string }> = {
  'billboard-L1': { lines: ['全壘打可樂'], bg: '#d6322b', fg: '#ffffff' },
  'billboard-L2': { lines: ['炸雞 24H'], bg: '#ffc83d', fg: '#4a1d00' },
  'billboard-L3': { lines: ['MOONSHOT'], bg: '#121a55', fg: '#ffc83d' },
  'billboard-L4': { lines: ['手套 5 折'], bg: '#ffffff', fg: '#1a2256' },
  'billboard-R3': { lines: ['HR BANK'], bg: '#1f8a5b', fg: '#ffffff' },
  'billboard-R4': { lines: ['打中這塊', '送你一台車'], bg: '#ff7a1a', fg: '#ffffff' },
};

const solid = (color: string): Material => new MeshPhongMaterial({ color, flatShading: true, shininess: 6 });
const box = (w: number, h: number, d: number, material: Material | Material[]) => new Mesh(new BoxGeometry(w, h, d), material);

function signTexture(lines: string[], bg: string, fg: string, w = 512, h = 192, cracked = false): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const font = (px: number) => `900 ${px}px "Noto Sans TC", "PingFang TC", sans-serif`;
  let size = h / (lines.length * 1.25);
  x.font = font(size);
  const widest = Math.max(...lines.map((l) => x.measureText(l).width));
  if (widest > w * 0.9) size *= (w * 0.9) / widest;
  x.font = font(size);
  lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  if (cracked) {
    const rand = seededRandom(w + h);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      x.beginPath();
      let px = w * (0.35 + rand() * 0.3);
      let py = h * (0.35 + rand() * 0.3);
      x.moveTo(px, py);
      for (let j = 0; j < 5; j++) {
        px += (rand() - 0.5) * w * 0.3;
        py += (rand() - 0.5) * h * 0.5;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Box materials with a texture on the +z face (the side facing home plate). */
function faced(texture: CanvasTexture): Material[] {
  const dark = solid(COLORS.frame);
  return [dark, dark, dark, dark, new MeshBasicMaterial({ map: texture }), dark];
}

/** One facility's model: `intact` shows until 打碎, then `broken`. */
interface Model {
  facility: Facility;
  root: Group;
  intact: Object3D;
  broken: Object3D;
  /** Colours its shards take. */
  shardColors: string[];
  /** Shard size, metres. */
  shardSize: number;
}

/** Places a group on the facility's spot, facing home plate. */
function placed(f: Facility, distance = f.distance, height = 0): Group {
  const g = new Group();
  toWorld(f.angle, distance, height, g.position);
  g.rotation.y = -f.angle * DEG;
  return g;
}

function billboard(f: Facility): Model {
  const ad = ADS[f.id] ?? { lines: ['HOME RUN'], bg: '#ffffff', fg: '#121a55' };
  const root = placed(f);
  const panelH = 4.5;
  const intact = box(f.width, panelH, 0.5, faced(signTexture(ad.lines, ad.bg, ad.fg)));
  intact.position.y = f.height;
  const postTop = f.height - panelH / 2;
  for (const x of [-f.width * 0.35, f.width * 0.35]) {
    const post = box(0.4, postTop - 10, 0.4, solid(COLORS.frame));
    post.position.set(x, 10 + (postTop - 10) / 2, -0.3);
    root.add(post);
  }
  // Broken: a jagged stub of the panel hanging off one post.
  const broken = new Group();
  const stub = box(f.width * 0.35, panelH * 0.55, 0.5, faced(signTexture(ad.lines, ad.bg, ad.fg, 512, 192, true)));
  stub.position.set(-f.width * 0.3, postTop + 0.8, 0);
  stub.rotation.z = -0.35;
  broken.add(stub);
  root.add(intact, broken);
  return { facility: f, root, intact, broken, shardColors: [ad.bg, ad.fg, COLORS.frame], shardSize: 1.5 };
}

function scoreboard(f: Facility): Model {
  const root = placed(f);
  const h = 12;
  const lines = ['HOME RUN DERBY', 'HR ★ ★ ★'];
  const intact = box(f.width, h, 1.5, faced(signTexture(lines, COLORS.scoreboardBg, COLORS.scoreboardFg, 640, 300)));
  intact.position.y = f.height;
  for (const x of [-f.width * 0.35, f.width * 0.35]) {
    const leg = box(1.6, f.height - h / 2, 1.6, solid(COLORS.frame));
    leg.position.set(x, (f.height - h / 2) / 2, -0.6);
    root.add(leg);
  }
  // Broken: a dead, cracked screen, sagging, with its top-right corner gone.
  const broken = new Group();
  const dead = signTexture(['ERROR'], '#15161c', '#ff3b3b', 640, 300, true);
  const left = box(f.width * 0.62, h, 1.5, faced(dead));
  left.position.set(-f.width * 0.19, f.height - 0.6, 0);
  left.rotation.z = 0.05;
  const right = box(f.width * 0.38, h * 0.55, 1.5, solid(COLORS.frame));
  right.position.set(f.width * 0.31, f.height - h * 0.22 - 0.6, 0);
  right.rotation.z = -0.12;
  broken.add(left, right);
  root.add(intact, broken);
  return { facility: f, root, intact, broken, shardColors: [COLORS.scoreboardBg, COLORS.scoreboardFg, COLORS.frame, '#ffffff'], shardSize: 2 };
}

function lightTower(f: Facility): Model {
  const root = placed(f);
  const poleH = f.height - 2;
  const pole = new Mesh(new CylinderGeometry(0.6, 1, poleH, 6), solid(COLORS.frame));
  pole.position.set(0, poleH / 2, -1.5);
  root.add(pole);
  const head = (on: boolean) => {
    const g = new Group();
    g.position.y = f.height;
    g.rotation.x = -0.25; // tilted down toward the field
    g.add(box(f.width, 4.6, 0.8, solid(COLORS.frame)));
    const bulb = new MeshBasicMaterial({ color: on ? COLORS.bulb : COLORS.bulbOff, fog: !on });
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        const b = new Mesh(new CircleGeometry(0.85, 10), bulb);
        b.position.set((i - 1.5) * (f.width / 4.2), (j - 0.5) * 2.2, 0.45);
        g.add(b);
      }
    return g;
  };
  const intact = head(true);
  // Broken: lamps out, the head knocked crooked.
  const broken = head(false);
  broken.rotation.z = 0.45;
  broken.position.y -= 1.2;
  root.add(intact, broken);
  return { facility: f, root, intact, broken, shardColors: [COLORS.bulb, COLORS.frame, '#ffffff'], shardSize: 1.1 };
}

/** Cars are drawn a bit larger than life so they still read as cars from home plate. */
const CAR_SCALE = 1.3;

function car(f: Facility, paint: string): Model {
  const deckTop = f.height - 1.2;
  const root = placed(f, f.distance, deckTop);
  const build = (crushed: boolean) => {
    const g = new Group();
    g.scale.setScalar(CAR_SCALE);
    // Parked side-on to home plate: its length runs across the view.
    const body = box(4.2, 1.1, 1.9, solid(paint));
    body.position.y = 0.75;
    const cab = box(2.4, 0.8, 1.7, solid(crushed ? COLORS.glassBroken : COLORS.glass));
    cab.position.set(-0.2, 1.7, 0);
    g.add(body, cab);
    if (crushed) {
      cab.scale.y = 0.35;
      cab.position.y = 1.4;
      body.scale.y = 0.8;
      g.rotation.z = 0.08;
    }
    return g;
  };
  const intact = build(false);
  const broken = build(true);
  root.add(intact, broken);
  return { facility: f, root, intact, broken, shardColors: [paint, COLORS.glass, '#ffffff'], shardSize: 0.9 };
}

/** The parking deck the cars sit on: a concrete block behind the right-center stands. */
function parkingDeck(cars: Facility[]): Object3D {
  const g = new Group();
  if (cars.length === 0) return g;
  const top = cars[0].height - 1.2;
  const pad = 2.6;
  const from = Math.min(...cars.map((c) => c.angle)) - 1.4;
  const to = Math.max(...cars.map((c) => c.angle)) + 1.4;
  const inner = Math.min(...cars.map((c) => c.distance)) - pad;
  const outer = Math.max(...cars.map((c) => c.distance)) + pad;
  const roof = new Mesh(new RingGeometry(inner, outer, 16, 1, Math.PI / 2 - to * DEG, (to - from) * DEG), new MeshLambertMaterial({ color: COLORS.concrete, side: DoubleSide }));
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = top;
  g.add(roof);
  for (const [r, color] of [
    [inner, COLORS.concreteDark],
    [outer, COLORS.concrete],
  ] as const) {
    const wall = new Mesh(
      new CylinderGeometry(r, r, top, 24, 1, true, Math.PI - to * DEG, (to - from) * DEG),
      new MeshLambertMaterial({ color, side: DoubleSide }),
    );
    wall.position.y = top / 2;
    g.add(wall);
  }
  // A parapet along the front edge, low enough to keep the cars in view.
  const parapet = new Mesh(
    new CylinderGeometry(inner, inner, 0.6, 24, 1, true, Math.PI - to * DEG, (to - from) * DEG),
    new MeshLambertMaterial({ color: '#ffd400', side: DoubleSide }),
  );
  parapet.position.y = top + 0.3;
  g.add(parapet);
  return g;
}

function buildModel(f: Facility, paint: () => string): Model {
  const builders: Record<FacilityKind, () => Model> = {
    billboard: () => billboard(f),
    scoreboard: () => scoreboard(f),
    lightTower: () => lightTower(f),
    car: () => car(f, paint()),
  };
  return builders[f.kind]();
}

/** A burst of shards or sparks: everything is computed from `startMs`. */
interface Debris {
  object: Object3D;
  startMs: number;
  update(nowMs: number): void;
}

const gravityPos = (p0: Vector3, v: Vector3, g: number, t: number, out: Vector3) =>
  out.set(p0.x + v.x * t, p0.y + v.y * t - 0.5 * g * t * t, p0.z + v.z * t);

/** Height of whatever a falling shard lands on at this world xz. */
function surfaceAt(x: number, z: number, deck: { inner: number; outer: number; from: number; to: number; top: number } | null): number {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(x, -z) / DEG;
  if (deck && r >= deck.inner && r <= deck.outer && angle >= deck.from && angle <= deck.to) return deck.top;
  if (r >= STANDS.innerRadius && r <= STANDS.outerRadius) return standsHeight(r);
  return 0;
}

export interface FacilityView {
  /** World point where a 全壘打 with this landing ends: on the facility it hits, or on the stands. */
  impactPoint(ball: BattedBall, landing: Landing, out?: Vector3): Vector3;
  /**
   * Plays the ball reaching its landing at `atMs`: a facility wobbles and sparks;
   * if the hit 打碎 it, it switches to its broken model and throws shards along `travel`
   * (the ball's horizontal direction). Stands landings do nothing here.
   */
  impact(ball: BattedBall, landing: Landing, atMs: number, travel: Vector3): void;
  /**
   * Shows exactly these facilities as 打碎 and the rest intact. Restoring a facility
   * (a new round) also clears all debris. Call with RoundState.smashed.
   */
  sync(smashedIds: readonly string[]): void;
  /** Root object of a facility (for framing it in a camera shot). */
  object(id: string): Object3D | undefined;
  /** Call every frame with performance.now(). */
  update(nowMs: number): void;
}

export function createFacilityView(scene: Scene): FacilityView {
  const rand = seededRandom(808);
  const models = new Map<string, Model>();
  const group = new Group();
  group.name = 'facilities';
  const cars = FACILITIES.filter((f) => f.kind === 'car');
  group.add(parkingDeck(cars));
  const deck =
    cars.length > 0
      ? {
          inner: Math.min(...cars.map((c) => c.distance)) - 2.6,
          outer: Math.max(...cars.map((c) => c.distance)) + 2.6,
          from: Math.min(...cars.map((c) => c.angle)) - 1.4,
          to: Math.max(...cars.map((c) => c.angle)) + 1.4,
          top: cars[0].height - 1.2,
        }
      : null;
  for (const f of FACILITIES) {
    const m = buildModel(f, () => COLORS.carPaints[Math.floor(rand() * COLORS.carPaints.length)]);
    m.root.name = `facility:${f.id}`;
    m.broken.visible = false;
    models.set(f.id, m);
    group.add(m.root);
  }
  scene.add(group);

  const broken = new Set<string>();
  let debris: Debris[] = [];
  const wobbles = new Map<string, number>();

  const setBroken = (id: string, on: boolean) => {
    const m = models.get(id);
    if (!m) return;
    m.intact.visible = !on;
    m.broken.visible = on;
    if (on) broken.add(id);
    else broken.delete(id);
  };

  const clearDebris = () => {
    for (const d of debris) {
      scene.remove(d.object);
      d.object.traverse((o) => {
        if (o instanceof Mesh || o instanceof Points || o instanceof InstancedMesh) {
          o.geometry.dispose();
          (o.material as Material).dispose();
        }
      });
    }
    debris = [];
  };

  const sparks = (at: Vector3, startMs: number, travel: Vector3): Debris => {
    const n = FX.sparkCount;
    const p0 = at.clone();
    const vs: Vector3[] = [];
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(FX.sparkSpeed * (0.5 + rand() * 0.5));
      v.addScaledVector(travel, -4); // bounce back off the facility
      vs.push(v);
      new Color(COLORS.spark[i % COLORS.spark.length]).toArray(col, i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const mat = new PointsMaterial({ size: FX.sparkSize, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    const pts = new Points(geo, mat);
    const tmp = new Vector3();
    return {
      object: pts,
      startMs,
      update(now) {
        const t = Math.max(0, now - startMs);
        pts.visible = t < FX.sparkMs;
        if (!pts.visible) return;
        for (let i = 0; i < n; i++) gravityPos(p0, vs[i], 9, t / 1000, tmp).toArray(pos, i * 3);
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - t / FX.sparkMs;
      },
    };
  };

  const shards = (m: Model, at: Vector3, startMs: number, travel: Vector3): Debris => {
    const n = FX.shardCount;
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 0.25), new MeshPhongMaterial({ flatShading: true, shininess: 10 }), n);
    const center = new Vector3();
    m.intact.getWorldPosition(center);
    const size = Math.max(m.facility.width, 2);
    const items = Array.from({ length: n }, (_, i) => {
      // Start somewhere on the facility, biased toward the impact point.
      const p0 = center.clone().lerp(at, 0.5 + rand() * 0.5);
      p0.x += (rand() - 0.5) * size * 0.6;
      p0.y += (rand() - 0.5) * size * 0.3;
      // Mostly onward with the ball, a few knocked back, all flung up and out.
      const v = travel
        .clone()
        .multiplyScalar(-2 + rand() * 16)
        .add(new Vector3((rand() - 0.5) * FX.shardSpread, 5 + rand() * 14, (rand() - 0.5) * FX.shardSpread));
      // Land time: solve against the surface under the start, then re-solve against the one under that landing.
      const landT = (floor: number) => (v.y + Math.sqrt(v.y * v.y + 2 * FX.shardGravity * Math.max(0, p0.y - floor))) / FX.shardGravity;
      let t = landT(surfaceAt(p0.x, p0.z, deck));
      const end = gravityPos(p0, v, FX.shardGravity, t, new Vector3());
      t = Math.min(landT(surfaceAt(end.x, end.z, deck)), FX.shardMaxFlightMs / 1000);
      mesh.setColorAt(i, new Color(m.shardColors[i % m.shardColors.length]));
      return {
        p0,
        v,
        landS: t,
        scale: m.shardSize * (0.5 + rand() * 1.1),
        spin: new Vector3((rand() - 0.5) * 18, (rand() - 0.5) * 18, (rand() - 0.5) * 18),
      };
    });
    const o = new Object3D();
    const update = (now: number) => {
      const t = Math.max(0, now - startMs) / 1000;
      for (let i = 0; i < n; i++) {
        const s = items[i];
        const tt = Math.min(t, s.landS);
        gravityPos(s.p0, s.v, FX.shardGravity, tt, o.position);
        o.rotation.set(s.spin.x * tt, s.spin.y * tt, s.spin.z * tt);
        o.scale.setScalar(s.scale);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    update(startMs);
    mesh.name = `shards:${m.facility.id}`;
    return { object: mesh, startMs, update };
  };

  const tmp = new Vector3();

  return {
    impactPoint(ball, landing, out = new Vector3()) {
      if (landing.kind === 'facility') {
        const f = landing.facility;
        // Hit the facility's face where the ball's direction crosses it, kept on the model.
        const half = (Math.atan((f.width * 0.45) / f.distance) * 180) / Math.PI;
        const angle = Math.min(f.angle + half, Math.max(f.angle - half, ball.angle));
        return toWorld(angle, f.distance - 0.5, f.height, out);
      }
      const r = Math.min(STANDS.outerRadius - 1, Math.max(STANDS.innerRadius + 1, ball.distance));
      return toWorld(ball.angle, r, standsHeight(r) + 0.13, out);
    },

    impact(ball, landing, atMs, travel) {
      if (landing.kind !== 'facility') return;
      const m = models.get(landing.facility.id);
      if (!m) return;
      const at = this.impactPoint(ball, landing, tmp).clone();
      const dir = travel.clone().setY(0).normalize();
      const add = (d: Debris) => {
        scene.add(d.object);
        debris.push(d);
      };
      add(sparks(at, atMs, dir));
      if (landing.smashed) {
        setBroken(m.facility.id, true);
        add(shards(m, at, atMs, dir));
      } else if (!broken.has(m.facility.id)) {
        wobbles.set(m.facility.id, atMs);
      }
    },

    sync(smashedIds) {
      const want = new Set(smashedIds);
      let restored = false;
      for (const id of [...broken]) {
        if (!want.has(id)) {
          setBroken(id, false);
          restored = true;
        }
      }
      for (const id of want) if (!broken.has(id)) setBroken(id, true);
      if (restored || want.size === 0) {
        clearDebris();
        wobbles.clear();
      }
    },

    object(id) {
      return models.get(id)?.root;
    },

    update(now) {
      for (const d of debris) d.update(now);
      for (const [id, startMs] of wobbles) {
        const m = models.get(id)!;
        const t = (now - startMs) / FX.wobbleMs;
        if (t >= 1 || t < 0 || broken.has(id)) {
          m.intact.rotation.z = 0;
          if (t >= 1 || broken.has(id)) wobbles.delete(id);
          continue;
        }
        m.intact.rotation.z = FX.wobbleRad * Math.sin(t * Math.PI * 7) * (1 - t);
      }
    },
  };
}
