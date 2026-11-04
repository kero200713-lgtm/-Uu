import './styles.css';
import { settings } from './core/Settings';
import { Game } from './Game';

settings.load();
document.documentElement.lang = settings.data.language;

async function start() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const fill = document.getElementById('boot-fill') as HTMLElement;
  const hint = document.getElementById('boot-hint') as HTMLElement;
  hint.textContent = settings.data.language === 'tr' ? 'Kulaklık önerilir' : 'Headphones recommended';
  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL unavailable');
  } catch (e) {
    hint.textContent = settings.data.language === 'tr' ? 'Bu cihaz WebGL desteklemiyor.' : 'This device does not support WebGL.';
    return;
  }
  const game = new Game(canvas, ui);
  await game.boot((p) => { fill.style.transform = `scaleX(${Math.max(0.05, p)})`; });
  const boot = document.getElementById('boot')!;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 900);
}

start().catch((e) => {
  console.error(e);
  const hint = document.getElementById('boot-hint');
  if (hint) hint.textContent = 'Error: ' + (e?.message || e);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
