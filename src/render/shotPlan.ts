import type { CinematicVersion } from '../core';

/**
 * 鏡頭組合: which 揮棒特寫, 擊球特寫 and chase a 全壘打演出 uses. Pure, so a
 * fixed random source gives a fixed plan.
 */

/** 揮棒特寫: 斜前方低角度, 捕手視角, 正面, 地面仰角. */
export const SWING_CAMS = ['front', 'catcher', 'face', 'worm'] as const;
/** 擊球特寫: 光軌送棒, 打者甩棒, 投手回頭目送. */
export const CONTACT_CAMS = ['trail', 'flip', 'pitcher'] as const;
/** 追球: 後方追球, 側面追球, 上方俯瞰, 外野迎面. */
export const CHASE_CAMS = ['behind', 'side', 'top', 'outfield'] as const;

export type SwingCam = (typeof SWING_CAMS)[number];
export type ContactCam = (typeof CONTACT_CAMS)[number];
export type ChaseCam = (typeof CHASE_CAMS)[number];

export interface ShotPlan {
  swing: SwingCam;
  /** null in the short version (it has no 擊球特寫). */
  contact: ContactCam | null;
  chase: ChaseCam;
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * Always draws three values (揮棒特寫, 擊球特寫, chase), in that order, for either
 * version, so the draws a plan uses don't depend on the version.
 */
export function pickShotPlan(random: () => number, version: CinematicVersion): ShotPlan {
  const swing = pick(SWING_CAMS, random());
  const contact = pick(CONTACT_CAMS, random());
  const chase = pick(CHASE_CAMS, random());
  return { swing, contact: version === 'full' ? contact : null, chase };
}
