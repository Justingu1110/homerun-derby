/**
 * Keyframe tracks for the player motion (port of prototype v6 track()).
 *
 * A track is a list of [time, values] keys in time order. Between keys the
 * values follow a Catmull-Rom spline with time-aware tangents, so the motion
 * flows through each pose instead of stopping on it; the first and last key
 * ease in / out (zero tangent) and hold outside the track.
 */

export type Key = readonly [t: number, values: readonly number[]];
export type Keys = readonly Key[];

/** Values of the track at time t (written into out when given). */
export function track(keys: Keys, t: number, out: number[] = []): number[] {
  const n = keys.length;
  const first = keys[0][1];
  const last = keys[n - 1][1];
  out.length = first.length;
  if (t <= keys[0][0]) return copy(first, out);
  if (t >= keys[n - 1][0]) return copy(last, out);
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[i + 1];
  const dt = t1 - t0;
  const u = (t - t0) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  for (let j = 0; j < p0.length; j++) {
    out[j] = h00 * p0[j] + h10 * dt * tangent(keys, i, j) + h01 * p1[j] + h11 * dt * tangent(keys, i + 1, j);
  }
  return out;
}

/** Slope of value j at key k: through its neighbours, or 0 at either end of the track. */
function tangent(keys: Keys, k: number, j: number): number {
  if (k <= 0 || k >= keys.length - 1) return 0;
  const [ta, a] = keys[k - 1];
  const [tb, b] = keys[k + 1];
  return (b[j] - a[j]) / (tb - ta);
}

function copy(src: readonly number[], out: number[]): number[] {
  for (let j = 0; j < src.length; j++) out[j] = src[j];
  return out;
}
