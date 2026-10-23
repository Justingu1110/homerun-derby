import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { FIELD, fieldPoint } from '../core';
import { seededRandom, toWorld } from './coords';

const DEG = Math.PI / 180;

const COLORS = {
  skyTop: '#121a55',
  skyMid: '#5a4a9c',
  skyHorizon: '#ff9a5c',
  fog: '#b9707a',
  foulGrass: '#2f6b2f',
  stripeA: '#4aa24a',
  stripeB: '#3f9140',
  dirt: '#c98a52',
  chalk: '#ffffff',
  wall: '#1c5536',
  wallCap: '#ffd400',
  foulPole: '#ffd400',
  stands: '#2c3f92',
  standsBack: '#1a2256',
  shirts: ['#ff5a5a', '#ffffff', '#ffd23d', '#5ad1ff', '#f08bd0', '#2c2c2c', '#7dff8a', '#ff9d3d'],
} as const;

/** Stands geometry: a sloped ring just behind the outfield wall. */
const STANDS = {
  innerRadius: FIELD.fenceDistance + 3,
  outerRadius: FIELD.fenceDistance + 16,
  rise: 12,
  /** Extra degrees past each foul line. */
  overhang: 7,
} as const;

const CROWD_COUNT = 1300;

const flat = (color: string): Material => new MeshLambertMaterial({ color, side: DoubleSide });
const solid = (color: string): Material => new MeshPhongMaterial({ color, flatShading: true, shininess: 6 });

/** Lays a flat XY geometry onto the ground plane at height `y` (avoids z-fighting between layers). */
function ground(geometry: BufferGeometry, material: Material, y: number): Mesh {
  const m = new Mesh(geometry, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

/** RingGeometry/CircleGeometry theta (after laying flat) for a field angle in degrees. */
const groundTheta = (angleDeg: number) => Math.PI / 2 - angleDeg * DEG;
/** CylinderGeometry theta for a field angle in degrees. */
const cylinderTheta = (angleDeg: number) => Math.PI - angleDeg * DEG;

/** Ground arc spanning field angles [fromDeg, toDeg]. */
function groundArc(inner: number, outer: number, fromDeg: number, toDeg: number, material: Material, y: number) {
  const g = new RingGeometry(inner, outer, Math.max(8, Math.round(toDeg - fromDeg)), 1, groundTheta(toDeg), (toDeg - fromDeg) * DEG);
  return ground(g, material, y);
}

/** Vertical cylinder band spanning field angles [fromDeg, toDeg]. */
function band(radiusTop: number, radiusBottom: number, height: number, fromDeg: number, toDeg: number, material: Material) {
  const g = new CylinderGeometry(radiusTop, radiusBottom, height, 64, 1, true, cylinderTheta(toDeg), (toDeg - fromDeg) * DEG);
  return new Mesh(g, material);
}

/** Height of the stands' seating surface at a given radius. */
export function standsHeight(radius: number): number {
  return 1 + ((radius - STANDS.innerRadius) * STANDS.rise) / (STANDS.outerRadius - STANDS.innerRadius);
}

function sky(): Object3D {
  const R = 900;
  const g = new SphereGeometry(R, 24, 16);
  const pos = g.attributes.position;
  const top = new Color(COLORS.skyTop);
  const mid = new Color(COLORS.skyMid);
  const horizon = new Color(COLORS.skyHorizon);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    const c = y > 0.12 ? mid.clone().lerp(top, clamp01((y - 0.12) / 0.6)) : horizon.clone().lerp(mid, clamp01((y + 0.02) / 0.14));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Mesh(g, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false }));
}

function lights(): Object3D {
  const g = new Group();
  g.add(new HemisphereLight('#d6e2ff', '#3a5a2a', 0.85 * Math.PI));
  const sun = new DirectionalLight('#ffd7b0', 0.9 * Math.PI);
  sun.position.set(-80, 120, 70);
  g.add(sun);
  return g;
}

function playingField(): Object3D {
  const g = new Group();
  const { fenceDistance: fence, foulLineAngle: foul, moundDistance, baseDistance } = FIELD;
  const dirt = flat(COLORS.dirt);
  const chalk = solid(COLORS.chalk);

  g.add(ground(new CircleGeometry(700, 48), flat(COLORS.foulGrass), 0));

  // Mowing stripes across fair territory (read as horizontal bands from behind the batter).
  const stripe = 8;
  const stripeMats = [flat(COLORS.stripeA), flat(COLORS.stripeB)];
  for (let r = 0, i = 0; r < fence; r += stripe, i++) {
    g.add(groundArc(r, Math.min(r + stripe, fence), -foul, foul, stripeMats[i % 2], 0.01));
  }

  // Warning track in front of the wall.
  g.add(groundArc(fence - 4.5, fence, -foul - 1, foul + 1, dirt, 0.02));

  // Infield dirt: the arc around the mound, bounded by (slightly widened) foul lines,
  // with the infield grass square laid on top.
  g.add(ground(infieldDirtShape(), dirt, 0.03));
  const grassSide = baseDistance - 2;
  const infieldGrass = ground(new PlaneGeometry(grassSide, grassSide), stripeMats[0], 0.04);
  infieldGrass.rotation.z = Math.PI / 4;
  infieldGrass.position.z = -(baseDistance * Math.SQRT2) / 2;
  g.add(infieldGrass);

  // Home plate dirt circle and the pitcher's mound.
  g.add(ground(new CircleGeometry(4.2, 24), dirt, 0.05));
  const mound = new Mesh(new CylinderGeometry(2.7, 2.9, 0.3, 20), solid(COLORS.dirt));
  mound.position.copy(toWorld(0, moundDistance, 0.15));
  g.add(mound);
  const rubber = new Mesh(new BoxGeometry(0.6, 0.05, 0.15), chalk);
  rubber.position.copy(toWorld(0, moundDistance, 0.31));
  g.add(rubber);

  // Home plate and bases.
  const plate = new Mesh(new BoxGeometry(0.43, 0.03, 0.43), chalk);
  plate.position.set(0, 0.07, 0);
  g.add(plate);
  for (const [angle, dist] of [
    [foul, baseDistance],
    [0, baseDistance * Math.SQRT2],
    [-foul, baseDistance],
  ]) {
    const base = new Mesh(new BoxGeometry(0.4, 0.08, 0.4), chalk);
    base.position.copy(toWorld(angle, dist, 0.08));
    base.rotation.y = Math.PI / 4;
    g.add(base);
  }

  // Foul lines and foul poles.
  for (const angle of [-foul, foul]) {
    const line = new Mesh(new BoxGeometry(0.12, 0.02, fence), chalk);
    line.position.copy(toWorld(angle, fence / 2, 0.06));
    line.rotation.y = -angle * DEG;
    g.add(line);
    const pole = new Mesh(new CylinderGeometry(0.25, 0.25, 24, 6), solid(COLORS.foulPole));
    pole.position.copy(toWorld(angle, fence + 0.3, 12));
    g.add(pole);
  }
  return g;
}

/** Infield dirt radius, measured from the mound (95 ft). */
const INFIELD_ARC_RADIUS = 28.96;

/**
 * Infield dirt outline in field coordinates: a wedge from home plate out to the
 * arc of radius INFIELD_ARC_RADIUS around the mound, a few degrees wider than
 * the foul lines so the baselines read as dirt paths.
 */
function infieldDirtShape(): ShapeGeometry {
  const m = FIELD.moundDistance;
  const R = INFIELD_ARC_RADIUS;
  const edge = FIELD.foulLineAngle + 2.5;
  const shape = new Shape();
  shape.moveTo(0, -1.5);
  for (let a = -edge; a <= edge + 1e-9; a += 2) {
    // Distance along the ray from home at angle `a` to the circle around the mound.
    const c = m * Math.cos(a * DEG);
    const t = c + Math.sqrt(c * c - m * m + R * R);
    const p = fieldPoint(a, t);
    shape.lineTo(p.x, p.y);
  }
  shape.closePath();
  return new ShapeGeometry(shape, 4);
}

function outfieldWall(): Object3D {
  const g = new Group();
  const { fenceDistance: fence, foulLineAngle: foul } = FIELD;
  const wall = band(fence, fence, 4, -foul, foul, flat(COLORS.wall));
  wall.position.y = 2;
  g.add(wall);
  const cap = band(fence + 0.1, fence + 0.1, 0.4, -foul, foul, flat(COLORS.wallCap));
  cap.position.y = 4.1;
  g.add(cap);
  return g;
}

function stands(): Object3D {
  const g = new Group();
  const { innerRadius, outerRadius, rise, overhang } = STANDS;
  const from = -FIELD.foulLineAngle - overhang;
  const to = FIELD.foulLineAngle + overhang;
  const seats = band(outerRadius, innerRadius, rise, from, to, flat(COLORS.stands));
  seats.position.y = 1 + rise / 2;
  g.add(seats);
  const back = band(outerRadius + 0.2, outerRadius + 0.2, rise + 1.5, from, to, flat(COLORS.standsBack));
  back.position.y = (rise + 1.5) / 2;
  g.add(back);
  g.add(crowd(from + 2, to - 2));
  return g;
}

/** Spectators as one InstancedMesh so ~1300 of them cost a single draw call. */
function crowd(fromDeg: number, toDeg: number): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(0.7, 0.9, 0.5), new MeshLambertMaterial(), CROWD_COUNT);
  const rand = seededRandom(1110);
  const shirts = COLORS.shirts.map((c) => new Color(c));
  const o = new Object3D();
  for (let i = 0; i < CROWD_COUNT; i++) {
    const angle = fromDeg + rand() * (toDeg - fromDeg);
    const r = STANDS.innerRadius + 1 + rand() * (STANDS.outerRadius - STANDS.innerRadius - 1.7);
    toWorld(angle, r, standsHeight(r) + 0.45, o.position);
    o.rotation.y = -angle * DEG;
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, shirts[i % shirts.length]);
  }
  mesh.name = 'crowd';
  return mesh;
}

/** Builds the static ballpark: sky, field, outfield wall and stands. */
export function buildStadium(scene: Scene): void {
  scene.fog = new Fog(COLORS.fog, 240, 800);
  scene.add(sky(), lights(), playingField(), outfieldWall(), stands());
}
