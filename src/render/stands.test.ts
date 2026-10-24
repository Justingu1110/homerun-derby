import { describe, expect, it } from 'vitest';
import { STAND_ROWS, STANDS, standsHeight } from './stands';

describe('stepped stands: a ball lands on the seat row under it', () => {
  it('the front row is 5 m up (just under the stands-front ad boards) and each row is one step higher', () => {
    expect(standsHeight(123.5)).toBeCloseTo(5, 5);
    expect(standsHeight(124.5)).toBeCloseTo(5.75, 5);
    expect(standsHeight(135.5)).toBeCloseTo(13.25, 5);
  });

  it('is flat across a row and steps up at the next row', () => {
    const row = STAND_ROWS[3];
    expect(standsHeight(row.front + 0.01)).toBeCloseTo(row.height, 5);
    expect(standsHeight(row.back - 0.01)).toBeCloseTo(row.height, 5);
    expect(standsHeight(row.back + 0.01)).toBeCloseTo(STAND_ROWS[4].height, 5);
  });
});

describe('stand rows (where the crowd sits)', () => {
  it('12 rows run back to back from the front of the stands (123 m) to the back (136 m), past both foul lines', () => {
    expect(STAND_ROWS).toHaveLength(12);
    expect(STAND_ROWS[0].front).toBe(STANDS.innerRadius);
    expect(STANDS.innerRadius).toBe(123);
    expect(STAND_ROWS[11].back).toBeCloseTo(136, 5);
    for (let i = 1; i < STAND_ROWS.length; i++) expect(STAND_ROWS[i].front).toBeCloseTo(STAND_ROWS[i - 1].back, 9);
    for (const row of STAND_ROWS) expect([row.fromDeg, row.toDeg]).toEqual([-52, 52]);
  });

  it('a fan in a row sits on the same surface a ball lands on', () => {
    for (const row of STAND_ROWS) {
      expect(row.seatRadius).toBeGreaterThan(row.front);
      expect(row.seatRadius).toBeLessThan(row.back);
      expect(standsHeight(row.seatRadius)).toBe(row.height);
    }
  });
});
