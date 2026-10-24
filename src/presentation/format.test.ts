import { describe, expect, it } from 'vitest';
import { difficulty } from '../core';
import { describePitchTypes, distanceParts, formatDistance, formatMultiplier } from './format';

describe('on-screen words shared by the screens, the HUD and the 全壘打演出', () => {
  it('飛距離 is whole feet with the ft unit', () => {
    expect(formatDistance(120)).toBe('394 ft');
    expect(distanceParts(140)).toEqual({ value: 459, unit: 'ft' });
  });

  it('難度倍率 has one decimal and a × sign', () => {
    expect(formatMultiplier(1)).toBe('×1.0');
    expect(formatMultiplier(2.5)).toBe('×2.5');
  });

  it('the 球種 of a 難度 are joined with ／', () => {
    expect(describePitchTypes(difficulty('easy'))).toBe('直球');
    expect(describePitchTypes(difficulty('normal'))).toBe('直球／變速球');
    expect(describePitchTypes(difficulty('hard'))).toBe('直球／變速球／曲球');
  });
});
