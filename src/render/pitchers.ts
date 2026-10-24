import type { Object3D, Scene, Vector3 } from 'three';
import { DIFFICULTIES, pitcherOf, type DifficultyId } from '../core';
import { createPitcherAura } from './pitcherAura';
import { createPitcher, type Pitcher } from './players';

/**
 * The five 投手 on the mound, one per 難度 (looks and effects: core/pitchers.ts).
 * All five are built once and only the current one is shown. The lineup itself
 * is a Pitcher that always means the current one, so the at-bat and the
 * 全壘打演出 hold one object and see a new 投手 (and their release point) as
 * soon as use() switches.
 */
export interface PitcherLineup extends Pitcher {
  /** Puts this 難度's 投手 (and effect) on the mound. */
  use(id: DifficultyId): void;
  current(): DifficultyId;
  /** Runs the effect; call every frame with performance.now(). */
  update(nowMs: number, reducedMotion: boolean): void;
}

export function createPitcherLineup(scene: Scene, first: DifficultyId = DIFFICULTIES[0].id): PitcherLineup {
  const pitchers = new Map(DIFFICULTIES.map((d) => [d.id, createPitcher(scene, pitcherOf(d.id).look)] as const));
  const aura = createPitcherAura(scene);
  let id = first;
  let on = pitchers.get(first)!;

  const lineup: PitcherLineup = {
    use(next) {
      id = next;
      on = pitchers.get(next) ?? on;
      for (const [k, p] of pitchers) p.root.visible = k === next;
      on.setTurn(0, 0);
      aura.set(pitcherOf(next).aura);
    },
    current: () => id,
    update: (nowMs, reduced) => aura.update(nowMs, reduced),
    setWindup: (t) => on.setWindup(t),
    setTurn: (u, heading) => on.setTurn(u, heading),
    get hand(): Object3D {
      return on.hand;
    },
    get releasePoint(): Readonly<Vector3> {
      return on.releasePoint;
    },
    get root(): Object3D {
      return on.root;
    },
  };
  lineup.use(first);
  return lineup;
}
