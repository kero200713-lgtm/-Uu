import * as THREE from 'three';
import { Enemy, EnemyTuning } from './Enemy';
import type { EnemyDef } from '../world/types';
import type { World } from '../core/World';
import { audio } from '../audio/AudioEngine';
import { noise } from '../combat/Noise';

const ZV = { idle: ['z_moan', 'z_call'], alert: 'z_growl', attack: 'z_attack', hurt: 'z_hurt', death: 'z_death', pitch: 1 };

const HOLLOW_VARIANTS: Record<string, Partial<EnemyTuning['human']>> = {
  miner: { sex: 'm', variant: 'hollow_miner', hair: null },
  town: { sex: 'm', variant: 'hollow_town', hair: 'buzzed', hairColor: 0x4a4440 },
  nurse: { sex: 'f', variant: 'hollow_nurse', hair: 'long', hairColor: 0x2a221c },
};

export function hollowTuning(variant = 'town'): EnemyTuning {
  const hv = HOLLOW_VARIANTS[variant] || HOLLOW_VARIANTS.town;
  return {
    hp: 100, walk: 0.75, run: 2.35, turn: 5, view: 15, fov: 0.35, hearMul: 1,
    attackRange: 1.25, attackDmg: 16, attackTime: 1.4, attackHit: 0.45, attackCd: 1.1, grabChance: 0.35,
    staggerThreshold: 0.6, knockResist: 0,
    anims: { idle: 'Zombie_Idle_Loop', walk: 'Zombie_Walk_Fwd_Loop', walkRate: 0.95, run: 'Zombie_Walk_Fwd_Loop', runRate: 2.2, attack: 'Zombie_Scratch', attackRate: 1.15, hit: 'Hit_Chest', death: 'Death01', search: 'Zombie_Idle_Loop' },
    voice: { ...ZV, pitch: hv.sex === 'f' ? 1.15 : 0.95 },
    human: { sex: 'm', variant: 'hollow_town', eyes: 'dead', glow: 1, ...hv } as any,
  };
}

/** Hollow: the patrolling infected. */
export class Hollow extends Enemy {}

/**
 * Lurker: lies among the dead like a corpse. Springs up when the player gets
 * close or makes noise nearby, then hunts low and fast, hits and retreats.
 */
export class Lurker extends Enemy {
  triggered = false;
  constructor(def: EnemyDef, w: World) {
    super(def, {
      hp: 60, walk: 1.2, run: 3.35, turn: 9, view: 9, fov: 0.0, hearMul: 0.9,
      attackRange: 1.15, attackDmg: 11, attackTime: 0.9, attackHit: 0.4, attackCd: 0.6, grabChance: 0.0,
      staggerThreshold: 0.3, knockResist: 0,
      anims: { idle: 'Crouch_Idle_Loop', walk: 'Crouch_Fwd_Loop', walkRate: 1.0, run: 'Crouch_Fwd_Loop', runRate: 2.0, attack: 'Zombie_Scratch', attackRate: 1.7, hit: 'Hit_Head', death: 'Death01' },
      voice: { idle: [], alert: 'lurker_scream', attack: 'lurker_scream', hurt: 'z_hurt', death: 'z_death', pitch: 1.25 },
      human: { sex: 'f', variant: 'lurker', hair: 'long', hairColor: 0x1a1612, eyes: 'dead', glow: 1.2 },
    }, w);
  }
  enterInitial() {
    if (this.def.pose === 'lying' || this.def.pose === 'sitting' || !this.def.pose) {
      this.state = 'ambush';
      const a = this.anim.full('LayToIdle', { fade: 0, loop: false, speed: 0 });
      this.anim.update(0);
    } else super.enterInitial();
  }
  think() {
    if (this.state === 'ambush') {
      const p = this.w.player;
      const d = this.pos.distanceTo(p.pos);
      const h = this.hear();
      if ((d < (p.crouching ? 2.2 : 3.6) && !p.dead) || (h && h.loud > 0.55)) this.spring();
      return;
    }
    super.think();
  }
  spring() {
    if (this.triggered) return;
    this.triggered = true;
    this.state = 'getup'; this.stateT = 0;
    this.anim.full('LayToIdle', { fade: 0.05, loop: false, speed: 2.2, from: 0 });
    this.vocal('lurker_scream', 1.1);
    (this.w as any).onJumpScare?.(this);
    this.lastKnown.copy(this.w.player.pos); this.hasLastKnown = true; this.alert = 1.4;
  }
  act(dt: number) {
    if (this.state === 'ambush') return;
    if (this.state === 'getup' && this.stateT > 0.2) this.faceTo(this.w.player.pos, dt, 6);
    super.act(dt);
  }
  onAnimDone(n: string) {
    if (this.state === 'attack') { this.attackCd = 0.8; this.set('flee'); return; }
    super.onAnimDone(n);
  }
  damage(a: number, d: THREE.Vector3, part: 'head' | 'body', s: number, k: number, at?: THREE.Vector3) {
    if (this.state === 'ambush') this.spring();
    return super.damage(a, d, part, s, k, at);
  }
}

/** Husk: slow, bloated, enormously durable, relentless once it has your scent. */
export class Husk extends Enemy {
  stepT = 0;
  constructor(def: EnemyDef, w: World) {
    super(def, {
      hp: 520, walk: 0.62, run: 1.15, turn: 2.5, view: 13, fov: 0.2, hearMul: 1.5, relentless: true,
      attackRange: 1.55, attackDmg: 34, attackTime: 1.6, attackHit: 0.5, attackCd: 1.6, grabChance: 0,
      staggerThreshold: 0.95, knockResist: 0.85,
      anims: { idle: 'Zombie_Idle_Loop', walk: 'Zombie_Walk_Fwd_Loop', walkRate: 0.75, run: 'Zombie_Walk_Fwd_Loop', runRate: 1.25, attack: 'Melee_Hook', attackRate: 0.8, hit: 'Hit_Chest', death: 'Death01' },
      voice: { idle: ['husk_growl', 'z_moan'], alert: 'husk_growl', attack: 'husk_growl', hurt: 'z_hurt', death: 'z_death', pitch: 0.7 },
      human: {
        sex: 'm', variant: 'husk', hair: null, eyes: 'dead', glow: 1.4, scale: 1.18,
        boneScale: { spine_02: [1.32, 1.05, 1.4], pelvis: [1.2, 1, 1.25], upperarm_l: [1.25, 1.0, 1.25], upperarm_r: [1.25, 1.0, 1.25], neck_01: [1.3, 0.8, 1.3], thigh_l: [1.2, 1, 1.2], thigh_r: [1.2, 1, 1.2] },
      },
    }, w);
  }
  act(dt: number) {
    super.act(dt);
    if (this.speed > 0.1) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.85; audio.play('st_concrete', { pos: this.pos.clone(), volume: 1, rate: 0.55, ref: 3 }); (this.w as any).shakeNear?.(this.pos, 0.08); }
    }
  }
}

/**
 * The Listener: blind, cannot be killed, hunts purely by sound. Crouch-walking
 * is nearly silent to it; gunfire draws it from across the area. A shotgun
 * blast or a flare stuns/distracts it — changing how the player behaves.
 */
export class Listener extends Enemy {
  clickT = 2;
  feedT = 0;
  constructor(def: EnemyDef, w: World) {
    super(def, {
      hp: 99999, walk: 0.85, run: 4.1, turn: 4, view: 0, fov: 1, hearMul: 1.8, blind: true, invincible: true,
      attackRange: 1.6, attackDmg: 55, attackTime: 1.1, attackHit: 0.42, attackCd: 1.4, grabChance: 0,
      staggerThreshold: 0.9, knockResist: 1,
      anims: { idle: 'Idle_No_Loop', walk: 'Walk_Loop', walkRate: 0.55, run: 'Jog_Fwd_Loop', runRate: 1.25, attack: 'Sword_Attack', attackRate: 1.35, hit: 'Hit_Knockback', death: 'Death01', search: 'Idle_No_Loop' },
      voice: { idle: ['lis_click'], alert: 'lurker_scream', attack: 'husk_growl', hurt: 'z_hurt', death: 'z_death', pitch: 0.62 },
      human: {
        sex: 'm', variant: 'listener', hair: null, eyes: 'none', glow: 1.6, scale: 1.12,
        boneScale: { spine_01: [0.88, 1.18, 0.88], spine_02: [0.9, 1.15, 0.9], neck_01: [0.8, 1.6, 0.8], upperarm_l: [0.85, 1.35, 0.85], upperarm_r: [0.85, 1.35, 0.85], lowerarm_l: [0.85, 1.3, 0.85], lowerarm_r: [0.85, 1.3, 0.85], hand_l: [1, 1.4, 1], hand_r: [1, 1.4, 1], thigh_l: [0.9, 1.12, 0.9], thigh_r: [0.9, 1.12, 0.9], Head: [0.7, 0.55, 0.7] },
      },
    }, w);
  }
  async init() {
    await super.init();
    // fungal "ear" crown replacing the face: fan of translucent gill plates
    const head = this.anim.bone('Head');
    if (head) {
      const crown = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x9aa89a, emissive: 0x3fd0b8, emissiveIntensity: 0.9, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      for (let i = 0; i < 11; i++) {
        const g = new THREE.CircleGeometry(0.2 + Math.random() * 0.12, 10, 0, Math.PI * (0.8 + Math.random() * 0.3));
        const m = new THREE.Mesh(g, mat);
        const a = (i / 11) * Math.PI * 1.6 - Math.PI * 0.8;
        m.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, a, Math.random() * 0.6);
        m.position.set(Math.sin(a) * 0.05, 0.12 + Math.random() * 0.06, Math.cos(a) * 0.05);
        crown.add(m);
      }
      crown.scale.setScalar(1.6);
      head.add(crown);
      (this as any).crown = crown;
    }
  }
  canSee() { return false; }
  think() {
    if (this.state === 'feed') {
      const fl = this.w.fx.flare;
      if (!fl || this.stateT > 9) { this.set('search'); }
      return;
    }
    super.think();
    // flares override everything
    const fl = this.w.fx.flare;
    if (fl && fl.landed && this.pos.distanceTo(fl.pos) < 26 && this.state !== 'stunned' && this.state !== 'attack') {
      this.lastKnown.copy(fl.pos); this.hasLastKnown = true;
      if (this.pos.distanceTo(fl.pos) < 1.4) this.set('feed'); else if (this.state !== 'investigate') this.set('investigate');
    }
    // proximity "feel": very close + not crouched => found
    const p = this.w.player;
    if (!p.dead && this.state !== 'chase' && this.state !== 'stunned' && this.pos.distanceTo(p.pos) < (p.crouching ? 1.1 : 2.4)) {
      this.lastKnown.copy(p.pos); this.hasLastKnown = true; this.vocal('lurker_scream', 1); this.set('chase');
    }
  }
  onState(s: any) {
    if (s === 'feed') { this.anim.full('Fixing_Kneeling', { fade: 0.4 }); return; }
    super.onState(s);
  }
  act(dt: number) {
    super.act(dt);
    // the chase only continues while it keeps hearing you
    if (this.state === 'chase') {
      const d = this.pos.distanceTo(this.lastKnown);
      if (d < 1.2 && this.pos.distanceTo(this.w.player.pos) > 3) this.set('search');
    }
    this.clickT -= dt;
    if (this.clickT <= 0) {
      this.clickT = this.state === 'chase' ? 0.9 : 2.2 + Math.random() * 2;
      this.vocal('lis_click', this.state === 'chase' ? 1 : 0.8);
    }
    const crown = (this as any).crown as THREE.Group;
    if (crown) crown.children.forEach((c, i) => { c.rotation.z = Math.sin(this.w.time * (this.state === 'chase' ? 9 : 2.5) + i) * 0.25; });
  }
}

export function createEnemy(def: EnemyDef, w: World): Enemy {
  switch (def.kind) {
    case 'lurker': return new Lurker(def, w);
    case 'husk': return new Husk(def, w);
    case 'listener': return new Listener(def, w);
    default: return new Hollow(def, hollowTuning(def.variant), w);
  }
}

/** Owns enemies of the current area. */
export class EnemyManager {
  list: Enemy[] = [];
  constructor(public scene: THREE.Object3D, public w: World) {}
  async spawnAll(defs: EnemyDef[], killed: Set<string>, flags: Set<string>) {
    const todo = defs.filter((d) => !killed.has(d.id) && (!d.needFlag || flags.has(d.needFlag)));
    const made = await Promise.all(todo.map(async (d) => { const e = createEnemy(d, this.w); await e.init(); return e; }));
    for (const e of made) { this.list.push(e); this.scene.add(e.root); }
  }
  async spawnOne(def: EnemyDef) {
    const e = createEnemy(def, this.w); await e.init(); this.list.push(e); this.scene.add(e.root); return e;
  }
  update(dt: number) { for (const e of this.list) e.update(dt); }
  get chasing() { return this.list.some((e) => e.state === 'chase' || e.state === 'attack' || e.state === 'grab'); }
  nearestThreat(pos: THREE.Vector3) {
    let best = Infinity;
    for (const e of this.list) { if (e.state === 'dead' || e.state === 'dormant' || e.state === 'ambush') continue; best = Math.min(best, e.pos.distanceTo(pos)); }
    return best;
  }
  byId(id: string) { return this.list.find((e) => e.id === id); }
  clear() { for (const e of this.list) e.dispose(); this.list = []; }
}

export { noise };
