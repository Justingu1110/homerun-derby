import { FIELD } from '../core';

/**
 * Stepped stands behind the outfield wall: rows of seats climbing away from home.
 * Plain data (no three.js) so the crowd, landing points and debris floors all
 * agree on where a seat row is.
 */
export const STANDS = {
  /** Front edge of the first row (m from home). */
  innerRadius: FIELD.fenceDistance + 3,
  /** Back edge of the last row. */
  outerRadius: FIELD.fenceDistance + 16,
  rows: 12,
  /** Seat surface (tread top) of the front row, m. */
  frontHeight: 5,
  /** Rise from one row to the next, m. */
  step: 0.75,
  /** Extra degrees past each foul line. */
  overhang: 7,
} as const;

/** One row of seats: a flat tread from `front` to `back` (m from home) at `height`, spanning field angles [fromDeg, toDeg]. */
export interface StandRow {
  index: number;
  front: number;
  back: number;
  /** Where a spectator sits: the middle of the tread. */
  seatRadius: number;
  /** Height of the tread top (the seat surface), m. */
  height: number;
  fromDeg: number;
  toDeg: number;
}

const rowDepth = (STANDS.outerRadius - STANDS.innerRadius) / STANDS.rows;

export const STAND_ROWS: readonly StandRow[] = Array.from({ length: STANDS.rows }, (_, index) => {
  const front = STANDS.innerRadius + index * rowDepth;
  return {
    index,
    front,
    back: front + rowDepth,
    seatRadius: front + rowDepth / 2,
    height: STANDS.frontHeight + index * STANDS.step,
    fromDeg: -FIELD.foulLineAngle - STANDS.overhang,
    toDeg: FIELD.foulLineAngle + STANDS.overhang,
  };
});

/** Height of the stands' seating surface (the tread of the row) at a given radius. Clamped to the first/last row. */
export function standsHeight(radius: number): number {
  const i = Math.min(STANDS.rows - 1, Math.max(0, Math.floor((radius - STANDS.innerRadius) / rowDepth)));
  return STAND_ROWS[i].height;
}
