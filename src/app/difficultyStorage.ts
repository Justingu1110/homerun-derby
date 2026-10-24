import { DEFAULT_DIFFICULTY, parseDifficultyId, type DifficultyId } from '../core';
import { localJsonStore } from './jsonStore';

const DIFFICULTY_KEY = 'homerun-derby:difficulty';

export interface DifficultyStorage {
  load(): DifficultyId;
  save(id: DifficultyId): void;
}

/**
 * The chosen 難度 in localStorage. Never throws: when storage is blocked or
 * holds something invalid it reads as DEFAULT_DIFFICULTY, and writes are dropped.
 * (v1's 投球設定 key `homerun-derby:pitch-settings` is simply ignored.)
 */
export function localDifficultyStorage(key = DIFFICULTY_KEY): DifficultyStorage {
  const store = localJsonStore(key);
  return {
    load: () => parseDifficultyId(store.read()) ?? DEFAULT_DIFFICULTY,
    save: (id) => store.write(id),
  };
}
