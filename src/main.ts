import './style.css';
import { readBestScore, startRound } from './core';
import { createScreens } from './app/screens';
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
const atBat = createAtBat(view.scene, view.camera, hud);
const storage = localBestScoreStorage();

// Screen flow: 標題 → 一局 → 結算 → (再玩一次 → 一局) | (回標題 → 標題).
const showTitle = () => {
  hud.showRound(null);
  screens.showTitle(readBestScore(storage));
};
const play = () => {
  screens.hide();
  atBat.play(startRound({ random: Math.random, storage }), performance.now(), (state) => {
    hud.showRound(null);
    screens.showResult(state);
  });
};
const screens = createScreens(screensRoot, { start: play, backToTitle: showTitle });
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
