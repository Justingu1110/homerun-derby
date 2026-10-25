import { PITCH_TYPE_NAME, type OutKind, type Pitch, type PitchResult, type RoundState, type TimingGrade } from '../core';
import { formatDistance, formatMultiplier } from '../presentation/format';

/** On-screen words for the core's results. Presentation only; no rules here. */
export const TIMING_LABEL: Record<TimingGrade, string> = { perfect: 'Perfect', early: '太早', late: '太晚' };
export const OUT_LABEL: Record<OutKind, string> = { flyOut: '界內球', foul: '界外', whiff: '揮空', noSwing: '沒揮棒' };

export interface Hud {
  /** Shows the 時機評價 right after a swing. */
  showTiming(grade: TimingGrade): void;
  /** Shows 全壘打 + 飛距離, or the 出局 kind. */
  showResult(result: PitchResult): void;
  /** 球種 + 球速 at the bottom right (「曲球 79 mph」) from release; null hides it. Repeating the same pitch is a no-op. */
  showPitch(pitch: Pitch | null): void;
  /** Clears the 時機評價, result and 球速 label (a new pitch, or the end of 一局). */
  clear(): void;
  /** Hint shown until the first swing. */
  hint(on: boolean): void;
  /** While the 全壘打演出 plays, the HUD steps aside (it owns the screen); the 球速 label is hidden for good. */
  cinematic(on: boolean): void;
  /** Shows the ⏸ button (only while batting); repeating the same value is a no-op. */
  pausable(on: boolean): void;
  /** Top bar during 一局: 分數, 難度倍率, 出局 dots. null hides it. */
  showRound(state: RoundState | null): void;
}

/** onPause: the ⏸ button at the right end of the top bar was pressed. */
export function createHud(root: HTMLElement, onPause: () => void = () => {}): Hud {
  root.innerHTML =
    '<div class="hud-bar" hidden><div class="hud-score"><span class="hud-score-label">分數</span><span class="hud-score-value"></span></div>' +
    '<div class="hud-mult"></div><div class="hud-outs" aria-label="出局"></div>' +
    '<button type="button" class="hud-pause" aria-label="暫停" hidden>⏸</button></div>' +
    '<div class="hud-timing"></div><div class="hud-result"></div><div class="hud-hint">點畫面任何地方揮棒</div>' +
    '<div class="hud-pitch"><span class="hud-pitch-type"></span><span class="hud-pitch-mph"></span><span class="hud-pitch-unit">mph</span></div>';
  const timing = root.querySelector<HTMLElement>('.hud-timing')!;
  const result = root.querySelector<HTMLElement>('.hud-result')!;
  const hintEl = root.querySelector<HTMLElement>('.hud-hint')!;
  const bar = root.querySelector<HTMLElement>('.hud-bar')!;
  const scoreEl = root.querySelector<HTMLElement>('.hud-score-value')!;
  const multEl = root.querySelector<HTMLElement>('.hud-mult')!;
  const outsEl = root.querySelector<HTMLElement>('.hud-outs')!;
  const pitchEl = root.querySelector<HTMLElement>('.hud-pitch')!;
  const pitchType = root.querySelector<HTMLElement>('.hud-pitch-type')!;
  const pitchMph = root.querySelector<HTMLElement>('.hud-pitch-mph')!;
  const pauseBtn = root.querySelector<HTMLButtonElement>('.hud-pause')!;
  // Pressing ⏸ is never a 揮棒: its pointerdown stops before the swing handler on window.
  pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  pauseBtn.addEventListener('click', () => onPause());
  let labelled: Pitch | null = null;
  const showPitch = (pitch: Pitch | null) => {
    if (pitch === labelled) return;
    labelled = pitch;
    if (pitch) {
      pitchType.textContent = PITCH_TYPE_NAME[pitch.type];
      pitchMph.textContent = String(Math.round(pitch.mph));
    }
    pitchEl.classList.toggle('show', !!pitch);
  };
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
        result.innerHTML = `全壘打！<span class="hud-distance">${formatDistance(r.ball.distance)}</span>`;
        result.dataset.kind = 'homeRun';
      } else {
        result.textContent = `出局・${OUT_LABEL[r.out]}`;
        result.dataset.kind = 'out';
      }
      pop(result);
    },
    showPitch,
    clear() {
      showPitch(null);
      timing.textContent = '';
      result.textContent = '';
      timing.classList.remove('pop');
      result.classList.remove('pop');
    },
    cinematic(on) {
      if (on) showPitch(null);
      root.classList.toggle('is-cinematic', on);
    },
    pausable(on) {
      if (pauseBtn.hidden === !on) return;
      pauseBtn.hidden = !on;
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
