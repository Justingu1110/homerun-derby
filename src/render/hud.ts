import type { OutKind, PitchResult, TimingGrade } from '../core';

/** On-screen words for the core's results. Presentation only; no rules here. */
export const TIMING_LABEL: Record<TimingGrade, string> = { perfect: 'Perfect', early: '太早', late: '太晚' };
export const OUT_LABEL: Record<OutKind, string> = { flyOut: '界內球', foul: '界外', whiff: '揮空', noSwing: '沒揮棒' };

export interface Hud {
  /** Shows the 時機評價 right after a swing. */
  showTiming(grade: TimingGrade): void;
  /** Shows 全壘打 + 飛距離, or the 出局 kind. */
  showResult(result: PitchResult): void;
  clear(): void;
  /** Hint shown until the first swing. */
  hint(on: boolean): void;
}

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = '<div class="hud-timing"></div><div class="hud-result"></div><div class="hud-hint">點畫面任何地方揮棒</div>';
  const timing = root.querySelector<HTMLElement>('.hud-timing')!;
  const result = root.querySelector<HTMLElement>('.hud-result')!;
  const hintEl = root.querySelector<HTMLElement>('.hud-hint')!;
  const pop = (el: HTMLElement) => {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  };
  return {
    showTiming(grade) {
      timing.textContent = TIMING_LABEL[grade];
      timing.dataset.grade = grade;
      pop(timing);
    },
    showResult(r) {
      if (r.kind === 'homeRun') {
        result.innerHTML = `全壘打！<span class="hud-distance">${Math.round(r.ball.distance)} m</span>`;
        result.dataset.kind = 'homeRun';
      } else {
        result.textContent = `出局・${OUT_LABEL[r.out]}`;
        result.dataset.kind = 'out';
      }
      pop(result);
    },
    clear() {
      timing.textContent = '';
      result.textContent = '';
      timing.classList.remove('pop');
      result.classList.remove('pop');
    },
    hint(on) {
      hintEl.hidden = !on;
    },
  };
}
