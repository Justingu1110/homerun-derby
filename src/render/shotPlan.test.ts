import { describe, expect, it } from 'vitest';
import { CHASE_CAMS, CONTACT_CAMS, pickShotPlan, SWING_CAMS } from './shotPlan';

/** A random source that plays back the given values, then repeats the last one. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('鏡頭組合: one 揮棒特寫, one 擊球特寫 (full only) and one chase per 全壘打演出', () => {
  it('the short version never has a 擊球特寫', () => {
    for (const v of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      expect(pickShotPlan(seq(v), 'short').contact).toBeNull();
    }
  });

  it('the full version has all three', () => {
    for (const v of [0, 0.5, 0.999]) {
      const plan = pickShotPlan(seq(v), 'full');
      expect(SWING_CAMS).toContain(plan.swing);
      expect(CONTACT_CAMS).toContain(plan.contact);
      expect(CHASE_CAMS).toContain(plan.chase);
    }
  });

  it('there are four 揮棒特寫, three 擊球特寫 and four chases', () => {
    expect([...SWING_CAMS].sort()).toEqual(['catcher', 'face', 'front', 'worm']);
    expect([...CONTACT_CAMS].sort()).toEqual(['flip', 'pitcher', 'trail']);
    expect([...CHASE_CAMS].sort()).toEqual(['behind', 'outfield', 'side', 'top']);
  });

  it('different random values reach every shot', () => {
    const swing = new Set<string>();
    const contact = new Set<string>();
    const chase = new Set<string>();
    for (let k = 0; k < 24; k++) {
      const plan = pickShotPlan(seq(k / 24, ((k * 7) % 24) / 24, ((k * 11) % 24) / 24), 'full');
      swing.add(plan.swing);
      contact.add(plan.contact!);
      chase.add(plan.chase);
    }
    expect(swing.size).toBe(4);
    expect(contact.size).toBe(3);
    expect(chase.size).toBe(4);
  });

  it('a fixed random source gives a fixed plan', () => {
    expect(pickShotPlan(seq(0.1, 0.5, 0.9), 'full')).toEqual({ swing: 'front', contact: 'flip', chase: 'outfield' });
    expect(pickShotPlan(seq(0.1, 0.5, 0.9), 'full')).toEqual(pickShotPlan(seq(0.1, 0.5, 0.9), 'full'));
    expect(pickShotPlan(seq(0.3, 0.99, 0.3), 'full')).toEqual({ swing: 'catcher', contact: 'pitcher', chase: 'side' });
    expect(pickShotPlan(seq(0.99, 0.0, 0.6), 'short')).toEqual({ swing: 'worm', contact: null, chase: 'top' });
  });

  it('the short version also reaches every 揮棒特寫 and chase', () => {
    const swing = new Set<string>();
    const chase = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const plan = pickShotPlan(seq(k / 8, 0, ((k * 3) % 8) / 8), 'short');
      swing.add(plan.swing);
      chase.add(plan.chase);
    }
    expect(swing.size).toBe(4);
    expect(chase.size).toBe(4);
  });
});
