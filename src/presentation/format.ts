import { metresToFeet, PITCH_TYPE_NAME, type Difficulty } from '../core';

/**
 * On-screen words for the core's numbers, shared by the app screens (src/app)
 * and the in-game layers (src/render). Plain strings only: no DOM, no three.js.
 */

/** 飛距離 as a number and its unit, for layouts that style them apart (the 全壘打演出's big number). */
export const distanceParts = (metres: number) => ({ value: metresToFeet(metres), unit: 'ft' });

/** 飛距離 as shown on screen: the core's metres in whole feet, e.g. 394 ft. */
export const formatDistance = (metres: number) => {
  const { value, unit } = distanceParts(metres);
  return `${value} ${unit}`;
};

/** 難度倍率 as shown on screen, e.g. ×1.0, ×1.3. */
export const formatMultiplier = (m: number) => `×${m.toFixed(1)}`;

/** The 球種 of a 難度 in a few words, e.g. 「直球／變速球／曲球」. */
export const describePitchTypes = (d: Difficulty) => d.types.map((t) => PITCH_TYPE_NAME[t]).join('／');
