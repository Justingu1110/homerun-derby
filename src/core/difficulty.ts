import type { PitchType, SpeedLevel } from './pitch';

/** 難度 ids, easiest first. Stored in localStorage and in the 最高分, so don't rename them. */
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'expert' | 'hell';

/** 難度: who pitches, which 球種 and 球速 levels come up, and the fixed 難度倍率. */
export interface Difficulty {
  id: DifficultyId;
  /** Display name: 簡易, 普通, 困難, 極難, 地獄. */
  name: string;
  /** Name of this 難度's 投手. */
  pitcher: string;
  /** 球種 thrown, in display order. Each pitch picks one uniformly. */
  types: readonly PitchType[];
  /** 球速 levels thrown. Each pitch picks one uniformly (地獄 mixes all three). */
  speeds: readonly SpeedLevel[];
  /** 難度倍率: each 全壘打 scores 100 × this. */
  multiplier: number;
}

const ALL_TYPES: readonly PitchType[] = ['fastball', 'changeup', 'curveball'];

/** The five 難度, easiest first. Names are data: change a 投手 here only. */
export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'easy', name: '簡易', pitcher: 'Luna', types: ['fastball'], speeds: ['slow'], multiplier: 1.0 },
  { id: 'normal', name: '普通', pitcher: 'Glasnow', types: ['fastball', 'changeup'], speeds: ['medium'], multiplier: 1.3 },
  { id: 'hard', name: '困難', pitcher: 'Snell', types: ALL_TYPES, speeds: ['medium'], multiplier: 1.6 },
  { id: 'expert', name: '極難', pitcher: 'Otani', types: ALL_TYPES, speeds: ['fast'], multiplier: 2.0 },
  { id: 'hell', name: '地獄', pitcher: 'Yamamoto', types: ALL_TYPES, speeds: ['slow', 'medium', 'fast'], multiplier: 2.5 },
];

/** The 難度 a new player starts on. */
export const DEFAULT_DIFFICULTY: DifficultyId = 'easy';

/** The 難度 with this id. Throws on an unknown id (use parseDifficultyId for untrusted data). */
export function difficulty(id: DifficultyId): Difficulty {
  const found = DIFFICULTIES.find((d) => d.id === id);
  if (!found) throw new RangeError(`Unknown 難度 ${String(id)}`);
  return found;
}

/** A 難度 id from untrusted data (e.g. localStorage), or null when it isn't one. */
export function parseDifficultyId(raw: unknown): DifficultyId | null {
  return DIFFICULTIES.some((d) => d.id === raw) ? (raw as DifficultyId) : null;
}

/** 分數 for one 全壘打 = 100 × 難度倍率 (rounded to a whole point). */
export function homeRunPoints(multiplier: number): number {
  return Math.round(100 * multiplier);
}
