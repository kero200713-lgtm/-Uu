import { Capacitor, SystemBars } from '@capacitor/core';

/**
 * Thin platform layer. The same build runs as the native Android/iOS app
 * (Capacitor shell) and as the web test build; everything native is loaded on
 * demand so the web build stays light.
 */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

const MIRRORED = /^ugultu_/;
let prefs: typeof import('@capacitor/preferences').Preferences | null = null;
let haptics: typeof import('@capacitor/haptics') | null = null;

/**
 * Saves and settings live in localStorage (synchronous, used everywhere) and, in
 * the native app, are mirrored to the OS key-value store, because a WebView's
 * localStorage can be purged by the OS under storage pressure.
 */
export function persist(key: string, value: string): boolean {
  let ok = true;
  try { localStorage.setItem(key, value); } catch { ok = false; }
  if (prefs && MIRRORED.test(key)) prefs.set({ key, value }).catch(() => {});
  return ok || !!prefs;
}

export function forget(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  if (prefs && MIRRORED.test(key)) prefs.remove({ key }).catch(() => {});
}

/** Short tactile feedback: native haptics in the app, Vibration API on the web. */
export function vibrate(ms: number) {
  if (haptics) {
    const { Haptics, ImpactStyle } = haptics;
    Haptics.impact({ style: ms >= 40 ? ImpactStyle.Heavy : ms >= 15 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(ms); } catch { /* unsupported (iOS Safari) */ }
}

export interface NativeHooks {
  /** Android back: return false when there is nothing to go back from. */
  back(): boolean;
  /** App moved to background (true) or foreground (false). */
  background(hidden: boolean): void;
}

/**
 * Runs before the game boots. Restores mirrored saves/settings that are missing
 * from localStorage. Returns true when something was restored.
 */
export async function initNative(): Promise<boolean> {
  if (!isNative) return false;
  let restored = false;
  try {
    prefs = (await import('@capacitor/preferences')).Preferences;
    const { keys } = await prefs.keys();
    for (const key of keys) {
      if (!MIRRORED.test(key)) continue;
      let have: string | null = null;
      try { have = localStorage.getItem(key); } catch { /* ignore */ }
      if (have !== null) continue;
      const { value } = await prefs.get({ key });
      if (value !== null) { try { localStorage.setItem(key, value); restored = true; } catch { /* ignore */ } }
    }
    // first run after an update: mirror what localStorage already has
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (MIRRORED.test(key) && !keys.includes(key)) prefs.set({ key, value: localStorage.getItem(key)! }).catch(() => {});
    }
  } catch { prefs = null; }
  try { haptics = await import('@capacitor/haptics'); } catch { haptics = null; }
  try { const { StatusBar } = await import('@capacitor/status-bar'); await StatusBar.hide(); } catch { /* ignore */ }
  // status bar + iOS home indicator / Android navigation bar out of the way of the game
  try { await SystemBars.hide(); } catch { /* ignore */ }
  return restored;
}

/** Wires lifecycle + back button once the game exists. */
export async function attachNative(h: NativeHooks) {
  if (!isNative) return;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => { if (!h.back()) App.minimizeApp().catch(() => {}); });
    App.addListener('appStateChange', ({ isActive }) => h.background(!isActive));
  } catch { /* ignore */ }
}
