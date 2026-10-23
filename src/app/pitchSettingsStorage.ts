import { DEFAULT_PITCH_SETTINGS, parsePitchSettings, type PitchSettings } from '../core';
import { localJsonStore } from './jsonStore';

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
  const store = localJsonStore(key);
  return {
    load: () => parsePitchSettings(store.read()) ?? DEFAULT_PITCH_SETTINGS,
    save: (settings) => store.write(settings),
  };
}
