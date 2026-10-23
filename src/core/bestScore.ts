/** 最高分: one record per device. Ticket #5 adds the 投球設定 it was set with. */
export interface BestScore {
  score: number;
  /** Total 飛距離 of that round (m): breaks a tie in 分數. */
  totalDistance: number;
}

/**
 * Where the 最高分 lives, injected by the app (localStorage in the browser).
 * Either call may throw (private browsing, quota); the core carries on.
 */
export interface BestScoreStorage {
  load(): BestScore | null;
  save(best: BestScore): void;
}

/** The stored 最高分, or null when there is none or the storage fails. */
export function readBestScore(storage: BestScoreStorage | undefined): BestScore | null {
  try {
    return storage?.load() ?? null;
  } catch {
    return null;
  }
}

/** Records `result` if it beats the stored 最高分 (分數 first, then total 飛距離). Returns whether it did. */
export function recordIfBest(storage: BestScoreStorage | undefined, result: BestScore): boolean {
  if (!beats(result, readBestScore(storage) ?? { score: 0, totalDistance: 0 })) return false;
  try {
    storage?.save({ score: result.score, totalDistance: result.totalDistance });
  } catch {
    // Not saved, but it still was a record for this round.
  }
  return true;
}

function beats(a: BestScore, b: BestScore): boolean {
  return a.score !== b.score ? a.score > b.score : a.totalDistance > b.totalDistance;
}
