import { TUNING } from '../core';

/** 設定: kept on this device. Separate from the 投球設定 (their own key and screen). */
export interface Settings {
  /** 隨機幅度, 0–1 (the slider's 0–100%). Passed to startRound({ randomness }). */
  randomness: number;
  /** 音效 on/off. */
  sound: boolean;
  /** 震動 on/off. */
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  randomness: TUNING.randomness.default,
  sound: true,
  vibration: true,
};

export interface SettingsStore {
  /** The current 設定 (defaults if nothing is stored). */
  get(): Settings;
  /** Changes some 設定, stores them and returns the result. */
  set(patch: Partial<Settings>): Settings;
}

const SETTINGS_KEY = 'homerun-derby:settings';

/**
 * 設定 in localStorage. Never throws: when storage is blocked the 設定 still
 * work for this session, and a stored value with a bad field falls back to
 * that field's default.
 */
export function localSettings(key = SETTINGS_KEY): SettingsStore {
  let current = load(key);
  return {
    get: () => current,
    set(patch) {
      current = parseSettings({ ...current, ...patch });
      try {
        window.localStorage.setItem(key, JSON.stringify(current));
      } catch {
        // Storage unavailable: the 設定 last only this session.
      }
      return current;
    },
  };
}

function load(key: string): Settings {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? DEFAULT_SETTINGS : parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function parseSettings(v: unknown): Settings {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const r = o.randomness;
  return {
    randomness: typeof r === 'number' && Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : DEFAULT_SETTINGS.randomness,
    sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_SETTINGS.sound,
    vibration: typeof o.vibration === 'boolean' ? o.vibration : DEFAULT_SETTINGS.vibration,
  };
}
