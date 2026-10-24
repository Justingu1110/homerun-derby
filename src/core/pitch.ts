/** 球種: 直球, 變速球, 曲球. */
export type PitchType = 'fastball' | 'changeup' | 'curveball';

/** 球速 level: 慢, 中, 快. */
export type SpeedLevel = 'slow' | 'medium' | 'fast';

/** Every 球種, in display order. */
export const PITCH_TYPES: readonly PitchType[] = ['fastball', 'changeup', 'curveball'];

/** Every 球速 level, in display order. */
export const SPEED_LEVELS: readonly SpeedLevel[] = ['slow', 'medium', 'fast'];

/** On-screen name of each 球種 (e.g. for 「曲球 79 mph」). */
export const PITCH_TYPE_NAME: Record<PitchType, string> = { fastball: '直球', changeup: '變速球', curveball: '曲球' };

/** On-screen name of each 球速 level. */
export const SPEED_LEVEL_NAME: Record<SpeedLevel, string> = { slow: '慢', medium: '中', fast: '快' };
