/**
 * The clock 一局 runs on: performance.now() minus the time spent paused. While
 * paused it stands still, so on resume the pitch clock, motion, ball, crowd and
 * 投手 effect carry on exactly where they stopped, and a tap's timing is judged
 * as if the pause never happened.
 */
export interface GameClock {
  /** Game time now, ms. Frozen while paused. */
  now(): number;
  /** Game time of a real high-resolution timestamp (performance.now / event.timeStamp) taken while running. */
  at(realMs: number): number;
  pause(): void;
  resume(): void;
  paused(): boolean;
}

export function createGameClock(realNow: () => number = () => performance.now()): GameClock {
  let pausedTotal = 0;
  let pausedAt: number | null = null;
  return {
    now: () => (pausedAt ?? realNow()) - pausedTotal,
    at: (realMs) => realMs - pausedTotal,
    pause() {
      if (pausedAt === null) pausedAt = realNow();
    },
    resume() {
      if (pausedAt === null) return;
      pausedTotal += realNow() - pausedAt;
      pausedAt = null;
    },
    paused: () => pausedAt !== null,
  };
}
