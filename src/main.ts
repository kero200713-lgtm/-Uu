import './styles.css';
import { settings } from './core/Settings';
import { bus } from './core/Events';
import { audio } from './audio/AudioEngine';
import { Game } from './Game';

settings.load();
document.documentElement.lang = settings.data.language;
const tr = settings.data.language === 'tr';
const debug = /[?&]debug\b/.test(location.search);

const hint = document.getElementById('boot-hint') as HTMLElement;
function showError(msg: string) {
  const boot = document.getElementById('boot');
  if (boot && hint) { hint.textContent = msg; hint.classList.add('err'); return; }
  if (!debug) return;
  let box = document.getElementById('errbox');
  if (!box) { box = document.createElement('div'); box.id = 'errbox'; document.body.appendChild(box); }
  box.textContent = (box.textContent ? box.textContent + '\n' : '') + msg;
}
// iPad has no developer console: surface failures on screen instead of a silent black screen
window.addEventListener('error', (e) => showError((tr ? 'Hata: ' : 'Error: ') + (e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => showError((tr ? 'Hata: ' : 'Error: ') + ((e.reason && e.reason.message) || e.reason)));

// ---- touch hygiene for iOS Safari (it ignores user-scalable=no) ----------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  const t = e.target as HTMLElement | null;
  const scrollable = t && t.closest && t.closest('.fields, .roll, .list, .paper');
  if (!scrollable || e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// audio must be (re)started from a gesture; iOS also suspends it after calls / app switches
for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, () => audio.unlock(), { passive: true });

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

let game: Game | null = null;

async function start() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const fill = document.getElementById('boot-fill') as HTMLElement;
  hint.textContent = tr ? 'Kulaklık önerilir' : 'Headphones recommended';
  if (!hasWebGL2()) {
    hint.textContent = tr ? 'Bu tarayıcı WebGL 2 desteklemiyor. iPad için iPadOS 15 veya üstü gerekir.' : 'This browser does not support WebGL 2. iPad needs iPadOS 15 or newer.';
    hint.classList.add('err');
    return;
  }
  game = new Game(canvas, ui);
  await game.boot((p) => { fill.style.transform = `scaleX(${Math.max(0.05, p)})`; });
  const boot = document.getElementById('boot')!;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 900);
}

bus.on('contextlost', () => {
  // save what we can and come back through "Continue" with a fresh context
  try { if (game?.canAutosave()) game.autosave(true); } catch { /* ignore */ }
  const msg = document.createElement('div');
  msg.id = 'ctxlost';
  msg.textContent = tr ? 'Grafik belleği sıfırlandı — oyun kaydedildi, yeniden yükleniyor…' : 'Graphics memory was reset — game saved, reloading…';
  document.body.appendChild(msg);
  setTimeout(() => location.reload(), 1800);
});

start().catch((e) => {
  console.error(e);
  showError((tr ? 'Hata: ' : 'Error: ') + (e?.message || e));
});

if ('serviceWorker' in navigator && debug) {
  // ?debug: always fetch fresh files from the server
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}
if ('serviceWorker' in navigator && import.meta.env.PROD && !debug) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // a new build took over: reload once while still on the menu so no stale assets mix in
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      if (!game || game.state === 'boot' || game.state === 'menu') { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
