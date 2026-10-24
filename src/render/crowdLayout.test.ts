import { describe, expect, it } from 'vitest';
import { STAND_ROWS } from './stands';
import { crowdLevel, layoutCrowd, type Fan } from './crowdLayout';

const chunks = layoutCrowd();
const fans: Fan[] = chunks.flatMap((c) => c.fans);
const radiusOf = (f: Fan) => Math.hypot(f.position[0], f.position[2]);
/** Field angle (deg) of a fan: 0 = straight to centre field, + toward right field. */
const angleOf = (f: Fan) => (Math.atan2(f.position[0], -f.position[2]) * 180) / Math.PI;

describe('crowd seats', () => {
  it('fills every stand row about 1 m apart, leaving about one seat in five empty', () => {
    for (const row of STAND_ROWS) {
      const seated = fans.filter((f) => f.row === row.index).length;
      const seats = ((row.toDeg - row.fromDeg) * Math.PI * row.seatRadius) / 180; // 1 m per seat
      expect(seated / seats).toBeGreaterThan(0.72);
      expect(seated / seats).toBeLessThan(0.88);
    }
  });

  it('seats each fan on the tread of its row, inside the stands', () => {
    for (const f of fans) {
      const row = STAND_ROWS[f.row];
      expect(f.position[1]).toBe(row.height);
      expect(radiusOf(f)).toBeGreaterThan(row.front);
      expect(radiusOf(f)).toBeLessThan(row.back);
      expect(angleOf(f)).toBeGreaterThan(row.fromDeg);
      expect(angleOf(f)).toBeLessThan(row.toDeg);
    }
  });
});

describe('every fan looks different', () => {
  it('mixes shirts and skins, caps and hair, and gives some fans a towel', () => {
    expect(new Set(fans.map((f) => f.shirt)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(fans.map((f) => f.skin)).size).toBeGreaterThanOrEqual(4);
    const capped = fans.filter((f) => f.hat).length / fans.length;
    expect(capped).toBeGreaterThan(0.4);
    expect(capped).toBeLessThan(0.7);
    const towels = fans.filter((f) => f.towel).length / fans.length;
    expect(towels).toBeGreaterThan(0.08);
    expect(towels).toBeLessThan(0.25);
  });

  it('is the same crowd on every load', () => {
    expect(layoutCrowd()).toEqual(chunks);
  });

  it('faces home plate', () => {
    for (const f of fans) {
      const r = radiusOf(f);
      expect(Math.sin(f.facing)).toBeCloseTo(-f.position[0] / r, 6);
      expect(Math.cos(f.facing)).toBeCloseTo(-f.position[2] / r, 6);
    }
  });
});

describe('level of detail', () => {
  it('each wedge holds its fans inside its bounding sphere', () => {
    for (const c of chunks) {
      expect(c.fans.length).toBeGreaterThan(0);
      for (const f of c.fans) expect(Math.hypot(...f.position.map((v, k) => v - c.center[k]))).toBeLessThanOrEqual(c.radius + 1e-9);
    }
  });

  it('draws the whole crowd simply from behind the batter', () => {
    for (const c of chunks) expect(crowdLevel(c, { x: 0.05, y: 1.7, z: 4.6 })).toBe('far');
  });

  it('draws fans in full detail when the camera is close to them, and only the wedges near it', () => {
    const fan = chunks[6].fans[0];
    const camera = { x: fan.position[0] * 0.93, y: fan.position[1] + 3, z: fan.position[2] * 0.93 };
    expect(crowdLevel(chunks[6], camera)).toBe('near');
    expect(crowdLevel(chunks[0], camera)).toBe('far');
    expect(crowdLevel(chunks[12], camera)).toBe('far');
  });
});
