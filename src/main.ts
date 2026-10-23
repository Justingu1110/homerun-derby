import './style.css';
import { readBestScore, startRound } from './core';
import { createFeedback } from './app/feedback';
import { createPitchSettingsScreen } from './app/pitchSettingsScreen';
import { localPitchSettingsStorage } from './app/pitchSettingsStorage';
import { createScreens } from './app/screens';
import { localSettings } from './app/settings';
import { mountSettingsScreen } from './app/settingsScreen';
import { localBestScoreStorage } from './app/storage';
import { createAtBat } from './render/atBat';
import { createCinematicOverlay } from './render/cinematicOverlay';
import { createHud } from './render/hud';
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
});
const storage = localBestScoreStorage();
const pitchSettingsStorage = localPitchSettingsStorage();

// Screen flow: 標題 → 一局 → 結算 → (再玩一次 → 一局) | (回標題 → 標題); 標題 ⇄ 投球設定.
const showTitle = () => {
  hud.showRound(null);
  screens.showTitle(readBestScore(storage));
};
const play = () => {
  screens.hide();
  atBat.play(startRound({ random: Math.random, storage, pitchSettings: pitchSettingsStorage.load(), randomness: settings.get().randomness }), performance.now(), (state) => {
    hud.showRound(null);
    screens.showResult(state);
  });
};
const pitchSettingsScreen = createPitchSettingsScreen(document.body, pitchSettingsStorage, () => {
  pitchSettingsScreen.hide();
  showTitle();
});
const openPitchSettings = () => {
  screens.hide();
  pitchSettingsScreen.show();
};
const screens = createScreens(screensRoot, {
  start: play,
  backToTitle: showTitle,
  settings: () => screens.showSettings(),
  pitchSettings: openPitchSettings,
});
mountSettingsScreen(screens.settingsPanel, settings);
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
