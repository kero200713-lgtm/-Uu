import * as THREE from 'three';
import { settings } from '../core/Settings';
import { bus } from '../core/Events';
import { Procedural } from './Procedural';

export interface PlayOpts {
  pos?: THREE.Vector3; volume?: number; rate?: number; vary?: number; loop?: boolean; bus?: 'sfx' | 'amb' | 'ui' | 'music';
  ref?: number; max?: number; delay?: number; occlude?: boolean; priority?: number;
}

export interface Voice {
  src: AudioBufferSourceNode; gain: GainNode; panner: PannerNode | null; filter: BiquadFilterNode | null;
  pos: THREE.Vector3 | null; started: number; priority: number; ended: boolean; loop: boolean;
  stop(fade?: number): void; setVolume(v: number, t?: number): void;
}

const BASE = './assets/audio/';
const MUSIC_TRACKS = ['mus_menu', 'mus_safe', 'mus_chase', 'mus_boss', 'mus_ending'];

/**
 * Web Audio engine: buses, sprite playback with random variations, 3D
 * panning, occlusion low-pass (sound behind walls is muffled), voice limit,
 * streaming music with crossfades, and procedural ambience beds.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; amb!: GainNode; ui!: GainNode; music!: GainNode; comp!: DynamicsCompressorNode;
  sprite: AudioBuffer | null = null;
  map: Record<string, [number, number]> = {};
  loops = new Map<string, AudioBuffer>();
  voices: Voice[] = [];
  maxVoices = 26;
  occluder: ((a: THREE.Vector3, b: THREE.Vector3) => boolean) | null = null;
  listener = new THREE.Vector3();
  proc: Procedural | null = null;
  private primed = false;
  private lastVar = new Map<string, string>();
  private musicEls = new Map<string, { el: HTMLAudioElement; node: MediaElementAudioSourceNode | null; gain: GainNode | null }>();
  musicName: string | null = null;
  private variants = new Map<string, string[]>();
  ready = false;
  hrtf = true;

  async init() {
    if (this.ctx) return;
    const AC: any = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx!;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(c.destination);
    this.sfx = c.createGain(); this.amb = c.createGain(); this.ui = c.createGain(); this.music = c.createGain();
    for (const b of [this.sfx, this.amb, this.ui, this.music]) b.connect(this.master);
    this.applyVolumes();
    bus.on('settings', () => this.applyVolumes());
    this.proc = new Procedural(c, this.amb, this.ui);
    try {
      const [meta, buf] = await Promise.all([
        fetch(BASE + 'audio.json').then((r) => r.json()),
        fetch(BASE + 'sfx.mp3').then((r) => r.arrayBuffer()),
      ]);
      this.map = meta.sprite;
      for (const k of Object.keys(this.map)) {
        const m = k.match(/^(.*?)(\d+)$/);
        if (m) { const l = this.variants.get(m[1]) || []; l.push(k); this.variants.set(m[1], l); }
      }
      this.sprite = await c.decodeAudioData(buf);
      await Promise.all(meta.loops.map(async (n: string) => {
        const ab = await fetch(BASE + n + '.mp3').then((r) => r.arrayBuffer());
        this.loops.set(n, await c.decodeAudioData(ab));
      }));
      this.ready = true;
    } catch (e) {
      console.warn('audio load failed', e);
    }
  }

  /**
   * Must be called from a user gesture on iOS/Android. Safe to call on every
   * tap: it only does work while the context is not running (iOS also reports
   * 'interrupted' after calls/app switches) or music has not been primed yet.
   */
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
      const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    }
    // iOS Safari only lets a media element start later (outside a gesture) if it
    // was first started inside one, so every music track is primed muted here.
    if (!this.primed) {
      this.primed = true;
      for (const n of MUSIC_TRACKS) {
        if (n === this.musicName) continue;
        const m = this.musicEl(n, n !== 'mus_ending');
        m.el.muted = true;
        m.el.play().then(() => { if (this.musicName !== n) { m.el.pause(); m.el.currentTime = 0; } m.el.muted = false; }).catch(() => { m.el.muted = false; });
      }
    }
    const cur = this.musicName ? this.musicEls.get(this.musicName) : null;
    if (cur && cur.el.paused && (cur.el.loop || cur.el.currentTime === 0)) cur.el.play().catch(() => {});
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = settings.data, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambience, t, 0.05);
    this.ui.gain.setTargetAtTime(s.sfx * 0.8, t, 0.05);
    this.music.gain.setTargetAtTime(s.music, t, 0.05);
  }

  suspend(on: boolean) { if (!this.ctx) return; if (on) this.ctx.suspend(); else this.ctx.resume(); }

  setListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener as any;
    const p = cam.position; this.listener.copy(p);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }

  has(name: string) { return !!this.map[name] || this.variants.has(name) || this.loops.has(name); }

  play(name: string, o: PlayOpts = {}): Voice | null {
    const c = this.ctx;
    if (!c || !this.ready || c.state !== 'running') return null;
    let key = name;
    const vars = this.variants.get(name);
    if (!this.map[key] && vars) {
      // never the same variant twice in a row (footsteps sounded like one sample looping)
      let k = Math.floor(Math.random() * vars.length);
      if (vars.length > 1 && vars[k] === this.lastVar.get(name)) k = (k + 1 + Math.floor(Math.random() * (vars.length - 1))) % vars.length;
      key = vars[k]; this.lastVar.set(name, key);
    }
    const loopBuf = this.loops.get(name);
    const seg = this.map[key];
    if (!seg && !loopBuf) return null;
    if (o.pos && !o.loop && o.pos.distanceTo(this.listener) > (o.max ?? 45)) return null;
    // voice stealing
    this.voices = this.voices.filter((v) => !v.ended);
    if (this.voices.length >= this.maxVoices) {
      const victim = this.voices.filter((v) => !v.loop).sort((a, b) => a.priority - b.priority || a.started - b.started)[0];
      if (victim && (victim.priority <= (o.priority ?? 1))) victim.stop(0.03); else return null;
    }
    const src = c.createBufferSource();
    src.buffer = loopBuf || this.sprite;
    const vary = o.vary ?? 0.06;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const gain = c.createGain();
    const vol = (o.volume ?? 1) * (1 + (Math.random() * 2 - 1) * vary * 1.2);
    gain.gain.value = vol;
    let node: AudioNode = src;
    let filter: BiquadFilterNode | null = null;
    let panner: PannerNode | null = null;
    if (o.pos) {
      filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.5;
      node.connect(filter); node = filter;
      panner = c.createPanner();
      panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse'; panner.refDistance = o.ref ?? 2; panner.maxDistance = o.max ?? 45; panner.rolloffFactor = 1.1;
      const p = o.pos;
      if ((panner as any).positionX) { panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z; } else (panner as any).setPosition(p.x, p.y, p.z);
      node.connect(panner); node = panner;
      if (o.occlude !== false && this.occluder && this.occluder(this.listener, p)) { filter.frequency.value = 900; gain.gain.value = vol * 0.55; }
    }
    node.connect(gain);
    const busNode = o.bus === 'amb' ? this.amb : o.bus === 'ui' ? this.ui : o.bus === 'music' ? this.music : this.sfx;
    gain.connect(busNode);
    const when = c.currentTime + (o.delay ?? 0);
    if (loopBuf) { src.loop = !!o.loop; src.loopStart = 0.05; src.loopEnd = loopBuf.duration - 0.05; src.start(when, 0.05); }
    else if (o.loop) { src.loop = true; src.loopStart = seg[0]; src.loopEnd = seg[0] + seg[1]; src.start(when, seg[0]); }
    else src.start(when, seg[0], seg[1] * 1.02);
    const v: Voice = {
      src, gain, panner, filter, pos: o.pos ? o.pos.clone() : null, started: c.currentTime, priority: o.priority ?? 1, ended: false, loop: !!o.loop,
      stop: (fade = 0.08) => {
        if (v.ended) return; v.ended = true;
        const t = c.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* already stopped */ }
      },
      setVolume: (x: number, tc = 0.1) => gain.gain.setTargetAtTime(x, c.currentTime, tc),
    };
    src.onended = () => { v.ended = true; try { gain.disconnect(); } catch { /**/ } };
    this.voices.push(v);
    return v;
  }

  /** Moves a looping positional voice and refreshes its occlusion. */
  updateVoice(v: Voice | null, pos: THREE.Vector3, baseVol = 1) {
    if (!v || v.ended || !v.panner || !this.ctx) return;
    const t = this.ctx.currentTime;
    const P: any = v.panner;
    if (P.positionX) { P.positionX.setTargetAtTime(pos.x, t, 0.05); P.positionY.setTargetAtTime(pos.y, t, 0.05); P.positionZ.setTargetAtTime(pos.z, t, 0.05); }
    v.pos?.copy(pos);
    if (this.occluder && v.filter) {
      const occ = this.occluder(this.listener, pos);
      v.filter.frequency.setTargetAtTime(occ ? 900 : 20000, t, 0.15);
      v.gain.gain.setTargetAtTime(baseVol * (occ ? 0.55 : 1), t, 0.15);
    }
  }

  stopAll() { for (const v of this.voices) v.stop(0.2); this.voices = []; }

  // ---------------------------------------------------------------- music --
  /** Music streams through Web Audio so volume and fades also work on iOS, where element.volume is read-only. */
  private musicEl(name: string, loop: boolean) {
    let m = this.musicEls.get(name);
    if (m) return m;
    const c = this.ctx!;
    const el = new Audio(BASE + name + '.mp3');
    el.loop = loop; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    el.setAttribute('playsinline', '');
    let node: MediaElementAudioSourceNode | null = null, gain: GainNode | null = null;
    try { node = c.createMediaElementSource(el); gain = c.createGain(); gain.gain.value = 0; node.connect(gain).connect(this.music); } catch { /* fallback: element volume */ }
    m = { el, node, gain };
    this.musicEls.set(name, m);
    return m;
  }

  playMusic(name: string | null, fade = 2.5, loop = true) {
    if (!this.ctx || name === this.musicName) return;
    const c = this.ctx, t = c.currentTime;
    if (this.musicName) {
      const cur = this.musicEls.get(this.musicName);
      if (cur?.gain) { cur.gain.gain.cancelScheduledValues(t); cur.gain.gain.setValueAtTime(cur.gain.gain.value, t); cur.gain.gain.linearRampToValueAtTime(0, t + fade); }
      const el = cur?.el; setTimeout(() => { if (el && this.musicName !== name) el.pause(); }, fade * 1000 + 100);
    }
    this.musicName = name;
    if (!name) return;
    const m = this.musicEl(name, loop);
    m.el.loop = loop; m.el.muted = false;
    if (m.gain) { m.gain.gain.cancelScheduledValues(t); m.gain.gain.setValueAtTime(0, t); m.gain.gain.linearRampToValueAtTime(1, t + fade); }
    m.el.currentTime = 0;
    m.el.play().catch(() => { /* will retry on next gesture */ });
  }
}

export const audio = new AudioEngine();
