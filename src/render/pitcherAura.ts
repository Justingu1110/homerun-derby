import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type Scene,
} from 'three';
import type { PitcherAura } from '../core';
import { MOUND } from './poses';

/**
 * 投手特效 around the mound, stronger with each 難度 (prototype v6 `aura`):
 * sparkle → whirlwind rings → blue glow + lightning → fire, red glow, a ground
 * ring and lightning. Seen from the batter view and in the 投手登場.
 *
 * With 減少動態效果 everything that flickers or moves (sparks, bolts, pulsing,
 * spinning) is off; the effect's colour stays as a still glow / ring.
 */

interface AuraLook {
  /** Sparks per second, their colours, spawn radius, rise speed and life (s), and point size. */
  rate: number;
  colors: string[];
  spread: number;
  up: [number, number];
  life: [number, number];
  size: number;
  /** Sideways swirl speed of the sparks. */
  swirl?: number;
  /** Two spinning rings in this colour. */
  rings?: string;
  /** A glow sprite: colour, size (m). */
  halo?: [string, number];
  /** Lightning bolt colour, and the chance a bolt shows each flicker. */
  bolt?: [string, number];
  /** Red ring on the ground; the sparks are pulled into a column. */
  ground?: boolean;
}

/** Tune each effect here (values from prototype v6). */
const LOOKS: Record<PitcherAura, AuraLook | null> = {
  none: null,
  sparkle: { rate: 12, colors: ['#fff6c0', '#ffffff'], spread: 0.75, up: [0.3, 0.8], life: [0.7, 1.1], size: 0.22 },
  whirlwind: { rate: 45, colors: ['#bff3ff', '#ffffff'], spread: 0.95, up: [0.6, 1.4], life: [0.6, 1.0], size: 0.26, swirl: 2.2, rings: '#bff3ff' },
  lightning: {
    rate: 80, colors: ['#9fd3ff', '#ffffff', '#5ab4ff'], spread: 0.85, up: [1.0, 2.2], life: [0.4, 0.8], size: 0.3, swirl: 1.2,
    rings: '#7cc4ff', halo: ['#4aa8ff', 3.6], bolt: ['#eaf6ff', 0.55],
  },
  inferno: {
    rate: 170, colors: ['#ff5a2a', '#ffb03a', '#ffe08a', '#ff2a1a'], spread: 0.6, up: [1.6, 3.4], life: [0.5, 1.1], size: 0.45,
    halo: ['#ff4a1a', 5.2], bolt: ['#ffb46a', 0.75], ground: true,
  },
};

/** Still look for 減少動態效果: halo / ring / ground opacity, and a faint glow for the sparkle (which is all flicker). */
const STILL = { halo: 0.55, ring: 0.45, ground: 0.4, sparkleGlow: ['#fff6c0', 2.2] as [string, number] } as const;

const MAX_SPARKS = 320;
const BOLT_POINTS = 8;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface PitcherAuraView {
  set(aura: PitcherAura): void;
  /** Call every frame with performance.now(). */
  update(nowMs: number, reducedMotion: boolean): void;
}

/** A soft round glow texture for sparks and halos. */
const glowTexture = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.35, 'rgba(255,210,90,.55)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
};

export function createPitcherAura(scene: Scene): PitcherAuraView {
  const g = new Group();
  g.position.set(MOUND.x, MOUND.y, MOUND.z);
  scene.add(g);
  const tex = glowTexture();
  const glowMat = (color: string) => new SpriteMaterial({ map: tex, color, blending: AdditiveBlending, depthWrite: false, transparent: true });

  // Sparks: a fixed pool of points; a dead spark sits far below the ground.
  const pos = new Float32Array(MAX_SPARKS * 3);
  const col = new Float32Array(MAX_SPARKS * 3);
  const sparks = Array.from({ length: MAX_SPARKS }, () => ({ age: 1, life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, c: new Color() }));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const sparkMat = new PointsMaterial({ map: tex, size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const points = new Points(geo, sparkMat);
  points.frustumCulled = false;
  g.add(points);

  const halo = new Sprite(glowMat('#ffffff'));
  halo.position.y = 1.0;
  g.add(halo);

  const rings = [0, 1].map((i) => {
    const m = new Mesh(
      new TorusGeometry(0.85 + i * 0.22, 0.025, 6, 40),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending }),
    );
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.45 + i * 0.55;
    g.add(m);
    return m;
  });

  const boltGeo = new BufferGeometry();
  boltGeo.setAttribute('position', new BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
  const bolt = new Line(boltGeo, new LineBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending }));
  bolt.frustumCulled = false;
  g.add(bolt);

  const ground = new Mesh(
    new RingGeometry(0.5, 1.7, 40),
    new MeshBasicMaterial({ color: '#ff3a1a', transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.03;
  g.add(ground);

  // None of these cast or take the players' shadows.
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
    o.renderOrder = 1;
  });

  let aura: PitcherAura = 'none';
  let lastMs: number | null = null;
  let clockS = 0;
  let spawnAcc = 0;
  let boltLeftS = 0;

  const killSparks = () => {
    for (const s of sparks) Object.assign(s, { age: 1, life: 0, y: -99 });
    for (let i = 0; i < MAX_SPARKS; i++) pos[i * 3 + 1] = -99;
    geo.attributes.position.needsUpdate = true;
  };

  const spawn = (l: AuraLook) => {
    for (let i = 0; i < MAX_SPARKS && spawnAcc >= 1; i++) {
      const s = sparks[i];
      if (s.age < s.life) continue;
      spawnAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = l.spread * Math.sqrt(Math.random());
      s.x = Math.cos(a) * r;
      s.z = Math.sin(a) * r;
      s.y = rnd(0, 0.3);
      const swirl = l.swirl ?? 0;
      s.vx = -Math.sin(a) * swirl;
      s.vy = rnd(l.up[0], l.up[1]);
      s.vz = Math.cos(a) * swirl;
      s.age = 0;
      s.life = rnd(l.life[0], l.life[1]);
      s.c.set(l.colors[Math.floor(Math.random() * l.colors.length)]);
    }
    if (spawnAcc > 5) spawnAcc = 0;
  };

  const moveSparks = (dt: number, pull: boolean) => {
    sparks.forEach((s, i) => {
      if (s.age >= s.life) {
        pos[i * 3 + 1] = -99;
        return;
      }
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (pull) {
        s.x *= 1 - dt * 0.8;
        s.z *= 1 - dt * 0.8;
      }
      const f = Math.max(0, 1 - s.age / s.life);
      pos.set([s.x, s.y, s.z], i * 3);
      col.set([s.c.r * f, s.c.g * f, s.c.b * f], i * 3);
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const flickerBolt = (dt: number, [color, chance]: [string, number]) => {
    boltLeftS -= dt;
    if (boltLeftS > 0) return;
    boltLeftS = rnd(0.06, 0.16);
    bolt.visible = Math.random() < chance;
    (bolt.material as LineBasicMaterial).color.set(color);
    const a = boltGeo.attributes.position as BufferAttribute;
    const x0 = rnd(-0.9, 0.9);
    const z0 = rnd(-0.6, 0.6);
    for (let k = 0; k < BOLT_POINTS; k++) {
      const u = k / (BOLT_POINTS - 1);
      a.setXYZ(k, x0 * (1 - u) + rnd(-0.25, 0.25), 2.6 - k * 0.34, z0 * (1 - u) + rnd(-0.25, 0.25));
    }
    a.needsUpdate = true;
  };

  const view: PitcherAuraView = {
    set(next) {
      aura = next;
      const l = LOOKS[next];
      killSparks();
      spawnAcc = 0;
      if (l) sparkMat.size = l.size;
      for (const r of rings) {
        r.visible = !!l?.rings;
        if (l?.rings) (r.material as MeshBasicMaterial).color.set(l.rings);
      }
      bolt.visible = false;
      ground.visible = !!l?.ground;
    },

    update(nowMs, reduced) {
      const dt = lastMs === null ? 0 : Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const l = LOOKS[aura];
      g.visible = !!l;
      if (!l) return;
      clockS += dt;
      const haloLook = l.halo ?? (reduced && aura === 'sparkle' ? STILL.sparkleGlow : null);
      halo.visible = !!haloLook;
      if (haloLook) {
        halo.material.color.set(haloLook[0]);
        halo.scale.setScalar(haloLook[1]);
      }
      if (reduced) {
        points.visible = false;
        bolt.visible = false;
        halo.material.opacity = STILL.halo;
        (ground.material as MeshBasicMaterial).opacity = STILL.ground;
        for (const r of rings) {
          r.scale.setScalar(1);
          (r.material as MeshBasicMaterial).opacity = STILL.ring;
        }
        return;
      }
      points.visible = true;
      spawnAcc += l.rate * dt;
      spawn(l);
      moveSparks(dt, !!l.ground);
      rings.forEach((r, i) => {
        r.rotation.z += dt * (2.5 + i * 1.5) * (i ? -1 : 1);
        r.scale.setScalar(1 + 0.08 * Math.sin(clockS * 5 + i));
        (r.material as MeshBasicMaterial).opacity = 0.55;
      });
      halo.material.opacity = 0.55 + 0.25 * Math.sin(clockS * 7);
      (ground.material as MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(clockS * 6);
      if (l.bolt) flickerBolt(dt, l.bolt);
      else bolt.visible = false;
    },
  };
  view.set('none');
  return view;
}
