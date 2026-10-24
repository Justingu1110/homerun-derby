/** Feet per metre. The rules work in metres; the player sees 飛距離 in feet. */
const FEET_PER_METRE = 3.281;

/** A distance in metres as whole feet, for display (120 m → 394 ft). */
export function metresToFeet(metres: number): number {
  return Math.round(metres * FEET_PER_METRE);
}
