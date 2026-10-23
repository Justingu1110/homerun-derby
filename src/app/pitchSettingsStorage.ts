import { DEFAULT_PITCH_SETTINGS, parsePitchSettings, type PitchSettings } from '../core';

const PITCH_SETTINGS_KEY = 'homerun-derby:pitch-settings';

export interface PitchSettingsStorage {
  load(): PitchSettings;
  save(settings: PitchSettings): void;
}

/**
 * 投球設定 in localStorage. Never throws: when storage is blocked or holds
 * something invalid it reads as the default (直球, 中速), and writes are dropped.
 */
export function localPitchSettingsStorage(key = PITCH_SETTINGS_KEY): PitchSettingsStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        return (raw !== null && parsePitchSettings(JSON.parse(raw))) || DEFAULT_PITCH_SETTINGS;
      } catch {
        return DEFAULT_PITCH_SETTINGS;
      }
    },
    save(settings) {
      try {
        window.localStorage.setItem(key, JSON.stringify(settings));
      } catch {
        // Storage unavailable: the settings last only this session.
      }
    },
  };
}
