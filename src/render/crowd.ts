import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LOD,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Sphere,
  SphereGeometry,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crowdLevel, layoutCrowd, type CrowdChunk } from './crowdLayout';

/**
 * Chibi fans (body, head, eyes, cap or hair, two hands, sometimes a towel).
 * Every part of every fan is one instance of a merged per-level geometry; the
 * idle sway and the cheer (jump, hands up, towel waving) are computed in the
 * vertex shader from two uniforms, so no matrix is touched after building.
 */

/** Part ids baked into the `aPart` vertex attribute; the shader colours and moves vertices by part. */
const PART = { body: 0, head: 1, eyes: 2, top: 3, brim: 4, handL: 5, handR: 6, towel: 7 } as const;

/** Fan-local layout (m, scale 1): origin on the seat, +z toward home. */
const BODY = { y: 0.3, r: 0.26 } as const;
const HEAD = { y: 0.72, r: 0.24 } as const;
const HAND = { r: 0.09, rest: [0.3, 0.32, 0.12], up: [0.24, 1.18, 0.04] } as const;
const TOWEL = { w: 0.16, h: 0.32 } as const;
const COLORS = { eyes: '#141018', towel: '#ffc83d' } as const;

/** Displaced vertices reach this far above a fan's seat (jump + raised towel); used for culling spheres. */
const REACH_M = 2.6;

const tag = (geo: BufferGeometry, part: number): BufferGeometry => {
  geo.deleteAttribute('uv');
  geo.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(part), 1));
  return geo;
};

const sphere = (r: number, w: number, h: number, part: number, at: readonly number[], squash: readonly number[] = [1, 1, 1]) =>
  tag(new SphereGeometry(r, w, h).scale(squash[0], squash[1], squash[2]).translate(at[0], at[1], at[2]), part);

/** Towel: hangs from the right hand (top edge at the hand); the shader flips it up when cheering. */
const towel = (segments: number) =>
  tag(new BoxGeometry(TOWEL.w, TOWEL.h, 0.02, 1, segments, 1).translate(HAND.rest[0], HAND.rest[1] - TOWEL.h / 2, HAND.rest[2] + 0.06), PART.towel);

function nearGeometry(): BufferGeometry {
  const eye = (sx: number) => sphere(0.035, 6, 4, PART.eyes, [sx * 0.08, HEAD.y + 0.02, 0.215], [0.8, 1.5, 0.5]);
  const brim = tag(
    new CylinderGeometry(0.17, 0.17, 0.025, 12, 1, false, -Math.PI / 2, Math.PI).translate(0, HEAD.y + 0.06, 0.1),
    PART.brim,
  );
  return mergeGeometries([
    sphere(BODY.r, 10, 7, PART.body, [0, BODY.y, 0], [1, 1.15, 0.85]),
    sphere(HEAD.r, 12, 8, PART.head, [0, HEAD.y, 0]),
    eye(-1),
    eye(1),
    tag(new SphereGeometry(HEAD.r * 1.06, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, HEAD.y + 0.02, -0.01), PART.top),
    brim,
    sphere(HAND.r, 7, 5, PART.handL, [-HAND.rest[0], HAND.rest[1], HAND.rest[2]]),
    sphere(HAND.r, 7, 5, PART.handR, HAND.rest),
    towel(4),
  ]);
}

/** Far level: low-poly body and head (the top of the head takes the cap / hair colour), stub hands, flat towel. */
function farGeometry(): BufferGeometry {
  const head = sphere(HEAD.r, 6, 4, PART.head, [0, HEAD.y, 0]);
  const pos = head.getAttribute('position');
  const part = head.getAttribute('aPart') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > HEAD.y + 0.05) part.setX(i, PART.top);
  return mergeGeometries([
    sphere(BODY.r, 6, 4, PART.body, [0, BODY.y, 0], [1, 1.15, 0.85]),
    head,
    sphere(HAND.r * 1.3, 4, 2, PART.handL, [-HAND.rest[0], HAND.rest[1], HAND.rest[2]]),
    sphere(HAND.r * 1.3, 4, 2, PART.handR, HAND.rest),
    towel(2),
  ]);
}

const linear = (hex: string) => new Color(hex);
const vec3 = (c: Color) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

/** The crowd's two shader inputs. Shared by every crowd material. */
export interface CrowdUniforms {
  uTime: { value: number };
  /** 0 = sitting and swaying, 1 = jumping with both hands up. */
  uCheer: { value: number };
}

function crowdMaterial(uniforms: CrowdUniforms): MeshLambertMaterial {
  const mat = new MeshLambertMaterial();
  const [restX, restY, restZ] = HAND.rest;
  const [upX, upY, upZ] = HAND.up;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `attribute float aPart;
attribute vec3 aShirt;
attribute vec3 aSkin;
attribute vec3 aTop;
attribute vec4 aFan; // phase, cap (0/1), towel (0/1), -
uniform float uTime;
uniform float uCheer;
varying vec3 vFanColor;
` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float ph = aFan.x;
  int part = int(aPart + 0.5);
  bool hidden = (part == ${PART.brim} && aFan.y < 0.5) || (part == ${PART.towel} && aFan.z < 0.5);
  // Hands (and the towel in the right hand) go up while cheering, waving a little.
  float raise = uCheer * (0.85 + 0.15 * sin(uTime * 10.0 + ph + 1.0));
  if (part == ${PART.handL} || part == ${PART.handR} || part == ${PART.towel}) {
    float side = part == ${PART.handL} ? -1.0 : 1.0;
    vec3 rest = vec3(side * ${restX.toFixed(3)}, ${restY.toFixed(3)}, ${restZ.toFixed(3)});
    vec3 up = vec3(side * ${upX.toFixed(3)}, ${upY.toFixed(3)}, ${upZ.toFixed(3)});
    if (part == ${PART.towel}) {
      // Swing the towel about the hand: hanging down at rest, up and waving when cheering.
      vec3 d = transformed - rest;
      float a = raise * 3.14159 + sin(uTime * 12.0 + ph) * 0.5 * raise;
      d = vec3(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a), d.z);
      transformed = rest + d;
    }
    transformed += (up - rest) * raise + vec3(side * 0.06 * sin(uTime * 10.0 + ph) * raise, 0.0, 0.0);
  }
  // Idle: a slow side-to-side lean (more at the head than the hips) and a small bob.
  transformed.x += sin(uTime * 1.6 + ph) * 0.05 * (transformed.y / 0.9);
  transformed.y += 0.012 * sin(uTime * 2.3 + ph);
  // Cheer: jumping.
  transformed.y += uCheer * max(0.0, sin(uTime * 10.0 + ph)) * 0.45;
  if (hidden) transformed = vec3(0.0, ${BODY.y.toFixed(3)}, 0.0);
  vFanColor = part == ${PART.body} ? aShirt
    : part == ${PART.eyes} ? ${vec3(linear(COLORS.eyes))}
    : part == ${PART.top} || part == ${PART.brim} ? aTop
    : part == ${PART.towel} ? ${vec3(linear(COLORS.towel))}
    : aSkin;
}`,
      );
    shader.fragmentShader = 'varying vec3 vFanColor;\n' + shader.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vFanColor;');
  };
  return mat;
}

/** One wedge of the stands: picks its level for each render (no per-fan work). */
class CrowdWedge extends LOD {
  private readonly cam = new Vector3();
  constructor(
    private readonly chunk: CrowdChunk,
    private readonly near: Object3D,
    private readonly far: Object3D,
  ) {
    super();
    this.add(near, far);
    this.far.visible = false;
  }
  override update(camera: Camera): void {
    camera.getWorldPosition(this.cam);
    const near = crowdLevel(this.chunk, this.cam) === 'near';
    this.near.visible = near;
    this.far.visible = !near;
  }
}

/** Instanced attributes for one wedge, shared by its two levels. */
function fanAttributes(chunk: CrowdChunk) {
  const n = chunk.fans.length;
  const shirt = new Float32Array(n * 3);
  const skin = new Float32Array(n * 3);
  const top = new Float32Array(n * 3);
  const fan = new Float32Array(n * 4);
  const c = new Color();
  chunk.fans.forEach((f, i) => {
    c.set(f.shirt).toArray(shirt, i * 3);
    c.set(f.skin).toArray(skin, i * 3);
    c.set(f.hat ?? f.hair).toArray(top, i * 3);
    fan.set([f.phase, f.hat ? 1 : 0, f.towel ? 1 : 0, 0], i * 4);
  });
  return {
    aShirt: new InstancedBufferAttribute(shirt, 3),
    aSkin: new InstancedBufferAttribute(skin, 3),
    aTop: new InstancedBufferAttribute(top, 3),
    aFan: new InstancedBufferAttribute(fan, 4),
  };
}

/** A per-wedge geometry that shares the level's vertex buffers and adds the wedge's per-fan attributes. */
function wedgeGeometry(base: BufferGeometry, attrs: ReturnType<typeof fanAttributes>): BufferGeometry {
  const g = new BufferGeometry();
  g.setIndex(base.getIndex());
  for (const name of ['position', 'normal', 'aPart']) g.setAttribute(name, base.getAttribute(name));
  for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
  return g;
}

/** The crowd group (named 'crowd'): one LOD wedge per CrowdChunk, near and far InstancedMeshes in each. */
export function buildCrowd(): Group {
  const uniforms: CrowdUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  const material = crowdMaterial(uniforms);
  const levels = { near: nearGeometry(), far: farGeometry() };
  const group = new Group();
  group.name = 'crowd';
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (const chunk of layoutCrowd()) {
    const attrs = fanAttributes(chunk);
    const bounds = new Sphere(new Vector3(...chunk.center), chunk.radius + REACH_M);
    const [near, far] = (['near', 'far'] as const).map((level) => {
      const mesh = new InstancedMesh(wedgeGeometry(levels[level], attrs), material, chunk.fans.length);
      chunk.fans.forEach((f, i) => mesh.setMatrixAt(i, m.compose(p.set(...f.position), q.setFromAxisAngle(up, f.facing), s.setScalar(f.scale))));
      mesh.boundingSphere = bounds;
      mesh.name = `crowd-${level}`;
      return mesh;
    });
    group.add(new CrowdWedge(chunk, near, far));
  }
  group.userData.uniforms = uniforms;
  return group;
}

/** The shader inputs of a crowd made by buildCrowd (null for anything else). */
export function crowdUniforms(crowd: Object3D | undefined): CrowdUniforms | null {
  return (crowd?.userData.uniforms as CrowdUniforms | undefined) ?? null;
}
