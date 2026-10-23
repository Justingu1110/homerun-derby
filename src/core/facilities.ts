import type { BattedBall, RandomSource } from './round';
import { TUNING } from './tuning';

/**
 * 設施: the things past the outfield wall a 全壘打 can hit (and maybe 打碎).
 *
 * This table is the one source of where they are: the game core judges hits
 * against it and the renderer builds the models from it. Angles and distances
 * use the field coordinates of field.ts (degrees from the center-field line,
 * negative = left; metres from home plate).
 */

export type FacilityKind = 'billboard' | 'scoreboard' | 'lightTower' | 'car';

export interface Facility {
  /** Stable id, e.g. 'scoreboard', 'billboard-L1', 'car-3'. Listed in RoundState.smashed once 打碎. */
  id: string;
  kind: FacilityKind;
  /** Direction of the facility's centre, degrees. */
  angle: number;
  /** Home plate → the facility's face (the side the ball hits), metres. */
  distance: number;
  /** Height of the centre of the part the ball hits, metres. */
  height: number;
  /** Side-to-side size of the part the ball hits, metres. Sets the range of directions it catches. */
  width: number;
  /** A home run whose 飛距離 is in [near, far) (and whose direction is within `width`) hits this facility. */
  reach: { near: number; far: number };
}

const billboard = (id: string, angle: number): Facility => ({
  id,
  kind: 'billboard',
  angle,
  distance: 137.5,
  height: 17,
  width: 9,
  reach: { near: 130, far: 145 },
});

const lightTower = (id: string, angle: number): Facility => ({
  id,
  kind: 'lightTower',
  angle,
  distance: 139,
  height: 34,
  width: 8,
  reach: { near: 120, far: 160 },
});

/** Parking deck beyond the right-center stands: two rows of cars on its roof. */
const PARKING = { firstAngle: 6.4, step: 2.2, slots: 3, rows: [144, 150], roof: 18 } as const;

const cars = (): Facility[] =>
  PARKING.rows.flatMap((distance, row) =>
    Array.from({ length: PARKING.slots }, (_, slot): Facility => ({
      id: `car-${row * PARKING.slots + slot + 1}`,
      kind: 'car',
      angle: PARKING.firstAngle + slot * PARKING.step,
      distance,
      height: PARKING.roof + 1.2,
      width: 5.5,
      reach: row === 0 ? { near: 133, far: 147 } : { near: 147, far: 165 },
    })),
  );

/** Every 設施 in the park. */
export const FACILITIES: readonly Facility[] = [
  {
    id: 'scoreboard',
    kind: 'scoreboard',
    angle: 0,
    distance: 146,
    height: 24,
    width: 24,
    reach: { near: 138, far: 165 },
  },
  billboard('billboard-L1', -7.5),
  billboard('billboard-L2', -12),
  billboard('billboard-L3', -22),
  billboard('billboard-L4', -30),
  billboard('billboard-R3', 22),
  billboard('billboard-R4', 30),
  lightTower('light-L', -15.5),
  lightTower('light-R', 15.5),
  ...cars(),
];

/** Half the range of directions (degrees) a facility catches. */
export function facilityHalfSpanDeg(f: Facility): number {
  return (Math.atan(f.width / 2 / f.distance) * 180) / Math.PI;
}

/** Where a 全壘打 ends up: on a 設施 (and whether this hit 打碎 it), or in the stands. */
export type Landing = { kind: 'stands' } | { kind: 'facility'; facility: Facility; smashed: boolean };

/** The facility a home run hits, or null for the stands. The nearest one wins if several could catch it. */
function facilityHit(ball: BattedBall): Facility | null {
  let best: Facility | null = null;
  for (const f of FACILITIES) {
    if (Math.abs(ball.angle - f.angle) > facilityHalfSpanDeg(f)) continue;
    if (ball.distance < f.reach.near || ball.distance >= f.reach.far) continue;
    if (!best || f.distance < best.distance) best = f;
  }
  return best;
}

/** Chance that a hit 打碎 the facility: grows with the 飛距離. */
function smashChance(distance: number): number {
  const { near, far } = TUNING.smash;
  const u = Math.min(1, Math.max(0, (distance - near.distance) / (far.distance - near.distance)));
  return near.chance + (far.chance - near.chance) * u;
}

/**
 * The 設施 of 一局: judges where each 全壘打 lands, rolls whether a hit 打碎
 * the facility, and remembers what is 打碎 until the round ends.
 */
export function createFacilities(random: RandomSource) {
  const smashed: string[] = [];
  return {
    land(ball: BattedBall): Landing {
      const facility = facilityHit(ball);
      if (!facility) return { kind: 'stands' };
      if (smashed.includes(facility.id)) return { kind: 'facility', facility, smashed: false };
      const smash = random() < smashChance(ball.distance);
      if (smash) smashed.push(facility.id);
      return { kind: 'facility', facility, smashed: smash };
    },
    /** Ids of the facilities 打碎 so far, in order. */
    smashed(): readonly string[] {
      return [...smashed];
    },
  };
}
