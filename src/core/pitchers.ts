import { makeAppearance, type Appearance } from './appearance';
import type { DifficultyId } from './difficulty';

/**
 * 投手 data: how each 難度's 投手 looks and which effect surrounds them. The
 * 投手's name and 難度 are in difficulty.ts; everything else about a 投手 is
 * here, so a new 投手 is a data change only. Values follow prototype v6.
 */

/** 投手 effects, weakest first: none, 閃光, 旋風環, 藍色光暈＋閃電, 火焰＋紅光＋地面光圈＋閃電. */
export const PITCHER_AURAS = ['none', 'sparkle', 'whirlwind', 'lightning', 'inferno'] as const;
export type PitcherAura = (typeof PITCHER_AURAS)[number];

export interface PitcherProfile {
  look: Appearance;
  aura: PitcherAura;
}

const WHITE = '#f6f6f6';
const GRAY = '#b9bec8';
const DODGER: Partial<Appearance> = {
  team: 'Dodgers',
  trim: '#1e4fa3',
  frontNumberColor: '#e0393e',
  cap: '#1e4fa3',
  sleeve: '#1e4fa3',
  belt: '#1e4fa3',
  shoe: '#1e4fa3',
  hair: '#1a1410',
};

const PITCHERS: Record<DifficultyId, PitcherProfile> = {
  easy: {
    aura: 'none',
    look: makeAppearance({
      jersey: WHITE, pants: WHITE, team: 'K2B', trim: '#ff6fae', frontNumberColor: '#ff6fae',
      cap: '#ff8fc0', sleeve: '#ff8fc0', belt: '#ff8fc0', shoe: '#ff8fc0', glove: '#f2a0c4',
      number: '0', nameOnBack: 'LUNA', scale: 0.76, headScale: 1.1, width: 0.92, hairStyle: 'pigtails', hair: '#3a2618',
    }),
  },
  normal: {
    aura: 'sparkle',
    look: makeAppearance({
      ...DODGER, jersey: WHITE, pants: WHITE, glove: '#1a1a1a',
      number: '31', nameOnBack: 'GLASNOW', scale: 1.1, width: 0.84, torsoHeight: 1.12, hairStyle: 'long', hair: '#6b4a2e',
    }),
  },
  hard: {
    aura: 'whirlwind',
    look: makeAppearance({
      ...DODGER, jersey: GRAY, pants: GRAY, glove: '#1a1a1a',
      number: '7', nameOnBack: 'SNELL', scale: 1.07, width: 1.12, torsoHeight: 1.06, beard: 'mustache', goatee: true, hair: '#2a1d16', lefty: true,
    }),
  },
  expert: {
    aura: 'lightning',
    look: makeAppearance({ ...DODGER, jersey: WHITE, pants: WHITE, glove: '#a5582a', number: '17', nameOnBack: 'OTANI', scale: 1.1, width: 1.15, torsoHeight: 1.1 }),
  },
  hell: {
    aura: 'inferno',
    look: makeAppearance({ ...DODGER, jersey: GRAY, pants: GRAY, glove: '#1e4fa3', number: '18', nameOnBack: 'YAMAMOTO' }),
  },
};

/** The 投手 of this 難度. Throws on an unknown id. */
export function pitcherOf(id: DifficultyId): PitcherProfile {
  const found = Object.hasOwn(PITCHERS, id) ? PITCHERS[id] : undefined;
  if (!found) throw new RangeError(`Unknown 難度 ${String(id)}`);
  return found;
}
