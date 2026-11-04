import { input, Action } from '../core/Input';
import { settings } from '../core/Settings';
import { bus } from '../core/Events';
import { icon } from './Icons';
import { audio } from '../audio/AudioEngine';
import { vibrate } from '../platform/Native';

interface Btn { el: HTMLElement; action: Action; toggle?: boolean }

/**
 * Mobile controls: a floating joystick on the left half (push to the rim to
 * run), camera drag on the right half, and a small set of large contextual
 * buttons. Multi-touch via Pointer Events; layout mirrors for left-handers.
 */
export class TouchControls {
  root: HTMLElement;
  private joyBase: HTMLElement; private joyKnob: HTMLElement; private joyRing: HTMLElement;
  private joyId = -1; private joyOrigin = { x: 0, y: 0 };
  private lookIds = new Map<number, { x: number; y: number }>();
  btns: Record<string, Btn> = {};
  visible = false;
  enabled = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="zone-left"></div><div class="zone-right"></div>
      <div class="joy"><div class="joy-ring"></div><div class="joy-knob"></div></div>
      <div class="tb tb-fire" data-a="fire">${icon('fire', 34)}</div>
      <div class="tb tb-aim" data-a="aim">${icon('aim', 30)}</div>
      <div class="tb tb-interact" data-a="interact">${icon('hand', 30)}<span class="lbl"></span></div>
      <div class="tb tb-reload" data-a="reload">${icon('reload', 24)}</div>
      <div class="tb tb-crouch" data-a="crouch">${icon('crouch', 26)}</div>
      <div class="tb tb-heal" data-a="heal">${icon('medkit', 24)}</div>
      <div class="tb small tb-switch" data-a="switch"><span class="wicon"></span></div>
      <div class="tb small tb-flash" data-a="flashlight">${icon('flash', 22)}</div>
      <div class="tb small tb-inv" data-a="inventory">${icon('bag', 22)}</div>
      <div class="tb small tb-pause" data-a="pause">${icon('pause', 22)}</div>`;
    parent.appendChild(this.root);
    this.joyBase = this.root.querySelector('.joy') as HTMLElement;
    this.joyKnob = this.root.querySelector('.joy-knob') as HTMLElement;
    this.joyRing = this.root.querySelector('.joy-ring') as HTMLElement;
    this.root.querySelectorAll<HTMLElement>('.tb').forEach((el) => {
      const a = el.dataset.a as Action;
      const b: Btn = { el, action: a, toggle: a === 'crouch' };
      this.btns[a] = b;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!this.enabled) return;
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        input.touchActive = true;
        audio.unlock();
        if (a === 'aim') { input.aimToggled = settings.data.aimToggle ? !input.aimToggled : true; input.press('aim'); }
        else if (a === 'fire') {
          // quick-shot: tapping fire with a firearm while not aiming raises the weapon first
          bus.emit('touch:fire');
          input.press('fire');
        } else if (a === 'crouch') { input.press('crouch'); }
        else input.press(a);
        if (settings.data.vibration) vibrate(8);
      });
      const up = (e: PointerEvent) => {
        el.classList.remove('down');
        if (a === 'aim' && !settings.data.aimToggle) { input.aimToggled = false; }
        input.release(a);
      };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    const left = this.root.querySelector('.zone-left') as HTMLElement;
    const right = this.root.querySelector('.zone-right') as HTMLElement;
    left.addEventListener('pointerdown', (e) => this.joyStart(e));
    right.addEventListener('pointerdown', (e) => this.lookStart(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.end(e));
    window.addEventListener('pointercancel', (e) => this.end(e));
    bus.on('settings', () => this.layout());
    this.layout();
    this.show(false);
  }

  layout() {
    const s = settings.data;
    this.root.classList.toggle('lefty', s.leftHanded);
    this.root.style.setProperty('--joy', `${Math.round(130 * s.joystickSize)}px`);
    this.root.style.setProperty('--ctl-op', String(s.controlsOpacity));
  }

  show(v: boolean) { this.visible = v; this.root.style.display = v ? '' : 'none'; document.body.classList.toggle('touch', v); if (!v) this.resetSticks(); }

  resetSticks() {
    this.joyId = -1; this.lookIds.clear(); input.move.x = input.move.y = 0;
    this.joyBase.classList.remove('active');
  }

  private joyStart(e: PointerEvent) {
    if (!this.enabled || this.joyId !== -1) return;
    e.preventDefault();
    input.touchActive = true; audio.unlock();
    this.joyId = e.pointerId;
    const R = this.radius();
    const x = Math.max(R + 12, Math.min(window.innerWidth - R - 12, e.clientX));
    const y = Math.max(R + 12, Math.min(window.innerHeight - R - 12, e.clientY));
    this.joyOrigin = { x, y };
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyBase.classList.add('active');
    this.updateKnob(e.clientX, e.clientY);
  }

  private radius() { return 62 * settings.data.joystickSize; }

  private updateKnob(x: number, y: number) {
    const R = this.radius();
    let dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mx = dx / R, my = -dy / R;
    // small dead zone, then analog
    const m = Math.hypot(mx, my);
    const k = m < 0.12 ? 0 : (m - 0.12) / 0.88 / (m || 1);
    input.move.x = mx * k; input.move.y = my * k;
    this.joyRing.classList.toggle('run', m > 0.97);
  }

  private lookStart(e: PointerEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    input.touchActive = true; audio.unlock();
    this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.joyId) { e.preventDefault(); this.updateKnob(e.clientX, e.clientY); return; }
    const l = this.lookIds.get(e.pointerId);
    if (l) {
      e.preventDefault();
      const scale = 1.25 * (window.devicePixelRatio > 2 ? 1.1 : 1);
      input.look.x += (e.clientX - l.x) * scale;
      input.look.y += (e.clientY - l.y) * scale;
      l.x = e.clientX; l.y = e.clientY;
    }
  }

  private end(e: PointerEvent) {
    if (e.pointerId === this.joyId) {
      this.joyId = -1; input.move.x = input.move.y = 0;
      this.joyKnob.style.transform = 'translate(0px,0px)';
      this.joyBase.classList.remove('active');
      this.joyRing.classList.remove('run');
    }
    this.lookIds.delete(e.pointerId);
  }

  /** Context: which buttons are relevant right now. */
  update(ctx: { firearm: boolean; aiming: boolean; interact: string | null; canReload: boolean; crouching: boolean; healAvail: boolean; weaponIcon: string; flashOn: boolean; grabbed: boolean }) {
    if (!this.visible) return;
    const set = (k: string, v: boolean) => this.btns[k]?.el.classList.toggle('hidden', !v);
    set('aim', ctx.firearm && !ctx.grabbed);
    set('reload', ctx.canReload && !ctx.grabbed);
    set('interact', !!ctx.interact || ctx.grabbed);
    set('heal', ctx.healAvail && !ctx.grabbed);
    set('crouch', !ctx.grabbed);
    this.btns.aim?.el.classList.toggle('on', ctx.aiming);
    this.btns.crouch?.el.classList.toggle('on', ctx.crouching);
    this.btns.flashlight?.el.classList.toggle('on', ctx.flashOn);
    const lbl = this.btns.interact?.el.querySelector('.lbl') as HTMLElement;
    if (lbl) lbl.textContent = ctx.grabbed ? '' : ctx.interact || '';
    const w = this.btns.switch?.el.querySelector('.wicon') as HTMLElement;
    if (w && w.dataset.i !== ctx.weaponIcon) { w.dataset.i = ctx.weaponIcon; w.innerHTML = icon(ctx.weaponIcon, 24); }
  }
}
