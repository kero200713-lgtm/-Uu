import { bus } from '../core/Events';
import { t } from '../core/i18n';
import { icon } from './Icons';
import { settings } from '../core/Settings';

/**
 * Minimal diegetic-feeling HUD: a small ECG health glyph, flashlight charge,
 * ammo, a crosshair only while aiming, toasts, subtitles and objectives.
 */
export class HUD {
  root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private toastQ: { text: string; ttl: number; icon?: string }[] = [];
  private subT = 0; private objT = 0; private titleT = 0; private hitT = 0;
  damage = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hp"><span class="ecg">${icon('heart', 26, 2)}</span><div class="hp-txt"></div><div class="hp-bar"><i></i></div></div>
        <div class="bat">${icon('battery', 18)}<div class="bat-bar"><i></i></div></div>
      </div>
      <div class="hud-ammo"><span class="w"></span><b class="mag"></b><span class="res"></span></div>
      <div class="stamina"><i></i></div>
      <div class="crosshair"><i class="c-dot"></i><i class="c t"></i><i class="c b"></i><i class="c l"></i><i class="c r"></i><i class="hitm"></i></div>
      <div class="prompt"></div>
      <div class="toasts"></div>
      <div class="objective"><small></small><span></span></div>
      <div class="area-title"><h1></h1><h2></h2></div>
      <div class="subtitle"></div>
      <div class="struggle"><b></b><div class="sbar"><i></i></div></div>
      <div class="dmg-overlay"></div>
      <div class="fade"></div>
      <div class="fps"></div>
      <div class="hint"></div>`;
    parent.appendChild(this.root);
    for (const k of ['hp', 'hp-txt', 'hp-bar', 'bat', 'bat-bar', 'hud-ammo', 'stamina', 'crosshair', 'prompt', 'toasts', 'objective', 'area-title', 'subtitle', 'struggle', 'dmg-overlay', 'fade', 'fps', 'hint', 'hitm'])
      this.els[k] = this.root.querySelector('.' + k) as HTMLElement;
    bus.on('toast', (text: string, ic?: string) => this.toast(text, ic));
    bus.on('hitmarker', (killed: boolean, head: boolean) => { this.hitT = 0.18; this.els.hitm.className = 'hitm on' + (killed ? ' kill' : '') + (head ? ' head' : ''); });
    bus.on('settings', () => this.applyScale());
    this.applyScale();
  }

  applyScale() { document.documentElement.style.setProperty('--text-scale', String(settings.data.textScale)); }

  show(v: boolean) { this.root.classList.toggle('off', !v); }

  setHealth(hp: number, max: number) {
    const k = hp / max;
    const cls = k > 0.6 ? 'fine' : k > 0.3 ? 'caution' : 'danger';
    const el = this.els.hp;
    if (el.dataset.c !== cls) { el.dataset.c = cls; this.els['hp-txt'].textContent = t('h_' + cls); }
    (this.els['hp-bar'].firstElementChild as HTMLElement).style.transform = `scaleX(${Math.max(0, k)})`;
  }

  setBattery(b: number, on: boolean) {
    (this.els['bat-bar'].firstElementChild as HTMLElement).style.transform = `scaleX(${b})`;
    this.els.bat.classList.toggle('low', b < 0.2); this.els.bat.classList.toggle('off', !on);
  }

  setAmmo(weaponName: string, mag: number | null, reserve: number | null) {
    const el = this.els['hud-ammo'];
    (el.querySelector('.w') as HTMLElement).textContent = weaponName;
    (el.querySelector('.mag') as HTMLElement).textContent = mag === null ? '' : String(mag);
    (el.querySelector('.res') as HTMLElement).textContent = reserve === null ? '' : '/ ' + reserve;
    el.classList.toggle('empty', mag === 0);
  }

  setStamina(s: number, visible: boolean) {
    this.els.stamina.classList.toggle('on', visible);
    (this.els.stamina.firstElementChild as HTMLElement).style.transform = `scaleX(${s / 100})`;
  }

  setCrosshair(on: boolean, spread: number) {
    this.els.crosshair.classList.toggle('on', on);
    this.els.crosshair.style.setProperty('--spread', `${8 + spread * 380}px`);
  }

  setPrompt(text: string | null) {
    const p = this.els.prompt;
    if (!text) { p.classList.remove('on'); return; }
    if (p.textContent !== text) p.innerHTML = `<kbd>E</kbd> ${text}`;
    p.classList.add('on');
  }

  toast(text: string, ic?: string) {
    this.toastQ.push({ text, ttl: 2.6, icon: ic });
    if (this.toastQ.length > 3) this.toastQ.shift();
    this.renderToasts();
  }
  private renderToasts() {
    this.els.toasts.innerHTML = this.toastQ.map((q) => `<div class="toast">${q.icon ? icon(q.icon, 18) : ''}<span>${q.text}</span></div>`).join('');
  }

  subtitle(text: string, dur = 4) {
    if (!settings.data.subtitles && dur < 99) return;
    this.els.subtitle.innerHTML = text; this.els.subtitle.classList.add('on'); this.subT = dur;
  }

  objective(text: string, show = true) {
    const o = this.els.objective;
    (o.querySelector('small') as HTMLElement).textContent = t('objective');
    (o.querySelector('span') as HTMLElement).textContent = text;
    if (show) { o.classList.add('on'); this.objT = 5; }
  }

  areaTitle(title: string, sub: string) {
    const a = this.els['area-title'];
    (a.querySelector('h1') as HTMLElement).textContent = title;
    (a.querySelector('h2') as HTMLElement).textContent = sub;
    a.classList.add('on'); this.titleT = 4.2;
  }

  hint(text: string, dur = 6) { const h = this.els.hint; h.textContent = text; h.classList.add('on'); (h as any)._t = dur; }

  struggle(on: boolean, v = 1, knife = false) {
    const s = this.els.struggle;
    s.classList.toggle('on', on);
    (s.querySelector('b') as HTMLElement).textContent = knife ? '' : t('tap');
    (s.querySelector('.sbar i') as HTMLElement).style.transform = `scaleX(${v})`;
  }

  /** Clears transient text when changing areas. */
  clearTransient() { this.subT = 0; this.els.subtitle.classList.remove('on'); (this.els.hint as any)._t = 0; this.els.hint.classList.remove('on'); this.toastQ = []; this.renderToasts(); }

  fade(v: number) { this.els.fade.style.opacity = String(v); }
  setDamageOverlay(v: number) { this.els['dmg-overlay'].style.opacity = String(v); }
  setFps(f: number | null) { this.els.fps.textContent = f === null ? '' : `${Math.round(f)} FPS`; }

  update(dt: number) {
    let changed = false;
    for (const q of this.toastQ) q.ttl -= dt;
    const before = this.toastQ.length;
    this.toastQ = this.toastQ.filter((q) => q.ttl > 0);
    if (this.toastQ.length !== before) changed = true;
    if (changed) this.renderToasts();
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.els.subtitle.classList.remove('on'); }
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) this.els.objective.classList.remove('on'); }
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.els['area-title'].classList.remove('on'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.els.hitm.className = 'hitm'; }
    const h = this.els.hint as any; if (h._t > 0) { h._t -= dt; if (h._t <= 0) h.classList.remove('on'); }
  }
}
