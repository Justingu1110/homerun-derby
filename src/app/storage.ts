import { parsePitchSettings, type BestScore, type BestScoreStorage } from '../core';
import { localJsonStore } from './jsonStore';

const BEST_SCORE_KEY = 'homerun-derby:best-score';

/**
 * 最高分 in localStorage. Never throws: when storage is blocked it reads as
 * "no 最高分 yet" and writes are dropped, so the game plays on.
 */
export function localBestScoreStorage(key = BEST_SCORE_KEY): BestScoreStorage {
  const store = localJsonStore(key);
  return {
    load: () => parseBestScore(store.read()),
    save: (best) => store.write(best),
  };
}

function parseBestScore(v: unknown): BestScore | null {
  if (typeof v !== 'object' || v === null) return null;
  const { score, totalDistance, pitchSettings } = v as Record<string, unknown>;
  if (!(typeof score === 'number' && Number.isFinite(score) && typeof totalDistance === 'number' && Number.isFinite(totalDistance))) return null;
  const settings = parsePitchSettings(pitchSettings);
  return settings ? { score, totalDistance, pitchSettings: settings } : { score, totalDistance };
}
