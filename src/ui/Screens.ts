import { t, L } from '../core/i18n';
import { settings, SettingsData } from '../core/Settings';
import { bus } from '../core/Events';
import { audio } from '../audio/AudioEngine';
import { DOCS } from '../story/Documents';
import { ITEMS } from '../items/ItemDefs';
import { icon } from './Icons';

export function el(html: string): HTMLElement { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; }
const click = () => audio.proc?.click(1100, 0.1, 0.035);
const hover = () => audio.proc?.click(2200, 0.03, 0.02);

/** Generic full-screen panel manager. */
export class Screens {
  root: HTMLElement;
  current: string | null = null;
  private panels = new Map<string, HTMLElement>();
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div'); this.root.id = 'screens'; parent.appendChild(this.root);
  }
  show(name: string, html: HTMLElement) {
    this.hide();
    this.root.appendChild(html);
    this.panels.set(name, html);
    this.current = name;
    html.querySelectorAll('button').forEach((b) => { b.addEventListener('pointerenter', hover); b.addEventListener('click', click); });
    requestAnimationFrame(() => html.classList.add('in'));
  }
  hide() {
    for (const p of this.panels.values()) p.remove();
    this.panels.clear(); this.current = null;
  }
}

// ---------------------------------------------------------------- menus --
export function mainMenu(opts: { hasSave: boolean; onContinue: () => void; onNew: () => void; onSettings: () => void; onCredits: () => void }) {
  const h = el(`<div class="panel menu">
    <div class="menu-title"><h1 data-text="UĞULTU">UĞULTU</h1><p>${settings.data.language === 'tr' ? 'Karaçam\'da sessizlik yalan söyler.' : 'In Karaçam, the silence lies.'}</p></div>
    <nav>
      <button class="mi" data-k="cont" ${opts.hasSave ? '' : 'disabled'}>${t('continue')}</button>
      <button class="mi" data-k="new">${t('newGame')}</button>
      <button class="mi" data-k="set">${t('settings')}</button>
      <button class="mi" data-k="cred">${t('credits')}</button>
    </nav>
    <div class="menu-foot">v1.0 · ${settings.data.language === 'tr' ? 'Kulaklık önerilir' : 'Headphones recommended'}</div>
  </div>`);
  h.querySelector('[data-k=cont]')!.addEventListener('click', opts.onContinue);
  h.querySelector('[data-k=new]')!.addEventListener('click', opts.onNew);
  h.querySelector('[data-k=set]')!.addEventListener('click', opts.onSettings);
  h.querySelector('[data-k=cred]')!.addEventListener('click', opts.onCredits);
  return h;
}

export function pauseMenu(opts: { objective: string; onResume: () => void; onSettings: () => void; onQuit: () => void; onFiles: () => void }) {
  const h = el(`<div class="panel pause">
    <h2>${settings.data.language === 'tr' ? 'DURAKLATILDI' : 'PAUSED'}</h2>
    <div class="obj"><small>${t('objective')}</small><span>${opts.objective}</span></div>
    <nav>
      <button class="mi" data-k="res">${t('resume')}</button>
      <button class="mi" data-k="files">${t('files')}</button>
      <button class="mi" data-k="set">${t('settings')}</button>
      <button class="mi" data-k="quit">${t('quit')}</button>
    </nav></div>`);
  h.querySelector('[data-k=res]')!.addEventListener('click', opts.onResume);
  h.querySelector('[data-k=files]')!.addEventListener('click', opts.onFiles);
  h.querySelector('[data-k=set]')!.addEventListener('click', opts.onSettings);
  h.querySelector('[data-k=quit]')!.addEventListener('click', opts.onQuit);
  return h;
}

type Field = { k: keyof SettingsData; type: 'range' | 'toggle' | 'choice'; min?: number; max?: number; step?: number; choices?: [string, string][] };
const TABS: Record<string, Field[]> = {
  graphics: [
    { k: 'quality', type: 'choice', choices: [['auto', 'q_auto'], ['low', 'q_low'], ['medium', 'q_medium'], ['high', 'q_high']] },
    { k: 'renderScale', type: 'range', min: 0.5, max: 1, step: 0.05 },
    { k: 'dynamicResolution', type: 'toggle' }, { k: 'showFps', type: 'toggle' },
  ],
  audio: [
    { k: 'master', type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'music', type: 'range', min: 0, max: 1, step: 0.05 },
    { k: 'sfx', type: 'range', min: 0, max: 1, step: 0.05 }, { k: 'ambience', type: 'range', min: 0, max: 1, step: 0.05 },
  ],
  controls: [
    { k: 'sensX', type: 'range', min: 0.3, max: 2.5, step: 0.05 }, { k: 'sensY', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
    { k: 'invertY', type: 'toggle' }, { k: 'aimAssist', type: 'toggle' }, { k: 'aimToggle', type: 'toggle' },
    { k: 'joystickSize', type: 'range', min: 0.7, max: 1.4, step: 0.05 }, { k: 'controlsOpacity', type: 'range', min: 0.3, max: 1, step: 0.05 },
    { k: 'leftHanded', type: 'toggle' }, { k: 'vibration', type: 'toggle' },
  ],
  language: [{ k: 'language', type: 'choice', choices: [['tr', 'Türkçe'], ['en', 'English']] }],
  access: [
    { k: 'subtitles', type: 'toggle' }, { k: 'screenShake', type: 'range', min: 0, max: 1, step: 0.1 },
    { k: 'reduceFlashing', type: 'toggle' }, { k: 'textScale', type: 'range', min: 0.85, max: 1.4, step: 0.05 },
  ],
};

export function settingsPanel(onBack: () => void, tab = 'graphics'): HTMLElement {
  const tabs = Object.keys(TABS);
  const h = el(`<div class="panel settings"><h2>${t('settings')}</h2>
    <div class="tabs">${tabs.map((k) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${t(k)}</button>`).join('')}</div>
    <div class="fields"></div>
    <div class="row-btns"><button class="mi small" data-k="reset">${t('reset')}</button><button class="mi small" data-k="back">${t('back')}</button></div></div>`);
  const fields = h.querySelector('.fields') as HTMLElement;
  const render = (tb: string) => {
    fields.innerHTML = '';
    for (const f of TABS[tb]) {
      const v = settings.data[f.k] as any;
      let ctl = '';
      if (f.type === 'range') ctl = `<input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"><output>${fmt(v)}</output>`;
      else if (f.type === 'toggle') ctl = `<button class="tog ${v ? 'on' : ''}"><i></i></button>`;
      else ctl = `<div class="choices">${f.choices!.map(([val, lbl]) => `<button class="ch ${v === val ? 'on' : ''}" data-v="${val}">${t(lbl)}</button>`).join('')}</div>`;
      const row = el(`<div class="field"><label>${t(f.k)}</label><div class="ctl">${ctl}</div></div>`);
      if (f.type === 'range') {
        const inp = row.querySelector('input') as HTMLInputElement, out = row.querySelector('output') as HTMLElement;
        inp.addEventListener('input', () => { const n = parseFloat(inp.value); out.textContent = fmt(n); settings.set(f.k, n as any); });
      } else if (f.type === 'toggle') {
        const b = row.querySelector('.tog') as HTMLElement;
        b.addEventListener('click', () => { const nv = !settings.data[f.k]; settings.set(f.k, nv as any); b.classList.toggle('on', nv); click(); });
      } else {
        row.querySelectorAll<HTMLElement>('.ch').forEach((b) => b.addEventListener('click', () => {
          settings.set(f.k, b.dataset.v as any); click();
          if (f.k === 'language') { bus.emit('language'); return; }
          row.querySelectorAll('.ch').forEach((x) => x.classList.toggle('on', x === b));
        }));
      }
      fields.appendChild(row);
    }
  };
  render(tab);
  h.querySelectorAll<HTMLElement>('.tab').forEach((b) => b.addEventListener('click', () => { h.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b)); render(b.dataset.t!); click(); }));
  h.querySelector('[data-k=back]')!.addEventListener('click', onBack);
  h.querySelector('[data-k=reset]')!.addEventListener('click', () => { settings.reset(); render((h.querySelector('.tab.on') as HTMLElement).dataset.t!); });
  return h;
}
const fmt = (n: number) => (Math.abs(n) <= 2.5 && n % 1 !== 0 ? n.toFixed(2) : String(n));

export function creditsPanel(onBack: () => void, ending = false) {
  const tr = settings.data.language === 'tr';
  const h = el(`<div class="panel credits ${ending ? 'ending' : ''}"><div class="roll">
    ${ending ? `<h1>UĞULTU</h1><p class="end">${t('end')}</p>` : `<h2>${t('credits')}</h2>`}
    <section><h3>${tr ? 'Oyun' : 'Game'}</h3><p>${t('credits_text')}</p></section>
    <section><h3>${t('licenses')}</h3>
      <p><b>Barlow Condensed</b> — © 2017 The Barlow Project Authors. SIL Open Font License 1.1.</p>
      <p><b>Caveat</b> — © 2014 The Caveat Project Authors. SIL Open Font License 1.1.</p>
      <p><b>Special Elite</b> — © Astigmatic (Brian J. Bonislawsky). Apache License 2.0.</p>
      <p><b>three.js</b> — © 2010–2024 three.js authors. MIT License.</p>
      <p><b>meshoptimizer</b> — © 2016–2024 Arseny Kapoulkine. MIT License.</p>
      <p class="small"><a href="./licenses.txt" target="_blank" rel="noopener">${tr ? 'Lisans metinlerinin tamamı' : 'Full licence texts'}</a></p>
    </section>
    ${ending ? `<p class="thanks">${t('thanks')}</p>` : ''}
  </div><button class="mi small back" data-k="back">${t('back')}</button></div>`);
  h.querySelector('[data-k=back]')!.addEventListener('click', onBack);
  return h;
}

export function deathScreen(onRetry: () => void, onQuit: () => void) {
  const h = el(`<div class="panel death"><h1>${t('died')}</h1><nav>
    <button class="mi" data-k="retry">${t('retry')}</button><button class="mi" data-k="quit">${t('quit')}</button></nav></div>`);
  h.querySelector('[data-k=retry]')!.addEventListener('click', onRetry);
  h.querySelector('[data-k=quit]')!.addEventListener('click', onQuit);
  return h;
}

export function dialog(text: string, onYes: () => void, onNo: () => void, yes = t('yes'), no = t('no')) {
  const h = el(`<div class="panel dialog"><div class="box"><p>${text}</p><div class="row-btns"><button class="mi small" data-k="no">${no}</button><button class="mi small primary" data-k="yes">${yes}</button></div></div></div>`);
  h.querySelector('[data-k=yes]')!.addEventListener('click', onYes);
  h.querySelector('[data-k=no]')!.addEventListener('click', onNo);
  return h;
}

export function loadingScreen(title: string, sub: string, tip: string) {
  return el(`<div class="panel loading"><div class="ld"><h2>${title}</h2><p>${sub}</p><div class="bar"><i></i></div><small class="tip">${tip}</small></div></div>`);
}

// ------------------------------------------------------------ documents --
export function documentView(docId: string, onClose: () => void) {
  const d = DOCS[docId];
  const h = el(`<div class="panel doc"><div class="paper ${d?.style || 'type'}"><h3>${d ? L(d.title) : docId}</h3><div class="body"></div></div>
    <button class="mi small close" data-k="close">${t('close')}</button></div>`);
  const body = h.querySelector('.body') as HTMLElement;
  body.textContent = d ? L(d.body) : '';
  body.innerHTML = body.innerHTML.replace(/\n/g, '<br>');
  h.querySelector('[data-k=close]')!.addEventListener('click', onClose);
  return h;
}

export function filesList(read: string[], onOpen: (id: string) => void, onBack: () => void) {
  const h = el(`<div class="panel files"><h2>${t('files')}</h2><div class="list">
    ${read.length ? read.map((id) => `<button class="file" data-id="${id}">${icon(DOCS[id]?.style === 'tape' ? 'tape' : 'doc', 20)}<span>${L(DOCS[id]?.title)}</span></button>`).join('') : `<p class="muted">—</p>`}
  </div><button class="mi small" data-k="back">${t('back')}</button></div>`);
  h.querySelectorAll<HTMLElement>('.file').forEach((b) => b.addEventListener('click', () => onOpen(b.dataset.id!)));
  h.querySelector('[data-k=back]')!.addEventListener('click', onBack);
  return h;
}

/** 4-digit keypad (survival-horror code lock). */
export function keypad(onSubmit: (code: string) => boolean, onClose: () => void) {
  const h = el(`<div class="panel dialog keypad"><div class="box">
    <div class="kp-display">----</div>
    <div class="kp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((k) => `<button class="kp" data-k="${k}">${k}</button>`).join('')}</div>
    <button class="mi small" data-k="close">${t('close')}</button></div></div>`);
  let code = '';
  const disp = h.querySelector('.kp-display') as HTMLElement;
  const render = () => { disp.textContent = (code + '----').slice(0, 4); };
  h.querySelectorAll<HTMLElement>('.kp').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k!;
    audio.proc?.click(k === 'OK' ? 900 : 1600, 0.1, 0.05);
    if (k === 'C') code = '';
    else if (k === 'OK') {
      if (onSubmit(code)) { disp.classList.add('ok'); disp.textContent = 'OK'; }
      else { disp.classList.add('bad'); audio.proc?.click(160, 0.2, 0.25); setTimeout(() => { disp.classList.remove('bad'); code = ''; render(); }, 600); }
      return;
    } else if (code.length < 4) code += k;
    render();
  }));
  h.querySelector('[data-k=close]')!.addEventListener('click', onClose);
  return h;
}

/** Ending/epilogue text card. */
export function epilogue(lines: string[], onDone: () => void) {
  const h = el(`<div class="panel epilogue"><div class="ep-lines"></div></div>`);
  const box = h.querySelector('.ep-lines') as HTMLElement;
  let i = 0;
  const next = () => {
    if (i >= lines.length) { setTimeout(onDone, 2500); return; }
    const p = document.createElement('p'); p.innerHTML = lines[i++]; box.appendChild(p);
    requestAnimationFrame(() => p.classList.add('in'));
    setTimeout(next, 3400);
  };
  setTimeout(next, 800);
  return h;
}

export { ITEMS };
