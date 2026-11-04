import { bus } from './Events';

export type QualityLevel = 'low' | 'medium' | 'high';
export interface SettingsData {
  quality: QualityLevel | 'auto';
  renderScale: number;      // 0.5 .. 1
  dynamicResolution: boolean;
  showFps: boolean;
  master: number; music: number; sfx: number; ambience: number;
  sensX: number; sensY: number; invertY: boolean;
  aimAssist: boolean; aimToggle: boolean;
  joystickSize: number; controlsOpacity: number; leftHanded: boolean;
  language: 'tr' | 'en';
  subtitles: boolean; screenShake: number; reduceFlashing: boolean; textScale: number;
  vibration: boolean;
}

const KEY = 'ugultu_settings_v1';
const defaults = (): SettingsData => ({
  quality: 'auto', renderScale: 1, dynamicResolution: true, showFps: false,
  master: 0.9, music: 0.7, sfx: 0.9, ambience: 0.8,
  sensX: 1, sensY: 1, invertY: false,
  aimAssist: true, aimToggle: true,
  joystickSize: 1, controlsOpacity: 0.85, leftHanded: false,
  language: (typeof navigator !== 'undefined' && !/^tr/i.test(navigator.language || 'tr')) ? 'en' : 'tr',
  subtitles: true, screenShake: 1, reduceFlashing: false, textScale: 1,
  vibration: true,
});

class SettingsStore {
  data: SettingsData = defaults();
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...defaults(), ...JSON.parse(raw) };
    } catch { /* storage unavailable: keep defaults */ }
    return this.data;
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    this.data[k] = v;
    this.save();
    bus.emit('settings', k, v);
  }
  reset() { this.data = defaults(); this.save(); bus.emit('settings', '*'); }
}

export const settings = new SettingsStore();
