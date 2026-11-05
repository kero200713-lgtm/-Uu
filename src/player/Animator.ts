import * as THREE from 'three';
import { assets } from '../core/Assets';

const LOWER = new Set(['root', 'pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']);

const splitCache = new Map<string, THREE.AnimationClip>();
/** Splits a full-body clip into an upper- or lower-body clip by bone name. */
export function partClip(name: string, part: 'upper' | 'lower' | 'full'): THREE.AnimationClip | null {
  const key = name + '@' + part;
  let c = splitCache.get(key);
  if (c) return c;
  const src = assets.clips.get(name);
  if (!src) { console.warn('missing clip', name); return null; }
  if (part === 'full') { splitCache.set(key, src); return src; }
  const tracks = src.tracks.filter((t) => {
    const bone = t.name.split('.')[0];
    return part === 'lower' ? LOWER.has(bone) : !LOWER.has(bone);
  });
  c = new THREE.AnimationClip(key, src.duration, tracks);
  splitCache.set(key, c);
  return c;
}

interface PlayOpts { fade?: number; loop?: boolean; speed?: number; sync?: boolean; from?: number; restart?: boolean }

class Layer {
  current: THREE.AnimationAction | null = null;
  name = '';
  constructor(private mixer: THREE.AnimationMixer, private part: 'upper' | 'lower', private root: THREE.Object3D) {}
  play(name: string, o: PlayOpts = {}, syncWith?: THREE.AnimationAction | null) {
    if (this.name === name && this.current) {
      if (o.speed !== undefined) this.current.timeScale = o.speed;
      // same one-shot again (e.g. a second swing): replay it from the start
      if (o.restart) { this.current.reset(); this.current.setEffectiveWeight(1); this.current.play(); }
      return this.current;
    }
    const clip = partClip(name, this.part);
    if (!clip) return null;
    const a = this.mixer.clipAction(clip, this.root);
    a.reset();
    a.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = o.loop === false;
    a.timeScale = o.speed ?? 1;
    if (o.from !== undefined) a.time = o.from;
    if (o.sync && syncWith && syncWith.getClip().duration > 0) a.time = (syncWith.time / syncWith.getClip().duration) * clip.duration;
    a.enabled = true;
    a.setEffectiveWeight(1);
    const fade = o.fade ?? 0.2;
    if (this.current && fade > 0) { a.play(); this.current.crossFadeTo(a, fade, false); }
    else { if (this.current) this.current.stop(); a.play(); }
    this.current = a; this.name = name;
    return a;
  }
}

/**
 * Two-layer animator. The lower body runs locomotion while the upper body can
 * independently aim, shoot, reload, heal or swing — the classic survival
 * horror "walk and aim" setup — without needing dedicated combined clips.
 */
export class Animator {
  mixer: THREE.AnimationMixer;
  upper: Layer; lower: Layer;
  bones = new Map<string, THREE.Bone>();
  private onceCb: ((name: string) => void) | null = null;
  constructor(public root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    this.upper = new Layer(this.mixer, 'upper', root);
    this.lower = new Layer(this.mixer, 'lower', root);
    root.traverse((o: any) => { if (o.isBone) this.bones.set(o.name, o); });
    this.mixer.addEventListener('finished', (e: any) => {
      const nm = (e.action.getClip().name as string).split('@')[0];
      this.onceCb?.(nm);
    });
  }
  onFinished(cb: (name: string) => void) { this.onceCb = cb; }
  full(name: string, o: PlayOpts = {}) {
    const l = this.lower.play(name, o);
    this.upper.play(name, { ...o, sync: true }, l);
  }
  legs(name: string, o: PlayOpts = {}) { return this.lower.play(name, o); }
  arms(name: string, o: PlayOpts = {}) { return this.upper.play(name, { ...o, sync: o.sync ?? false }, this.lower.current); }
  update(dt: number) { this.mixer.update(dt); }
  bone(name: string) { return this.bones.get(name); }
}
