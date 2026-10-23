/**
 * Field geometry shared by the game core and the renderer.
 *
 * Coordinates are top-down, in metres, with home plate at the origin:
 * `x` points right as the batter looks out, `y` points toward center field.
 * Angles are degrees from the center-field line; negative is left field.
 */
export const FIELD = {
  /** Home plate to the pitcher's rubber. */
  moundDistance: 18.44,
  /** Distance between bases (home → first, etc.). */
  baseDistance: 27.43,
  /** Home plate to the outfield wall, same at every angle (a round park). */
  fenceDistance: 120,
  /** Foul lines sit at ± this many degrees. */
  foulLineAngle: 45,
} as const;

export interface FieldPoint {
  x: number;
  y: number;
}

/** Converts a direction angle (degrees) and distance from home plate to field coordinates. */
export function fieldPoint(angleDeg: number, distance: number): FieldPoint {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(a) * distance, y: Math.cos(a) * distance };
}
