import { parseDifficultyId, type DifficultyId } from './difficulty';

/** 最高分: one record per device, whatever the 難度. */
export interface BestScore {
  score: number;
  /** Total 飛距離 of that round (m): breaks a tie in 分數. */
  totalDistance: number;
  /** The 難度 it was set on. Missing only on a record stored before 難度 existed (v1). */
  difficulty?: DifficultyId;
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

/**
 * A 最高分 from untrusted data (e.g. localStorage), or null when it isn't one.
 * A v1 record (no 難度, maybe an old 投球設定) still reads, without a 難度.
 */
export function parseBestScore(raw: unknown): BestScore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { score, totalDistance, difficulty } = raw as Record<string, unknown>;
  if (!(typeof score === 'number' && Number.isFinite(score) && typeof totalDistance === 'number' && Number.isFinite(totalDistance))) return null;
  const id = parseDifficultyId(difficulty);
  return id ? { score, totalDistance, difficulty: id } : { score, totalDistance };
}

/** Records `result` if it beats the stored 最高分 (分數 first, then total 飛距離). Returns whether it did. */
export function recordIfBest(storage: BestScoreStorage | undefined, result: BestScore): boolean {
  if (!beats(result, readBestScore(storage) ?? { score: 0, totalDistance: 0 })) return false;
  try {
    const { score, totalDistance, difficulty } = result;
    storage?.save(difficulty ? { score, totalDistance, difficulty } : { score, totalDistance });
  } catch {
    // Not saved, but it still was a record for this round.
  }
  return true;
}

function beats(a: BestScore, b: BestScore): boolean {
  return a.score !== b.score ? a.score > b.score : a.totalDistance > b.totalDistance;
}
