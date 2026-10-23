import type { BestScore, BestScoreStorage } from '../core';

const BEST_SCORE_KEY = 'homerun-derby:best-score';

/**
 * 最高分 in localStorage. Never throws: when storage is blocked (private
 * browsing, disabled cookies, quota) it reads as "no record" and writes are
 * dropped, so the game plays on.
 */
export function localBestScoreStorage(key = BEST_SCORE_KEY): BestScoreStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? null : parseBestScore(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    save(best) {
      try {
        window.localStorage.setItem(key, JSON.stringify(best));
      } catch {
        // Storage unavailable: the record lasts only this session.
      }
    },
  };
}

function parseBestScore(v: unknown): BestScore | null {
  if (typeof v !== 'object' || v === null) return null;
  const { score, totalDistance } = v as Record<string, unknown>;
  return typeof score === 'number' && Number.isFinite(score) && typeof totalDistance === 'number' && Number.isFinite(totalDistance)
    ? { score, totalDistance }
    : null;
}
