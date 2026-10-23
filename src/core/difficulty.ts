import type { PitchSettings, SpeedLevel } from './pitchSettings';

const SPEED_MULTIPLIER: Record<SpeedLevel, number> = { slow: 1.0, medium: 1.3, fast: 1.6 };
const PER_EXTRA_TYPE = 0.2;

/**
 * 難度倍率 of a 投球設定 = 球速倍率 (慢 1.0, 中 1.3, 快 1.6) + 0.2 × (球種數 − 1).
 * Rounded to one decimal, so e.g. 快速 + 三種球種 is exactly 2, not 2.0000000000000004.
 */
export function difficultyMultiplier(settings: PitchSettings): number {
  const m = SPEED_MULTIPLIER[settings.speed] + PER_EXTRA_TYPE * (settings.types.length - 1);
  return Math.round(m * 10) / 10;
}

/** 分數 for one 全壘打 = 100 × 難度倍率 (rounded to a whole point). */
export function homeRunPoints(multiplier: number): number {
  return Math.round(100 * multiplier);
}
