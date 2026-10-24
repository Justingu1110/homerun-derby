import { DIFFICULTIES, SPEED_LEVEL_NAME, type Difficulty, type DifficultyId } from '../core';
import { describePitchTypes, formatMultiplier } from '../presentation/format';
import type { DifficultyStorage } from './difficultyStorage';

/** The 球速 levels of a 難度, e.g. 「慢速」 or 「慢＋中＋快速」. */
export const describeSpeeds = (d: Difficulty) => `${d.speeds.map((s) => SPEED_LEVEL_NAME[s]).join('＋')}速`;

export interface DifficultyScreen {
  /** Marks the stored 難度 as selected; call before showing the screen. */
  refresh(): void;
}

/**
 * Fills the 選難度 screen: one card per 難度 with its 投手, 難度倍率 and 球種.
 * Tapping a card stores it and calls `picked` (back to the title). 返回 uses
 * data-action="title" (handled by screens.ts). The 難度 table is the game core's.
 */
export function mountDifficultyScreen(section: HTMLElement, storage: DifficultyStorage, picked: () => void): DifficultyScreen {
  section.innerHTML = `
    <h2 class="screen-heading">選難度</h2>
    <div class="difficulty-list">
      ${DIFFICULTIES.map(
        (d) => `
        <button type="button" class="difficulty-card" data-difficulty="${d.id}" aria-pressed="false">
          <span class="difficulty-name">${d.name}</span>
          <span class="difficulty-mult">${formatMultiplier(d.multiplier)}</span>
          <span class="difficulty-pitcher">投手 ${d.pitcher}</span>
          <span class="difficulty-pitches">${describeSpeeds(d)}・${describePitchTypes(d)}</span>
        </button>`,
      ).join('')}
    </div>
    <div class="screen-buttons">
      <button type="button" class="btn btn-primary" data-action="title">返回</button>
    </div>`;
  const cards = [...section.querySelectorAll<HTMLButtonElement>('[data-difficulty]')];

  const refresh = () => {
    const current = storage.load();
    for (const card of cards) card.setAttribute('aria-pressed', String(card.dataset.difficulty === current));
  };

  section.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-difficulty]')?.dataset.difficulty;
    if (!id) return;
    storage.save(id as DifficultyId);
    refresh();
    picked();
  });
  refresh();
  return { refresh };
}
