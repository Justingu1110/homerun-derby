import type { BestScore, RoundState } from '../core';

/**
 * The menu screens around 一局 (標題, 結算), as DOM overlays above the stadium.
 * They only show what the core reports; no rules here.
 */
export interface Screens {
  showTitle(best: BestScore | null): void;
  showResult(state: RoundState): void;
  /** The 設定 screen; its contents are filled by mountSettingsScreen(settingsPanel). */
  showSettings(): void;
  readonly settingsPanel: HTMLElement;
  hide(): void;
}

export interface ScreenActions {
  start(): void;
  backToTitle(): void;
  settings(): void;
}

const metres = (m: number) => `${Math.round(m)} m`;

export function createScreens(root: HTMLElement, actions: ScreenActions): Screens {
  root.innerHTML = `
    <section class="screen screen-title" hidden>
      <h1 class="title-logo">全壘打<br />大賽</h1>
      <div class="title-best"><span class="label">最高分</span><span class="value" data-best></span></div>
      <div class="screen-buttons">
        <button type="button" class="btn btn-primary" data-action="start">開始</button>
        <button type="button" class="btn" disabled title="即將推出">投球設定</button>
        <button type="button" class="btn" data-action="settings">設定</button>
      </div>
    </section>
    <section class="screen screen-result" hidden>
      <h2 class="result-heading">一局結束</h2>
      <div class="result-record" data-record hidden>新紀錄！</div>
      <div class="result-score"><span class="label">分數</span><span class="value" data-score></span></div>
      <dl class="result-stats">
        <div><dt>全壘打</dt><dd data-home-runs></dd></div>
        <div><dt>總飛距離</dt><dd data-total></dd></div>
        <div><dt>最遠一支</dt><dd data-longest></dd></div>
      </dl>
      <div class="screen-buttons">
        <button type="button" class="btn btn-primary" data-action="again">再玩一次</button>
        <button type="button" class="btn" data-action="title">回標題</button>
      </div>
    </section>
    <section class="screen screen-settings" hidden></section>`;
  const title = root.querySelector<HTMLElement>('.screen-title')!;
  const result = root.querySelector<HTMLElement>('.screen-result')!;
  const settings = root.querySelector<HTMLElement>('.screen-settings')!;
  const field = (name: string) => root.querySelector<HTMLElement>(`[data-${name}]`)!;

  // Buttons act on click; their pointerdown must not reach the swing handler.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'start' || action === 'again') actions.start();
    else if (action === 'title') actions.backToTitle();
    else if (action === 'settings') actions.settings();
  });

  const show = (screen: HTMLElement | null) => {
    for (const s of root.querySelectorAll<HTMLElement>('.screen')) s.hidden = s !== screen;
    root.hidden = !screen;
    screen?.querySelector<HTMLElement>('.btn-primary')?.focus({ preventScroll: true });
  };

  return {
    showTitle(best) {
      const bestEl = field('best');
      bestEl.textContent = best ? String(best.score) : '還沒有紀錄';
      bestEl.classList.toggle('is-empty', !best);
      show(title);
    },
    showResult(state) {
      field('score').textContent = String(state.score);
      field('record').hidden = !state.newBest;
      result.classList.toggle('is-record', state.newBest);
      field('home-runs').textContent = `${state.homeRuns} 支`;
      field('total').textContent = metres(state.totalDistance);
      field('longest').textContent = state.longest ? metres(state.longest.distance) : '—';
      show(result);
    },
    settingsPanel: settings,
    showSettings() {
      show(settings);
    },
    hide() {
      show(null);
    },
  };
}
