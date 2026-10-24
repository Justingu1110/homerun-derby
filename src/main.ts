import './style.css';
import { difficulty, readBestScore, startRound } from './core';
import { createFeedback } from './app/feedback';
import { mountDifficultyScreen } from './app/difficultyScreen';
import { localDifficultyStorage } from './app/difficultyStorage';
import { createScreens } from './app/screens';
import { localSettings } from './app/settings';
import { mountSettingsScreen } from './app/settingsScreen';
import { localBestScoreStorage } from './app/storage';
import { createAtBat } from './render/atBat';
import { createCinematicOverlay } from './render/cinematicOverlay';
import { createHud } from './render/hud';
import { createIntroCard } from './render/pitcherIntro';
import { enablePlayerShadows } from './render/lighting';
import { buildStadium } from './render/stadium';
import { createView } from './render/view';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const screensRoot = document.querySelector<HTMLElement>('#screens');
const cinematicRoot = document.querySelector<HTMLElement>('#cinematic');
if (!canvas || !hudRoot || !screensRoot || !cinematicRoot) throw new Error('#stage / #hud / #screens / #cinematic missing');

const view = createView(canvas);
buildStadium(view.scene);
const hud = createHud(hudRoot);
const settings = localSettings();
const feedback = createFeedback(settings.get);
const atBat = createAtBat(view.scene, view.camera, hud, createCinematicOverlay(cinematicRoot), {
  swing: () => feedback.play('swing'),
  result: (result) => {
    if (!result.ball) return;
    feedback.play('hit');
    feedback.vibrate(result.kind === 'homeRun' ? [40, 60, 80] : 30);
  },
  // 全壘打演出 beats: the fanfare on "HOME RUN!!", the crash (and a buzz) on 打碎.
  homeRun: () => feedback.play('homeRun'),
  impact: (result) => {
    if (result.landing.kind !== 'facility' || !result.landing.smashed) return;
    feedback.play('smash');
    feedback.vibrate([70, 40, 140]);
  },
}, createIntroCard(cinematicRoot));
enablePlayerShadows(view.renderer, view.scene);
const storage = localBestScoreStorage();
const difficultyStorage = localDifficultyStorage();

// Screen flow: 標題 → 一局 → 結算 → (再玩一次 → 一局) | (回標題 → 標題); 標題 ⇄ 選難度, 標題 ⇄ 設定.
const showTitle = () => {
  hud.showRound(null);
  const chosen = difficultyStorage.load();
  atBat.usePitcher(chosen);
  screens.showTitle(readBestScore(storage), difficulty(chosen));
};
const play = () => {
  screens.hide();
  atBat.play(startRound({ random: Math.random, storage, difficulty: difficultyStorage.load(), randomness: settings.get().randomness }), performance.now(), (state) => {
    hud.showRound(null);
    screens.showResult(state);
  });
};
const screens = createScreens(screensRoot, {
  start: play,
  backToTitle: showTitle,
  settings: () => screens.showSettings(),
  difficulty: () => {
    difficultyScreen.refresh();
    screens.showDifficulty();
  },
});
mountSettingsScreen(screens.settingsPanel, settings);
// After picking a 難度: the 投手登場 of its 投手, then back to the title.
const difficultyScreen = mountDifficultyScreen(screens.difficultyPanel, difficultyStorage, (picked) => {
  screens.hide();
  atBat.introduce(picked, performance.now(), showTitle);
});
showTitle();

// Swing on any tap. event.timeStamp is a high-resolution time on the same clock
// as performance.now(), taken when the touch happened, not when a frame ran.
const tapTime = (e: Event) => {
  const now = performance.now();
  return e.timeStamp > 0 && e.timeStamp <= now + 1 ? e.timeStamp : now;
};
window.addEventListener('pointerdown', (e) => atBat.swing(tapTime(e)));

if (new URLSearchParams(location.search).has('debug')) {
  // __view exposes the renderer so Playwright can read renderer.info (draw calls, memory).
  Object.assign(window, { __atBat: atBat, __view: view });
}

view.start(() => atBat.update(performance.now()));
