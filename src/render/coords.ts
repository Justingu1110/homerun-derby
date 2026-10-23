import { Vector3 } from 'three';
import { fieldPoint } from '../core';

/**
 * Maps game-core field coordinates to three.js world space.
 * Core: x right, y toward center field. World: x right, y up, -z toward center field.
 */
export function toWorld(angleDeg: number, distance: number, height = 0, out = new Vector3()): Vector3 {
  const p = fieldPoint(angleDeg, distance);
  return out.set(p.x, height, -p.y);
}

/** Deterministic PRNG for scenery placement, so the stadium looks the same every load. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
