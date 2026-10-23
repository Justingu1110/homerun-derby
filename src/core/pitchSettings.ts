/** 球種: 直球, 變速球, 曲球. */
export type PitchType = 'fastball' | 'changeup' | 'curveball';

/** 球速 level: 慢, 中, 快. */
export type SpeedLevel = 'slow' | 'medium' | 'fast';

/** Every 球種, in display order. */
export const PITCH_TYPES: readonly PitchType[] = ['fastball', 'changeup', 'curveball'];

/** Every 球速 level, in display order. */
export const SPEED_LEVELS: readonly SpeedLevel[] = ['slow', 'medium', 'fast'];

/** 投球設定: which 球種 the pitcher throws (at least one) and at which 球速 level. */
export interface PitchSettings {
  types: readonly PitchType[];
  speed: SpeedLevel;
}

/** The 投球設定 before the player changes anything: 直球 only, 中速. */
export const DEFAULT_PITCH_SETTINGS: PitchSettings = { types: ['fastball'], speed: 'medium' };
