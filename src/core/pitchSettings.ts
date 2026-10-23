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

/** Checks or unchecks one 球種. The last checked 球種 cannot be unchecked: the settings come back unchanged. */
export function togglePitchType(settings: PitchSettings, type: PitchType): PitchSettings {
  const on = settings.types.includes(type);
  if (on && settings.types.length === 1) return settings;
  const types = PITCH_TYPES.filter((t) => (t === type ? !on : settings.types.includes(t)));
  return { types, speed: settings.speed };
}

/** 投球設定 from untrusted data (e.g. localStorage), or null when it isn't valid. 球種 come back in display order. */
export function parsePitchSettings(raw: unknown): PitchSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { types, speed } = raw as Record<string, unknown>;
  if (!Array.isArray(types) || !SPEED_LEVELS.includes(speed as SpeedLevel)) return null;
  if (types.length === 0 || !types.every((t) => PITCH_TYPES.includes(t as PitchType))) return null;
  return { types: PITCH_TYPES.filter((t) => types.includes(t)), speed: speed as SpeedLevel };
}
