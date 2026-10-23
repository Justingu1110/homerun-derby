import { TUNING } from '../core';
import type { SettingsStore } from './settings';

/**
 * Fills the 設定 screen: 隨機幅度 slider, 音效 and 震動 switches. Every change
 * is stored at once. The 返回 button uses data-action="title" (handled by screens.ts).
 */
export function mountSettingsScreen(section: HTMLElement, store: SettingsStore): void {
  section.innerHTML = `
    <h2 class="screen-heading">設定</h2>
    <div class="settings-list">
      <label class="setting setting-range">
        <span class="setting-name">隨機幅度 <span class="setting-value" data-randomness-value></span></span>
        <input type="range" min="0" max="100" step="5" data-setting="randomness" />
        <span class="setting-note" data-randomness-note></span>
      </label>
      <label class="setting setting-toggle">
        <span class="setting-name">音效</span>
        <input type="checkbox" role="switch" data-setting="sound" />
      </label>
      <label class="setting setting-toggle">
        <span class="setting-name">震動</span>
        <input type="checkbox" role="switch" data-setting="vibration" />
      </label>
      <p class="setting-note settings-vibration-note" data-vibration-note hidden>這台裝置不支援震動</p>
    </div>
    <div class="screen-buttons">
      <button type="button" class="btn btn-primary" data-action="title">返回</button>
    </div>`;
  const input = (name: string) => section.querySelector<HTMLInputElement>(`[data-setting=${name}]`)!;
  const randomness = input('randomness');
  const sound = input('sound');
  const vibration = input('vibration');

  const showRandomness = (r: number) => {
    const spread = Math.round(r * TUNING.randomness.maxDistanceSpread * 100);
    section.querySelector('[data-randomness-value]')!.textContent = `${Math.round(r * 100)}%`;
    section.querySelector('[data-randomness-note]')!.textContent = spread === 0 ? '同樣的時機一定得到同樣的結果' : `飛距離約 ±${spread}%`;
    randomness.style.setProperty('--fill', `${r * 100}%`);
  };

  const s = store.get();
  randomness.value = String(Math.round(s.randomness * 100));
  sound.checked = s.sound;
  vibration.checked = s.vibration;
  showRandomness(s.randomness);
  section.querySelector<HTMLElement>('[data-vibration-note]')!.hidden = typeof navigator.vibrate === 'function';

  randomness.addEventListener('input', () => showRandomness(store.set({ randomness: Number(randomness.value) / 100 }).randomness));
  sound.addEventListener('change', () => store.set({ sound: sound.checked }));
  vibration.addEventListener('change', () => store.set({ vibration: vibration.checked }));
}
