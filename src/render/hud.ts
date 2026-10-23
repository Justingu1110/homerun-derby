import type { OutKind, PitchResult, RoundState, TimingGrade } from '../core';

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
  /** While the 全壘打演出 plays, the HUD steps aside (it owns the screen). */
  cinematic(on: boolean): void;
  /** Top bar during 一局: 分數, 難度倍率, 出局 dots. null hides it. */
  showRound(state: RoundState | null): void;
}

/** 難度倍率 as shown on screen, e.g. ×1.0, ×1.3. */
export const formatMultiplier = (m: number) => `×${m.toFixed(1)}`;

export function createHud(root: HTMLElement): Hud {
  root.innerHTML =
    '<div class="hud-bar" hidden><div class="hud-score"><span class="hud-score-label">分數</span><span class="hud-score-value"></span></div>' +
    '<div class="hud-mult"></div><div class="hud-outs" aria-label="出局"></div></div>' +
    '<div class="hud-timing"></div><div class="hud-result"></div><div class="hud-hint">點畫面任何地方揮棒</div>';
  const timing = root.querySelector<HTMLElement>('.hud-timing')!;
  const result = root.querySelector<HTMLElement>('.hud-result')!;
  const hintEl = root.querySelector<HTMLElement>('.hud-hint')!;
  const bar = root.querySelector<HTMLElement>('.hud-bar')!;
  const scoreEl = root.querySelector<HTMLElement>('.hud-score-value')!;
  const multEl = root.querySelector<HTMLElement>('.hud-mult')!;
  const outsEl = root.querySelector<HTMLElement>('.hud-outs')!;
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
    cinematic(on) {
      root.classList.toggle('is-cinematic', on);
    },
    hint(on) {
      hintEl.hidden = !on;
    },
    showRound(state) {
      bar.hidden = !state;
      if (!state) return;
      if (scoreEl.textContent !== String(state.score)) {
        scoreEl.textContent = String(state.score);
        if (state.score > 0) pop(scoreEl);
      }
      multEl.textContent = formatMultiplier(state.multiplier);
      if (outsEl.childElementCount !== state.maxOuts) {
        outsEl.replaceChildren(...Array.from({ length: state.maxOuts }, () => document.createElement('i')));
      }
      outsEl.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i < state.outs));
      outsEl.setAttribute('aria-label', `出局 ${state.outs} / ${state.maxOuts}`);
    },
  };
}
