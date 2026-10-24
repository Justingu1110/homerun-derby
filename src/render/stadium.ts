import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { FIELD, fieldPoint } from '../core';
import { seededRandom, toWorld } from './coords';
import { buildCrowd } from './crowd';
import { STAND_ROWS, STANDS } from './stands';

export { STAND_ROWS, STANDS, standsHeight, type StandRow } from './stands';

const DEG = Math.PI / 180;

/** Daytime Pawapuro palette, from prototype v6. */
const COLORS = {
  skyTop: '#2f78d8',
  skyMid: '#6fb0f0',
  skyHorizon: '#dcecff',
  fog: '#dcecff',
  foulGrass: '#3f8a35',
  checkA: '#56a83f',
  checkB: '#4b9a37',
  infieldGrass: '#56a83f',
  skin: '#b8643c',
  homeSkin: '#a9572f',
  warningTrack: '#a8623e',
  chalk: '#ffffff',
  wallCap: '#ffd400',
  foulPole: '#ffd400',
  seatA: '#2a55a6',
  seatB: '#2f5fb8',
  riser: '#5a6475',
  facade: '#1d2a4f',
} as const;

/** Made-up sponsors for the ad boards (no real brands), and their [background, text] colours. */
const AD_NAMES = ['MOONSHOT', '全壘打可樂', '炸雞24H', 'HR BANK', '手套5折', 'ナイス野球', 'SLUGGER', '月光電機', 'DERBY TV', '本壘保險', 'CURVE CAFE', '球場便當'];
const AD_COLORS = [
  ['#1f2a6b', '#ffffff'],
  ['#d6322b', '#ffffff'],
  ['#ffc83d', '#1a1a1a'],
  ['#ffffff', '#1f2a6b'],
  ['#1f8a5b', '#ffffff'],
  ['#111111', '#ffc83d'],
  ['#ff7a1a', '#ffffff'],
] as const;

/** Stands-front ad band: just in front of the first row, its top a little above the front row's seats. */
const STANDS_FRONT = { radius: STANDS.innerRadius - 0.4, top: STANDS.frontHeight + 0.5, adHeight: 1.2 } as const;

const flat = (color: string): Material => new MeshLambertMaterial({ color, side: DoubleSide });

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

/** Vertical cylinder band spanning field angles [fromDeg, toDeg], from y = bottom to y = top. */
function band(radius: number, bottom: number, top: number, fromDeg: number, toDeg: number, material: Material) {
  const g = new CylinderGeometry(radius, radius, top - bottom, Math.max(16, Math.round(toDeg - fromDeg)), 1, true, cylinderTheta(toDeg), (toDeg - fromDeg) * DEG);
  const m = new Mesh(g, material);
  m.position.y = (bottom + top) / 2;
  return m;
}

/** A 2D canvas of the given size and its context. */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function canvasTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * A strip of `panels` sponsor boards, `panelW`×`panelH` px each, repeated `repeat`
 * times around a band. CylinderGeometry's u runs right-to-left as seen from inside,
 * so the repeat is negative: the text reads left-to-right from the field.
 */
function adStrip(panels: number, panelW: number, panelH: number, seed: number, repeat: number): CanvasTexture {
  const [c, x] = canvas(panels * panelW, panelH);
  for (let i = 0; i < panels; i++) {
    const [bg, fg] = AD_COLORS[(i * 5 + seed) % AD_COLORS.length];
    x.fillStyle = bg;
    x.fillRect(i * panelW, 0, panelW, panelH);
    x.fillStyle = fg;
    x.font = `900 ${Math.round(panelH * 0.46)}px system-ui, "Noto Sans TC", sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(AD_NAMES[(i * 7 + seed) % AD_NAMES.length], i * panelW + panelW / 2, panelH * 0.54, panelW - 20);
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(i * panelW, 0, 3, panelH);
  }
  const t = canvasTexture(c);
  t.anisotropy = 8;
  t.wrapS = RepeatWrapping;
  t.repeat.x = -repeat;
  return t;
}

/** A cylinder band of ad boards; each board keeps its canvas aspect ratio (256 × panelH px). */
function adBand(radius: number, bottom: number, top: number, fromDeg: number, toDeg: number, seed: number, panelH: number) {
  const panels = 12;
  const boardM = ((top - bottom) * 256) / panelH;
  const arc = radius * (toDeg - fromDeg) * DEG;
  const repeat = Math.max(1, Math.round(arc / boardM / panels));
  const map = adStrip(panels, 256, panelH, seed, repeat);
  return band(radius, bottom, top, fromDeg, toDeg, new MeshLambertMaterial({ map, side: DoubleSide }));
}

function sky(): Object3D {
  const g = new Group();
  const R = 900;
  const sphere = new SphereGeometry(R, 32, 16);
  const pos = sphere.attributes.position;
  const top = new Color(COLORS.skyTop);
  const mid = new Color(COLORS.skyMid);
  const horizon = new Color(COLORS.skyHorizon);
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    const c = y > 0.1 ? mid.clone().lerp(top, clamp01((y - 0.1) / 0.6)) : horizon.clone().lerp(mid, clamp01((y + 0.02) / 0.12));
    colors.push(c.r, c.g, c.b);
  }
  sphere.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.add(new Mesh(sphere, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false })));

  // A few soft clouds: one puffy canvas on billboard sprites.
  const [c, x] = canvas(256, 128);
  for (let i = 0; i < 9; i++) {
    const cx = 40 + i * 22;
    const cy = 70 + Math.sin(i) * 14;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, 46);
    gr.addColorStop(0, 'rgba(255,255,255,.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 128);
  }
  const material = new SpriteMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
  const rand = seededRandom(2016);
  const between = (a: number, b: number) => a + rand() * (b - a);
  for (let i = 0; i < 9; i++) {
    const cloud = new Sprite(material);
    toWorld(between(-80, 80), between(380, 600), between(110, 230), cloud.position);
    cloud.scale.set(between(140, 240), between(50, 80), 1);
    g.add(cloud);
  }
  return g;
}

/** Daytime light. #15 owns the sun's shadow setup; this only sets colours, intensities and direction. */
function lights(): Object3D {
  const g = new Group();
  const hemi = new HemisphereLight('#ffffff', '#5c7a3c', 1.0 * Math.PI);
  hemi.name = 'hemi';
  g.add(hemi);
  const sun = new DirectionalLight('#fffaf0', 1.35 * Math.PI);
  sun.name = 'sun';
  sun.position.set(-60, 120, 50);
  g.add(sun);
  return g;
}

/** Checkered mowing: a repeating checker canvas, about 1.9 m squares. */
function checkerGrass(): Material {
  const [c, x] = canvas(512, 512);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      x.fillStyle = (i + j) % 2 ? COLORS.checkA : COLORS.checkB;
      x.fillRect(i * 32, j * 32, 32, 32);
    }
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(8, 8);
  t.anisotropy = 8;
  return new MeshLambertMaterial({ map: t });
}

function playingField(): Object3D {
  const g = new Group();
  const { fenceDistance: fence, foulLineAngle: foul, moundDistance, baseDistance } = FIELD;
  const skin = flat(COLORS.skin);
  const chalk = flat(COLORS.chalk);

  // Foul territory: plain, slightly darker grass. Fair territory: the checker on top.
  g.add(ground(new CircleGeometry(700, 48), flat(COLORS.foulGrass), 0));
  g.add(ground(new CircleGeometry(fence, 64, groundTheta(foul), 2 * foul * DEG), checkerGrass(), 0.01));

  // Warning track in front of the wall.
  g.add(groundArc(fence - 6, fence, -foul - 1, foul + 1, flat(COLORS.warningTrack), 0.02));

  // Infield skin: the arc around the mound, the infield grass square, dirt circles at the bases.
  g.add(ground(infieldDirtShape(), skin, 0.03));
  const secondBase = baseDistance * Math.SQRT2;
  const infieldGrass = ground(new PlaneGeometry(baseDistance - 1, baseDistance - 1), flat(COLORS.infieldGrass), 0.04);
  infieldGrass.rotation.z = Math.PI / 4;
  infieldGrass.position.z = -secondBase / 2;
  g.add(infieldGrass);
  const bases: [number, number][] = [
    [foul, baseDistance],
    [0, secondBase],
    [-foul, baseDistance],
  ];
  for (const [angle, dist] of bases) {
    const circle = ground(new CircleGeometry(2.6, 24), skin, 0.05);
    toWorld(angle, dist, 0.05, circle.position);
    g.add(circle);
  }

  // Home plate dirt circle (darker), the pitcher's mound and rubber.
  const homeDirt = ground(new CircleGeometry(4.6, 32), flat(COLORS.homeSkin), 0.06);
  homeDirt.position.z = 0.4;
  g.add(homeDirt);
  const mound = new Mesh(new CylinderGeometry(2.7, 2.9, 0.3, 32), skin);
  mound.position.copy(toWorld(0, moundDistance, 0.15));
  g.add(mound);
  const rubber = new Mesh(new BoxGeometry(0.6, 0.04, 0.15), chalk);
  rubber.position.copy(toWorld(0, moundDistance, 0.31));
  g.add(rubber);

  // Home plate (a pentagon pointing at the catcher) and bases.
  const plate = new Mesh(new CylinderGeometry(0.3, 0.3, 0.03, 5), chalk);
  plate.position.set(0, 0.08, 0);
  g.add(plate);
  for (const [angle, dist] of bases) {
    const base = new Mesh(new BoxGeometry(0.45, 0.1, 0.45), chalk);
    base.position.copy(toWorld(angle, dist, 0.08));
    base.rotation.y = Math.PI / 4;
    g.add(base);
  }

  // Chalk: foul lines, both batter's boxes and the catcher's box.
  for (const angle of [-foul, foul]) {
    const line = new Mesh(new BoxGeometry(0.1, 0.02, fence), chalk);
    line.position.copy(toWorld(angle, fence / 2, 0.07));
    line.rotation.y = -angle * DEG;
    g.add(line);
    const pole = new Mesh(new CylinderGeometry(0.25, 0.25, 26, 8), flat(COLORS.foulPole));
    pole.position.copy(toWorld(angle, fence + 0.3, 13));
    g.add(pole);
  }
  const chalkBox = (cx: number, cz: number, w: number, d: number) => {
    for (const [x, z, bw, bd] of [
      [cx - w / 2, cz, 0.08, d],
      [cx + w / 2, cz, 0.08, d],
      [cx, cz - d / 2, w, 0.08],
      [cx, cz + d / 2, w, 0.08],
    ]) {
      const m = new Mesh(new BoxGeometry(bw, 0.015, bd), chalk);
      m.position.set(x, 0.075, z);
      g.add(m);
    }
  };
  chalkBox(-0.95, 0.2, 1.2, 1.8);
  chalkBox(0.95, 0.2, 1.2, 1.8);
  chalkBox(0, 1.9, 1.1, 1.6);
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

/** Padded outfield wall wrapped in ad boards, with the yellow home-run line on top. */
function outfieldWall(): Object3D {
  const g = new Group();
  const { fenceDistance: fence, foulLineAngle: foul } = FIELD;
  g.add(adBand(fence, 0, 4, -foul, foul, 1, 128));
  g.add(band(fence + 0.1, 3.97, 4.32, -foul, foul, flat(COLORS.wallCap)));
  return g;
}

/** Stepped stands: rows of blue seats on grey risers, a front fascia with a ring of ad boards, a back wall. */
function stands(): Object3D {
  const g = new Group();
  const { fromDeg: from, toDeg: to } = STAND_ROWS[0];
  const seats = [flat(COLORS.seatA), flat(COLORS.seatB)];
  const riser = flat(COLORS.riser);
  const facade = flat(COLORS.facade);
  for (const row of STAND_ROWS) {
    g.add(groundArc(row.front, row.back, from, to, seats[row.index % 2], row.height));
    const below = row.index === 0 ? 0 : STAND_ROWS[row.index - 1].height;
    g.add(band(row.front, below, row.height, from, to, riser));
  }
  const { radius, top, adHeight } = STANDS_FRONT;
  g.add(band(radius, 0, top - adHeight, from, to, facade));
  g.add(adBand(radius - 0.02, top - adHeight, top, from, to, 4, 48));
  const last = STAND_ROWS[STAND_ROWS.length - 1];
  g.add(band(last.back + 0.2, 0, last.height + 1.5, from, to, facade));
  g.add(buildCrowd());
  return g;
}

/** Builds the static ballpark: sky, lights, field, outfield wall and stands. */
export function buildStadium(scene: Scene): void {
  scene.fog = new Fog(COLORS.fog, 260, 900);
  scene.add(sky(), lights(), playingField(), outfieldWall(), stands());
}
