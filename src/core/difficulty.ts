/**
 * 難度倍率: how much each 全壘打 is worth, set by the 投球設定.
 * Fixed at ×1.0 until the 投球設定 exist (ticket #5 adds the formula:
 * speed multiplier + 0.2 × (pitch types − 1)).
 */
export function difficultyMultiplier(): number {
  return 1;
}

/** 分數 for one 全壘打 = 100 × 難度倍率 (rounded to a whole point). */
export function homeRunPoints(multiplier: number): number {
  return Math.round(100 * multiplier);
}
