import { parseBestScore, type BestScoreStorage } from '../core';
import { localJsonStore } from './jsonStore';

const BEST_SCORE_KEY = 'homerun-derby:best-score';

/**
 * 最高分 in localStorage. Never throws: when storage is blocked it reads as
 * "no 最高分 yet" and writes are dropped, so the game plays on. A v1 record
 * (no 難度) still reads.
 */
export function localBestScoreStorage(key = BEST_SCORE_KEY): BestScoreStorage {
  const store = localJsonStore(key);
  return {
    load: () => parseBestScore(store.read()),
    save: (best) => store.write(best),
  };
}
