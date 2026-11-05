import { settings } from './Settings';
import { bus } from './Events';

export type Action = 'fire' | 'aim' | 'interact' | 'reload' | 'crouch' | 'run' | 'flashlight' | 'inventory' | 'pause' | 'switch' | 'heal' | 'flare' | 'guard' | 'dodge';

/**
 * Unified input state. Touch controls, keyboard/mouse and gamepads all write
 * into the same structure, gameplay code only reads it.
 */
class InputState {
  move = { x: 0, y: 0 };        // -1..1, y = forward
  look = { x: 0, y: 0 };        // accumulated look delta in "pixels" this frame
  held = new Set<Action>();
  pressed = new Set<Action>();  // edge-triggered this frame
  aimToggled = false;           // toggle-aim state (mobile)
  runToggled = false;
  crouchToggled = false;
  touchActive = false;
  pointerLocked = false;
  private keys = new Set<string>();
  enabled = true;

  press(a: Action) { this.pressed.add(a); this.held.add(a); bus.emit('input:' + a); }
  release(a: Action) { this.held.delete(a); }
  isDown(a: Action) { return this.held.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }

  get aiming() {
    return settings.data.aimToggle && this.touchActive ? this.aimToggled : (this.held.has('aim') || this.aimToggled);
  }
  get running() { return this.held.has('run') || this.runToggled; }

  endFrame() {
    this.pressed.clear();
    this.look.x = 0; this.look.y = 0;
  }

  reset() {
    this.move.x = this.move.y = 0; this.held.clear(); this.pressed.clear();
    this.aimToggled = false; this.runToggled = false;
  }

  attachKeyboardMouse(canvas: HTMLCanvasElement) {
    const map: Record<string, Action> = {
      KeyE: 'interact', KeyF: 'interact', KeyR: 'reload', KeyC: 'crouch', ControlLeft: 'crouch', ShiftLeft: 'run',
      KeyL: 'flashlight', KeyT: 'flashlight', Tab: 'inventory', KeyI: 'inventory', Escape: 'pause', KeyP: 'pause', KeyQ: 'switch', KeyH: 'heal', KeyG: 'flare', KeyV: 'guard', Space: 'dodge', AltLeft: 'dodge',
    };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = map[e.code];
      if (a) { e.preventDefault(); this.press(a); if (a === 'crouch') this.crouchToggled = !this.crouchToggled; }
      this.touchActive = false;
      this.updateKeyMove();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = map[e.code];
      if (a) this.release(a);
      this.updateKeyMove();
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.reset(); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.touchActive) return;
      if (!this.pointerLocked && this.enabled) { canvas.requestPointerLock?.(); }
      if (e.button === 0) this.press('fire');
      if (e.button === 2) this.press('aim');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release('fire');
      if (e.button === 2) this.release('aim');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.look.x += e.movementX * 0.9;
      this.look.y += e.movementY * 0.9;
    });
  }

  private updateKeyMove() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    this.move.x = x / l; this.move.y = y / l;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[0];
    if (!p) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const mx = dz(p.axes[0]), my = dz(p.axes[1]);
    if (mx || my) { this.move.x = mx; this.move.y = -my; this.touchActive = false; }
    const lx = dz(p.axes[2]), ly = dz(p.axes[3]);
    this.look.x += lx * 14; this.look.y += ly * 14;
    const btn = (i: number) => p.buttons[i] && p.buttons[i].pressed;
    const pairs: [number, Action][] = [[7, 'fire'], [6, 'aim'], [0, 'interact'], [2, 'reload'], [1, 'crouch'], [10, 'run'], [3, 'switch'], [9, 'pause'], [8, 'inventory'], [12, 'flashlight'], [4, 'guard'], [5, 'dodge']];
    for (const [i, a] of pairs) {
      const down = btn(i);
      if (down && !this.held.has(a)) { this.press(a); if (a === 'crouch') this.crouchToggled = !this.crouchToggled; }
      else if (!down && this.held.has(a) && (this as any)['_gp_' + a]) this.release(a);
      (this as any)['_gp_' + a] = down;
    }
  }
}

export const input = new InputState();
