import './style.css';
import { readBestScore, startRound } from './core';
import { createFeedback } from './app/feedback';
import { createScreens } from './app/screens';
import { localSettings } from './app/settings';
import { mountSettingsScreen } from './app/settingsScreen';
import { localBestScoreStorage } from './app/storage';
import { createAtBat } from './render/atBat';
import { createHud } from './render/hud';
import { buildStadium } from './render/stadium';
import { createView } from './render/view';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const screensRoot = document.querySelector<HTMLElement>('#screens');
if (!canvas || !hudRoot || !screensRoot) throw new Error('#stage / #hud / #screens missing');

const view = createView(canvas);
buildStadium(view.scene);
const hud = createHud(hudRoot);
const settings = localSettings();
const feedback = createFeedback(settings.get);
const atBat = createAtBat(view.scene, view.camera, hud, {
  swing: () => feedback.play('swing'),
  result: (result) => {
    if (!result.ball) return;
    feedback.play('hit');
    feedback.vibrate(result.kind === 'homeRun' ? [40, 60, 80] : 30);
    if (result.kind === 'homeRun') feedback.play('homeRun', 250);
  },
});
const storage = localBestScoreStorage();

// Screen flow: 標題 → 一局 → 結算 → (再玩一次 → 一局) | (回標題 → 標題).
const showTitle = () => {
  hud.showRound(null);
  screens.showTitle(readBestScore(storage));
};
const play = () => {
  screens.hide();
  atBat.play(startRound({ random: Math.random, storage, randomness: settings.get().randomness }), performance.now(), (state) => {
    hud.showRound(null);
    screens.showResult(state);
  });
};
const screens = createScreens(screensRoot, { start: play, backToTitle: showTitle, settings: () => screens.showSettings() });
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
  (window as unknown as { __atBat: typeof atBat }).__atBat = atBat;
}

view.start(() => atBat.update(performance.now()));
