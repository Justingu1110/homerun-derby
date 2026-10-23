import { PITCH_TYPES, SPEED_LEVELS, difficultyMultiplier, homeRunPoints, togglePitchType, type PitchSettings, type PitchType, type SpeedLevel } from '../core';
import { formatMultiplier } from '../render/hud';
import type { PitchSettingsStorage } from './pitchSettingsStorage';
import './pitchSettingsScreen.css';

/** On-screen words for 球種 and 球速. Presentation only. */
export const PITCH_TYPE_LABEL: Record<PitchType, string> = { fastball: '直球', changeup: '變速球', curveball: '曲球' };
export const SPEED_LABEL: Record<SpeedLevel, string> = { slow: '慢', medium: '中', fast: '快' };

/** A 投球設定 in a few words, e.g. 「快速・直球／曲球」 (the note next to the 最高分). */
export const describePitchSettings = (s: PitchSettings) => `${SPEED_LABEL[s.speed]}速・${s.types.map((t) => PITCH_TYPE_LABEL[t]).join('／')}`;

export interface PitchSettingsScreen {
  show(): void;
  hide(): void;
}

/**
 * 投球設定 screen: check 球種, pick 球速, see the 難度倍率 change as you go.
 * Every change is saved at once. The rules (at least one 球種, the multiplier
 * formula) come from the game core.
 */
export function createPitchSettingsScreen(host: HTMLElement, storage: PitchSettingsStorage, back: () => void): PitchSettingsScreen {
  const root = document.createElement('div');
  root.id = 'pitch-settings';
  root.hidden = true;
  root.innerHTML = `
    <section class="screen screen-pitch" aria-labelledby="pitch-settings-heading">
      <h2 class="pitch-heading" id="pitch-settings-heading">投球設定</h2>
      <fieldset class="pitch-group">
        <legend>球種</legend>
        <div class="pitch-options">
          ${PITCH_TYPES.map((t) => `<label class="pitch-chip"><input type="checkbox" name="type" value="${t}" /><span>${PITCH_TYPE_LABEL[t]}</span></label>`).join('')}
        </div>
        <p class="pitch-note">至少要勾一種球種</p>
      </fieldset>
      <fieldset class="pitch-group">
        <legend>球速</legend>
        <div class="pitch-options pitch-speed">
          ${SPEED_LEVELS.map((s) => `<label class="pitch-chip"><input type="radio" name="speed" value="${s}" /><span>${SPEED_LABEL[s]}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="pitch-mult">
        <span class="label">難度倍率</span>
        <span class="value" data-pitch-mult></span>
        <span class="pitch-points" data-pitch-points></span>
      </div>
      <div class="screen-buttons">
        <button type="button" class="btn btn-primary" data-pitch-back>返回</button>
      </div>
    </section>`;
  host.append(root);

  const typeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name=type]')];
  const speedInputs = [...root.querySelectorAll<HTMLInputElement>('input[name=speed]')];
  const multEl = root.querySelector<HTMLElement>('[data-pitch-mult]')!;
  const pointsEl = root.querySelector<HTMLElement>('[data-pitch-points]')!;
  let settings = storage.load();

  const render = () => {
    const lastOne = settings.types.length === 1;
    for (const input of typeInputs) {
      input.checked = settings.types.includes(input.value as PitchType);
      // The core refuses to uncheck the last 球種; lock it so the box can't even look unchecked.
      input.disabled = lastOne && input.checked;
    }
    for (const input of speedInputs) input.checked = input.value === settings.speed;
    const m = difficultyMultiplier(settings);
    multEl.textContent = formatMultiplier(m);
    pointsEl.textContent = `每支全壘打 ${homeRunPoints(m)} 分`;
  };

  const update = (next: PitchSettings) => {
    settings = next;
    storage.save(settings);
    render();
  };

  // Its buttons must not reach the swing handler on window.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.name === 'type') update(togglePitchType(settings, input.value as PitchType));
    else if (input.name === 'speed') update({ types: settings.types, speed: input.value as SpeedLevel });
  });
  root.querySelector('[data-pitch-back]')!.addEventListener('click', back);

  return {
    show() {
      settings = storage.load();
      render();
      root.hidden = false;
      root.querySelector<HTMLElement>('[data-pitch-back]')!.focus({ preventScroll: true });
    },
    hide() {
      root.hidden = true;
    },
  };
}
