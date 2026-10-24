import type { PerspectiveCamera } from 'three';
import type { Difficulty } from '../core';
import { describePitchTypes, formatMultiplier } from '../presentation/format';
import { MOUND } from './poses';
import { BATTER_VIEW, setLens } from './view';

/**
 * 投手登場: a close-up of the 投手 before 一局 (and after picking a 難度). The
 * camera swings round the front of the 投手 while a card shows the 難度, the
 * 投手's name, the 難度倍率 and the 球種. A tap skips it. From prototype v6 introShot.
 */
export const INTRO = {
  /** Length, s. */
  durS: 2.8,
  /** The card fades out from here, s. */
  cardOffS: 2.45,
  /** Camera orbit: distance from the 投手 (m), start and end angle (rad, 0 = straight in front), height (m) from → to. */
  radius: 4.4,
  fromAngle: -0.55,
  toAngle: 0.55,
  fromY: 0.95,
  toY: 1.25,
  /** The camera looks at this height (m). */
  lookY: 0.85,
  /** The 投手 shifts his weight: yaw amplitude (rad) and speed (rad/s). */
  swayYaw: 0.18,
  swayRate: 3,
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

/**
 * The intro camera at tS seconds in. With 減少動態效果 it holds still,
 * square in front of the 投手.
 */
export function introCamera(camera: PerspectiveCamera, tS: number, reducedMotion: boolean): void {
  const u = reducedMotion ? 0.5 : smooth(clamp01(tS / INTRO.durS));
  const a = INTRO.fromAngle + (INTRO.toAngle - INTRO.fromAngle) * u;
  camera.position.set(MOUND.x + Math.sin(a) * INTRO.radius, INTRO.fromY + (INTRO.toY - INTRO.fromY) * u, MOUND.z + Math.cos(a) * INTRO.radius);
  camera.lookAt(MOUND.x, INTRO.lookY, MOUND.z);
  setLens(camera, 1);
}

/** The 投手's weight shift during the intro (root yaw, rad); none with 減少動態效果. */
export const introSway = (tS: number, reducedMotion: boolean) => (reducedMotion ? 0 : INTRO.swayYaw * Math.sin(tS * INTRO.swayRate));

/** Back to the 打擊視角 once the intro is over. */
export function batterCamera(camera: PerspectiveCamera): void {
  camera.position.set(...BATTER_VIEW.position);
  camera.lookAt(...BATTER_VIEW.lookAt);
  setLens(camera, 1);
}

export interface IntroCard {
  show(d: Difficulty): void;
  hide(): void;
}

/** The intro card: 難度 badge, the 投手's name, 倍率・球種, and the skip hint. */
export function createIntroCard(root: HTMLElement): IntroCard {
  const card = document.createElement('div');
  card.className = 'intro-card';
  card.innerHTML =
    '<span class="intro-level"></span><span class="intro-name"></span><span class="intro-info"></span><span class="intro-skip">點畫面跳過 ▶▶</span>';
  root.append(card);
  const q = (s: string) => card.querySelector<HTMLElement>(s)!;
  return {
    show(d) {
      q('.intro-level').textContent = d.name;
      q('.intro-name').textContent = d.pitcher;
      q('.intro-info').textContent = `倍率 ${formatMultiplier(d.multiplier)}・${describePitchTypes(d)}`;
      card.classList.add('is-on');
    },
    hide() {
      card.classList.remove('is-on');
    },
  };
}
