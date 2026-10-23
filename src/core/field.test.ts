import { describe, expect, it } from 'vitest';
import { FIELD, fieldPoint } from './field';

// Field coordinates: home plate at the origin, metres, x to the right as the
// batter looks out, y = depth toward center field. Angle 0° = straight at
// center field, negative = left field (pull side for a right-handed batter).
describe('field geometry', () => {
  it('places the pitcher\'s mound 18.44 m straight out from home plate', () => {
    const p = fieldPoint(0, FIELD.moundDistance);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(18.44);
  });

  it('puts the left and right foul poles on the ±45° lines at the fence', () => {
    const left = fieldPoint(-FIELD.foulLineAngle, FIELD.fenceDistance);
    const right = fieldPoint(FIELD.foulLineAngle, FIELD.fenceDistance);
    // 120 m at 45° → 120 / √2 ≈ 84.85 m along each axis
    expect(left.x).toBeCloseTo(-84.85, 1);
    expect(left.y).toBeCloseTo(84.85, 1);
    expect(right.x).toBeCloseTo(84.85, 1);
    expect(right.y).toBeCloseTo(84.85, 1);
  });
});
