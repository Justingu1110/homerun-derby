import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import { FIELD } from '../core';
import { seededRandom } from './coords';
import { crowdUniforms } from './crowd';
import { STANDS, standsHeight } from './stadium';

/**
 * 3D effects the 全壘打演出 uses: particle bursts (contact sparkle, fireworks,
 * impact sparks), the crowd jumping, the ball's glow and trail, and the ball's
 * bounce after it lands. All are allocated once and reused; each frame they are
 * evaluated as functions of a start time and `now`, never integrated over dt.
 */

const DEG = Math.PI / 180;

// ── Particle bursts ─────────────────────────────────────────────────────────

export interface BurstSpec {
  at: Vector3;
  n: number;
  /** Initial speed (m/s), randomised 60–100%. */
  speed: number;
  /** Point size (world units). */
  size: number;
  lifeMs: number;
  colors: readonly string[];
  /** Downward acceleration, m/s². */
  gravity: number;
}

/** Points per pooled burst; bigger bursts are clipped to this. */
const BURST_CAPACITY = 120;
/** Bursts alive at once; when all are busy the oldest is reused. */
const BURST_POOL = 14;
/** Air drag: velocity decays as e^(−k·t) (the prototype's ×0.985 per 60 Hz frame). */
const DRAG_K = 0.9;

interface Slot {
  points: Points;
  geo: BufferGeometry;
  mat: PointsMaterial;
  vel: Float32Array;
  origin: Vector3;
  n: number;
  startMs: number;
  lifeMs: number;
  gravity: number;
}

export interface Bursts {
  /** Starts a burst at `startMs` (may be in the past: it is drawn as of now). */
  spawn(spec: BurstSpec, startMs: number): void;
  update(nowMs: number): void;
  /** Hides every burst. */
  clear(): void;
}

export function createBursts(scene: Scene): Bursts {
  const rand = seededRandom(909);
  const color = new Color();
  const slots: Slot[] = Array.from({ length: BURST_POOL }, () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(BURST_CAPACITY * 3), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(BURST_CAPACITY * 3), 3));
    const mat = new PointsMaterial({ size: 1, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
    const points = new Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    points.name = 'cinematic-burst';
    scene.add(points);
    return { points, geo, mat, vel: new Float32Array(BURST_CAPACITY * 3), origin: new Vector3(), n: 0, startMs: -Infinity, lifeMs: 0, gravity: 0 };
  });

  const free = (now: number) => slots.find((s) => now - s.startMs >= s.lifeMs) ?? slots.reduce((a, b) => (a.startMs <= b.startMs ? a : b));

  return {
    spawn(spec, startMs) {
      const s = free(startMs);
      s.n = Math.min(spec.n, BURST_CAPACITY);
      s.origin.copy(spec.at);
      s.startMs = startMs;
      s.lifeMs = spec.lifeMs;
      s.gravity = spec.gravity;
      s.mat.size = spec.size;
      const col = s.geo.attributes.color as BufferAttribute;
      const v = new Vector3();
      for (let i = 0; i < s.n; i++) {
        v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(spec.speed * (0.6 + 0.4 * rand()));
        v.toArray(s.vel, i * 3);
        color.set(spec.colors[i % spec.colors.length]).toArray(col.array, i * 3);
      }
      col.needsUpdate = true;
      s.geo.setDrawRange(0, s.n);
    },
    update(now) {
      for (const s of slots) {
        const t = (now - s.startMs) / 1000;
        s.points.visible = t >= 0 && t * 1000 < s.lifeMs;
        if (!s.points.visible) continue;
        const travel = (1 - Math.exp(-DRAG_K * t)) / DRAG_K;
        const drop = 0.5 * s.gravity * t * t;
        const pos = s.geo.attributes.position as BufferAttribute;
        const a = pos.array as Float32Array;
        for (let i = 0; i < s.n; i++) {
          const k = i * 3;
          a[k] = s.origin.x + s.vel[k] * travel;
          a[k + 1] = s.origin.y + s.vel[k + 1] * travel - drop;
          a[k + 2] = s.origin.z + s.vel[k + 2] * travel;
        }
        pos.needsUpdate = true;
        s.mat.opacity = 1 - (t * 1000) / s.lifeMs;
      }
    },
    clear() {
      for (const s of slots) {
        s.startMs = -Infinity;
        s.points.visible = false;
      }
    },
  };
}

// ── Crowd ───────────────────────────────────────────────────────────────────

/** After the cheer's end the crowd calms down at this rate (1/s). */
const CHEER = { decayPerS: 0.8 } as const;

export interface Crowd {
  /** Cheering at full strength from startMs until endMs, then dying down. */
  cheer(startMs: number, endMs: number): void;
  update(nowMs: number): void;
}

/**
 * Drives the stadium crowd (named 'crowd'): only the shader's clock and cheer
 * strength change per frame; the fans' sway, jumps and raised hands are computed on the GPU.
 */
export function createCrowd(scene: Scene): Crowd {
  const uniforms = crowdUniforms(scene.getObjectByName('crowd'));
  if (!uniforms) return { cheer() {}, update() {} };
  let span = { startMs: Infinity, endMs: Infinity };
  return {
    cheer(startMs, endMs) {
      span = { startMs, endMs };
    },
    update(now) {
      const after = (now - span.endMs) / 1000;
      const strength = now < span.startMs ? 0 : after <= 0 ? 1 : Math.exp(-CHEER.decayPerS * after);
      uniforms.uTime.value = now / 1000;
      uniforms.uCheer.value = strength < 0.01 ? 0 : strength;
    },
  };
}

// ── Ball glow and trail ─────────────────────────────────────────────────────

/** Trail beads; bead i sits where the ball was (2i + 1) × this many ms ago (~2 frames at 60 Hz each). */
export const TRAIL = { beads: 12, stepMs: 16.7 } as const;

export interface BallFx {
  glow: Sprite;
  beads: Mesh[];
  hide(): void;
}

export function createBallFx(scene: Scene): BallFx {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.35, 'rgba(255,210,90,.55)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(cv), blending: AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.4, 1.4, 1);
  glow.visible = false;
  scene.add(glow);
  const geo = new SphereGeometry(0.12, 6, 5);
  const beads = Array.from({ length: TRAIL.beads }, (_, i) => {
    const m = new Mesh(geo, new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.6 * (1 - i / TRAIL.beads), depthWrite: false }));
    m.scale.setScalar(1 - i / (TRAIL.beads + 1));
    m.visible = false;
    scene.add(m);
    return m;
  });
  return {
    glow,
    beads,
    hide() {
      glow.visible = false;
      for (const b of beads) b.visible = false;
    },
  };
}

// ── Ball after it lands ─────────────────────────────────────────────────────

const BOUNCE = { gravity: 22, restitution: 0.45, friction: 0.7, maxBounces: 8, restSpeed: 0.6, radius: 0.13 } as const;

/** Height of the surface under a world xz: the stands' slope inside them, else the ground. */
export function floorAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const angle = Math.abs(Math.atan2(x, -z) / DEG);
  if (r >= STANDS.innerRadius && r <= STANDS.outerRadius && angle <= FIELD.foulLineAngle + STANDS.overhang) return standsHeight(r);
  return 0;
}

interface Hop {
  t0: number;
  p: Vector3;
  v: Vector3;
}

/**
 * A ball thrown from `from` with velocity `v`, bouncing on floorAt() until it
 * rests: precomputed as a list of parabolic hops, so position(t) is closed-form.
 */
export function bouncePath(from: Vector3, v: Vector3): (tS: number, out: Vector3) => Vector3 {
  const g = BOUNCE.gravity;
  const hops: Hop[] = [];
  let t0 = 0;
  const p = from.clone();
  const vel = v.clone();
  const landT = (p0: Vector3, vy: number, floor: number) => (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, p0.y - floor))) / g;
  const at = (h: Hop, t: number, out: Vector3) => out.set(h.p.x + h.v.x * t, h.p.y + h.v.y * t - 0.5 * g * t * t, h.p.z + h.v.z * t);
  const tmp = new Vector3();
  for (let i = 0; i < BOUNCE.maxBounces; i++) {
    const hop = { t0, p: p.clone(), v: vel.clone() };
    hops.push(hop);
    // Solve against the floor under the start, then against the floor where that lands.
    let t = landT(p, vel.y, floorAt(p.x, p.z) + BOUNCE.radius);
    at(hop, t, tmp);
    t = landT(p, vel.y, floorAt(tmp.x, tmp.z) + BOUNCE.radius);
    at(hop, t, p);
    const vy = (vel.y - g * t) * -BOUNCE.restitution;
    t0 += t;
    vel.set(vel.x * BOUNCE.friction, vy, vel.z * BOUNCE.friction);
    if (vy < BOUNCE.restSpeed) break;
  }
  const rest = { t0, p: p.clone() };
  return (t, out) => {
    if (t >= rest.t0) return out.copy(rest.p);
    let i = hops.length - 1;
    while (i > 0 && hops[i].t0 > t) i--;
    return at(hops[i], Math.max(0, t - hops[i].t0), out);
  };
}
