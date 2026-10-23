import './style.css';
import { startRound } from './core';
import { createAtBat } from './render/atBat';
import { createHud } from './render/hud';
import { buildStadium } from './render/stadium';
import { createView } from './render/view';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (!canvas || !hudRoot) throw new Error('#stage / #hud missing');

const view = createView(canvas);
buildStadium(view.scene);
const hud = createHud(hudRoot);
const atBat = createAtBat(view.scene, view.camera, startRound({ random: Math.random }), hud, performance.now());

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
