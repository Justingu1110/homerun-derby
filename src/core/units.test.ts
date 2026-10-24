import { describe, expect, it } from 'vitest';
import { metresToFeet } from './index';

// The rules stay in metres; 飛距離 is shown to the player in feet (1 m = 3.281 ft, whole feet).
describe('metres to feet', () => {
  it('shows the 120 m fence as 394 ft', () => {
    expect(metresToFeet(120)).toBe(394);
  });

  it('shows the 140 m full-cinematic threshold as 459 ft', () => {
    expect(metresToFeet(140)).toBe(459);
  });

  it('shows 0 m as 0 ft', () => {
    expect(metresToFeet(0)).toBe(0);
  });

  it('rounds to the nearest whole foot', () => {
    // 10.5 m = 34.4505 ft → 34; 10.7 m = 35.1067 ft → 35
    expect(metresToFeet(10.5)).toBe(34);
    expect(metresToFeet(10.7)).toBe(35);
  });
});
