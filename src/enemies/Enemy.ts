import * as THREE from 'three';
import type { EnemyDef } from '../world/types';
import type { World } from '../core/World';
import { Human, createHuman, HumanOpts } from '../player/CharacterFactory';
import { Animator } from '../player/Animator';
import { noise } from '../combat/Noise';
import { audio, Voice } from '../audio/AudioEngine';
import { BLOCK_SIGHT } from '../world/Grid';

export type EState = 'dormant' | 'ambush' | 'idle' | 'patrol' | 'suspicious' | 'investigate' | 'chase' | 'attack' | 'search' | 'return' |
  'stagger' | 'down' | 'getup' | 'grab' | 'dead' | 'flee' | 'feed' | 'stunned' | 'eat';

export interface EnemyTuning {
  hp: number; walk: number; run: number; turn: number; view: number; fov: number; hearMul: number; blind?: boolean;
  attackRange: number; attackDmg: number; attackTime: number; attackHit: number; attackCd: number; grabChance: number;
  staggerThreshold: number; knockResist: number; invincible?: boolean; relentless?: boolean;
  anims: { idle: string; walk: string; walkRate: number; run: string; runRate: number; attack: string; attackRate: number; hit: string; death: string; search?: string };
  voice: { idle: string[]; alert: string; attack: string; hurt: string; death: string; pitch: number };
  human: HumanOpts;
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

/**
 * Base infected. Perception: view cone + distance + grid line-of-sight,
 * modulated by the player's light level, crouching and flashlight; hearing
 * of noise events attenuated by walls. Behaviour: a state machine with
 * patrol, suspicion, investigation, chase, attack/grab, search and return.
 * Distant enemies think and animate at a lower rate.
 */
export class Enemy {
  id: string; kind: string; def: EnemyDef; t: EnemyTuning; w: World;
  human!: Human; anim!: Animator;
  root = new THREE.Group();
  pos: THREE.Vector3; yaw = 0; hp: number;
  state: EState = 'idle'; stateT = 0;
  alert = 0;
  lastKnown = new THREE.Vector3(); hasLastKnown = false;
  path: THREE.Vector3[] = []; pathIdx = 0; repathT = 0; pathGoal = new THREE.Vector3();
  patrol: THREE.Vector3[] = []; patrolIdx = 0; home = new THREE.Vector3();
  attackCd = 0; attackDone = false;
  thinkT = Math.random() * 0.3; animAcc = 0; lodSkip = 0;
  voiceT = 3 + Math.random() * 6;
  seesPlayer = false;
  speed = 0;
  ready = false;
  loopVoice: Voice | null = null;
  searchT = 0;
  hitFlash = 0;
  private stuckT = 0; private lastPos = new THREE.Vector3();

  constructor(def: EnemyDef, tuning: EnemyTuning, world: World) {
    this.def = def; this.id = def.id; this.kind = def.kind; this.t = tuning; this.w = world;
    this.hp = tuning.hp;
    const T = world.level.T;
    this.pos = this.root.position;
    this.pos.set(def.at[0] * T, 0, def.at[1] * T);
    this.home.copy(this.pos);
    this.yaw = ((def.dir ?? 0) * Math.PI) / 180;
    this.patrol = (def.patrol || []).map((p) => new THREE.Vector3(p[0] * T, 0, p[1] * T));
  }

  async init() {
    const q = (this.w as any).q;
    this.human = await createHuman({ ...this.t.human, lod: true, shadow: q ? q.level === 'high' : false });
    this.root.add(this.human.root);
    this.anim = new Animator(this.human.model);
    this.anim.procedural('spine_02', 'spine_03', 'neck_01', 'Head'); // hit flinch offsets
    this.anim.onFinished((n) => this.onAnimDone(n));
    this.enterInitial();
    this.ready = true;
  }

  enterInitial() {
    const pose = this.def.pose;
    if (this.def.dormant) { this.set('dormant'); this.root.visible = false; return; }
    if (pose === 'eating') { this.set('eat'); this.anim.full('Fixing_Kneeling', { fade: 0 }); return; }
    this.set(this.patrol.length ? 'patrol' : 'idle');
  }

  set(s: EState) {
    if (this.state === 'dead') return;
    this.state = s; this.stateT = 0;
    this.path = []; this.pathIdx = 0; this.repathT = 0;
    this.onState(s);
  }

  /** Per-type animation selection on state entry. */
  onState(s: EState) {
    const a = this.t.anims;
    switch (s) {
      case 'idle': case 'suspicious': case 'search': this.anim.full(s === 'search' && a.search ? a.search : a.idle, { fade: 0.35 }); break;
      case 'patrol': case 'investigate': case 'return': this.anim.full(a.walk, { fade: 0.35, speed: a.walkRate }); break;
      case 'chase': this.anim.full(a.run, { fade: 0.25, speed: a.runRate }); break;
      case 'attack': this.anim.full(a.attack, { fade: 0.12, loop: false, speed: a.attackRate }); this.attackDone = false; this.vocal(this.t.voice.attack, 1); break;
      case 'stagger': this.anim.full(a.hit, { fade: 0.08, loop: false, speed: 1.3 }); break;
      case 'down': this.anim.full('Hit_Knockback', { fade: 0.08, loop: false }); break;
      case 'getup': this.anim.full('LayToIdle', { fade: 0.2, loop: false, speed: 1.5, from: 0.6 }); break;
      case 'dead': this.anim.full(a.death, { fade: 0.15, loop: false }); break;
      case 'grab': this.anim.full('Zombie_Scratch', { fade: 0.1, speed: 0.6 }); break;
    }
  }

  onAnimDone(name: string) {
    if (this.state === 'attack') { this.attackCd = this.t.attackCd; this.set(this.hasLastKnown ? 'chase' : 'search'); }
    else if (this.state === 'stagger') this.set(this.hasLastKnown || this.seesPlayer ? 'chase' : 'search');
    else if (this.state === 'down') this.set('getup');
    else if (this.state === 'getup') this.set('chase');
  }

  vocal(name: string, vol = 0.9) {
    if (!name) return;
    audio.play(name, { pos: tmp.copy(this.pos).setY(1.6), volume: vol, rate: this.t.voice.pitch, vary: 0.08, ref: 2.5, priority: 2 });
  }

  // ---------------------------------------------------------- perception --
  canSee(): boolean {
    if (this.t.blind) return false;
    const p = this.w.player;
    if (p.dead) return false;
    tmp.subVectors(p.pos, this.pos); tmp.y = 0;
    const d = tmp.length();
    let range = this.t.view;
    const lit = p.litLevel(); // 0 dark .. 1 brightly lit
    range *= 0.55 + 0.65 * lit;
    if (p.crouching) range *= 0.7;
    if (d > range) return false;
    if (d > 2.2) {
      const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
      const cos = (tmp.x * fwdX + tmp.z * fwdZ) / (d || 1);
      const fov = this.state === 'chase' || this.state === 'search' ? Math.min(this.t.fov, -0.2) : this.t.fov;
      if (cos < fov) return false;
    }
    return this.w.level.grid.lineOfSight(this.pos, p.pos, true);
  }

  hear() {
    let best: { pos: THREE.Vector3; loud: number; kind: string } | null = null;
    for (const e of noise.events) {
      const d = e.pos.distanceTo(this.pos);
      let r = e.radius * this.t.hearMul;
      if (d > r) continue;
      if (!this.w.level.grid.lineOfSight(this.pos, e.pos, false)) { r *= 0.55; if (d > r) continue; }
      const loud = 1 - d / r;
      if (!best || loud > best.loud) best = { pos: e.pos, loud, kind: e.kind };
    }
    return best;
  }

  // ------------------------------------------------------------- update --
  update(dt: number) {
    if (!this.ready) return;
    const camD = this.pos.distanceTo(this.w.camPos);
    this.attackCd -= dt; this.stateT += dt; this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    // dormant: no AI, but a visible one (scripted apparitions) must still pose, never T-pose
    if (this.state === 'dormant') { if (this.root.visible) this.anim.update(dt); return; }
    // think at reduced rate when far
    this.thinkT -= dt;
    if (this.thinkT <= 0 && this.state !== 'dead') {
      this.thinkT = camD < 18 || this.state === 'chase' ? 0.1 : camD < 35 ? 0.3 : 0.8;
      this.think();
    }
    this.act(dt);
    // animation LOD
    const far = camD > ((this.w as any).q?.enemyAnimDist ?? 22);
    this.animAcc += dt;
    if (!far || ++this.lodSkip % 3 === 0) { this.anim.update(this.animAcc); this.animAcc = 0; this.applyKick(dt); }
    this.root.rotation.y = this.yaw;
    // visibility cull beyond draw distance
    this.root.visible = camD < 70;
    // baked light for this character
    const c = this.human.bodyMat.userData.bake.value as THREE.Color;
    this.w.level.baker.sample(this.pos.x, this.pos.z, c);
    c.multiplyScalar(1.3);
    this.voiceT -= dt;
    if (this.voiceT <= 0 && this.state !== 'dead' && camD < 30) {
      this.voiceT = 5 + Math.random() * 9;
      const v = this.t.voice.idle; if (v.length) this.vocal(v[Math.floor(Math.random() * v.length)], 0.7);
    }
  }

  think() {
    const s = this.state;
    if (['dead', 'stagger', 'down', 'getup', 'attack', 'grab', 'stunned'].includes(s)) return;
    const p = this.w.player;
    const sees = this.canSee();
    this.seesPlayer = sees;
    if (sees) {
      const d = this.pos.distanceTo(p.pos);
      const rate = d < 4 ? 6 : d < 9 ? 2.4 : 1.2;
      this.alert = Math.min(1.5, this.alert + rate * this.thinkInterval());
      this.lastKnown.copy(p.pos); this.hasLastKnown = true;
      if (this.alert >= 1 && s !== 'chase') { this.vocal(this.t.voice.alert, 1); this.set('chase'); (this.w as any).onSpotted?.(this); }
      else if (s === 'idle' || s === 'patrol' || s === 'eat' || s === 'return') this.set('suspicious');
    } else {
      this.alert = Math.max(0, this.alert - 0.15 * this.thinkInterval());
    }
    if (!sees) {
      const h = this.hear();
      if (h) {
        this.lastKnown.copy(h.pos); this.hasLastKnown = true;
        const shot = h.kind === 'shot';
        if (h.kind === 'flare') { if (s !== 'chase' || !sees) this.set('investigate'); }
        else if (s === 'chase') { /* keep chasing toward newest sound */ }
        else if ((shot && h.loud > 0.25) || h.loud > 0.65 || this.t.relentless) { this.alert = 1; this.vocal(this.t.voice.alert, 0.9); this.set('chase'); }
        else if (s !== 'investigate') { this.alert = Math.max(this.alert, 0.5); this.set(s === 'idle' || s === 'patrol' || s === 'eat' ? 'suspicious' : 'investigate'); }
      }
    }
    if (this.t.relentless && this.alert > 0.5 && !p.dead && this.pos.distanceTo(p.pos) < 22) { this.lastKnown.copy(p.pos); this.hasLastKnown = true; }
  }

  thinkInterval() { const d = this.pos.distanceTo(this.w.camPos); return this.state === 'chase' || d < 18 ? 0.1 : d < 35 ? 0.3 : 0.8; }

  act(dt: number) {
    const p = this.w.player;
    const s = this.state;
    this.speed = 0;
    switch (s) {
      case 'idle': case 'eat': break;
      case 'patrol': {
        if (!this.patrol.length) { this.set('idle'); break; }
        const tgt = this.patrol[this.patrolIdx];
        if (this.moveTo(tgt, this.t.walk, dt)) { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; if (Math.random() < 0.35) { this.set('idle'); this.stateT = -2 - Math.random() * 3; } }
        break;
      }
      case 'suspicious': {
        if (this.hasLastKnown) this.faceTo(this.lastKnown, dt, 3);
        if (this.stateT > 1.6) this.set(this.alert > 0.35 ? 'investigate' : (this.patrol.length ? 'patrol' : 'idle'));
        break;
      }
      case 'investigate': {
        if (this.moveTo(this.lastKnown, this.t.walk * 1.15, dt) || this.stateT > 14) this.set('search');
        break;
      }
      case 'chase': {
        if (p.dead) { this.set('search'); break; }
        const tgt = this.seesPlayer || this.t.relentless ? p.pos : this.lastKnown;
        const d = this.pos.distanceTo(p.pos);
        if (this.seesPlayer && d < this.t.attackRange && this.attackCd <= 0 && !p.grabbedBy) {
          this.faceTo(p.pos, dt, 20);
          this.set('attack'); break;
        }
        if (this.moveTo(tgt, this.t.run, dt, 0.9) && !this.seesPlayer) {
          if (this.stateT > 1) this.set('search');
        }
        if (!this.seesPlayer && this.stateT > 12 && !this.t.relentless) this.set('search');
        break;
      }
      case 'attack': {
        this.faceTo(p.pos, dt, 6);
        const at = this.anim.upper.current;
        const frac = at ? at.time / at.getClip().duration : 1;
        if (!this.attackDone && frac >= this.t.attackHit) {
          this.attackDone = true;
          const d = this.pos.distanceTo(p.pos);
          tmp.subVectors(p.pos, this.pos).normalize();
          const facing = -Math.sin(this.yaw) * tmp.x - Math.cos(this.yaw) * tmp.z;
          if (d < this.t.attackRange + 0.45 && facing > 0.35 && !p.dead) {
            if (Math.random() < this.t.grabChance && !p.grabbedBy && p.startGrab(this)) { this.set('grab'); }
            else p.damage(this.t.attackDmg, this.pos, { knock: this.t.attackDmg >= 30, attacker: this });
          }
        }
        break;
      }
      case 'grab': {
        this.faceTo(p.pos, dt, 10);
        tmp.subVectors(this.pos, p.pos); tmp.y = 0;
        if (tmp.length() > 0.75) this.pos.copy(p.pos).addScaledVector(tmp.normalize(), 0.75);
        if (p.grabbedBy !== this) { this.attackCd = 2.2; this.set('stagger'); }
        break;
      }
      case 'search': {
        if (this.stateT > 8 + Math.random() * 0.1) { this.hasLastKnown = false; this.alert = 0; this.set('return'); break; }
        this.searchT -= dt;
        if (this.searchT <= 0 || !this.path.length) {
          this.searchT = 2.5 + Math.random() * 2;
          const g = this.w.level.grid;
          const base = this.hasLastKnown ? this.lastKnown : this.pos;
          for (let i = 0; i < 6; i++) {
            tmp2.set(base.x + (Math.random() - 0.5) * 8, 0, base.z + (Math.random() - 0.5) * 8);
            const [cx, cy] = g.cellOf(tmp2.x, tmp2.z);
            if (g.walkable(cx, cy)) { this.path = g.findPath(this.pos, tmp2, 400) || []; this.pathIdx = 0; break; }
          }
        }
        this.followPath(this.t.walk, dt);
        break;
      }
      case 'return': {
        const tgt = this.patrol.length ? this.patrol[this.patrolIdx] : this.home;
        if (this.moveTo(tgt, this.t.walk, dt)) this.set(this.patrol.length ? 'patrol' : 'idle');
        break;
      }
      case 'stunned': {
        if (this.stateT > 0) this.set(this.hasLastKnown ? 'chase' : 'search');
        break;
      }
      case 'flee': {
        tmp.subVectors(this.pos, p.pos).setY(0).normalize();
        tmp2.copy(this.pos).addScaledVector(tmp, 3);
        this.moveTo(tmp2, this.t.run, dt);
        if (this.stateT > 1.4) this.set('chase');
        break;
      }
    }
    // stuck detection: repath
    if (this.speed > 0.1) {
      if (this.pos.distanceTo(this.lastPos) < this.speed * dt * 0.2) { this.stuckT += dt; if (this.stuckT > 0.8) { this.path = []; this.stuckT = 0; } }
      else this.stuckT = 0;
    }
    this.lastPos.copy(this.pos);
  }

  faceTo(target: THREE.Vector3, dt: number, rate = this.t.turn) {
    const want = Math.atan2(-(target.x - this.pos.x), -(target.z - this.pos.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  /** Path-follow toward target. Returns true when arrived. */
  moveTo(target: THREE.Vector3, speed: number, dt: number, arrive = 0.6): boolean {
    const g = this.w.level.grid;
    if (this.pos.distanceTo(target) < arrive) return true;
    this.repathT -= dt;
    if (this.repathT <= 0 || !this.path.length || this.pathGoal.distanceTo(target) > 1.5) {
      this.repathT = this.state === 'chase' ? 0.45 : 1.5;
      this.pathGoal.copy(target);
      if (g.clearPath(this.pos, target, 0.3)) this.path = [target.clone()];
      else this.path = g.findPath(this.pos, target) || [];
      this.pathIdx = 0;
      if (!this.path.length) return this.state !== 'chase';
    }
    this.followPath(speed, dt);
    return this.pos.distanceTo(target) < arrive;
  }

  followPath(speed: number, dt: number) {
    if (this.pathIdx >= this.path.length) return;
    const wp = this.path[this.pathIdx];
    tmp.subVectors(wp, this.pos); tmp.y = 0;
    const d = tmp.length();
    if (d < 0.35) { this.pathIdx++; return; }
    this.faceTo(wp, dt);
    // move along facing (smooth turns), slower while turning hard
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const align = Math.max(0.2, (tmp.x * fx + tmp.z * fz) / d);
    const step = Math.min(d, speed * align * dt);
    this.pos.x += fx * step; this.pos.z += fz * step;
    this.speed = speed * align;
    this.w.level.grid.collide(this.pos, 0.32);
  }

  // ------------------------------------------------------------- damage --
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxD: number): { t: number; part: 'head' | 'body' } | null {
    if (this.state === 'dead' || this.state === 'dormant' || !this.root.visible) return null;
    const head = this.anim.bone('Head'), pelvis = this.anim.bone('pelvis'), neck = this.anim.bone('neck_01');
    if (!head || !pelvis || !neck) return null;
    const hp = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
    const pp = pelvis.getWorldPosition(new THREE.Vector3());
    const np = neck.getWorldPosition(new THREE.Vector3());
    const scale = this.human.model.scale.x;
    const th = raySphere(origin, dir, hp, 0.16 * scale);
    // torso capsule pelvis->neck plus legs capsule pelvis->ground
    const tb = rayCapsule(origin, dir, pp, np, 0.26 * scale);
    const tl = rayCapsule(origin, dir, new THREE.Vector3(pp.x, 0.1, pp.z), pp, 0.18 * scale);
    let best: { t: number; part: 'head' | 'body' } | null = null;
    if (th >= 0 && th <= maxD) best = { t: th, part: 'head' };
    for (const t of [tb, tl]) if (t >= 0 && t <= maxD && (!best || t < best.t - 0.05)) best = { t, part: 'body' };
    return best;
  }

  /** The player blocked this attack: a parry makes it reel back, a plain block only buys time. */
  blocked(parry: boolean) {
    if (this.state === 'dead') return;
    this.attackCd = Math.max(this.attackCd, parry ? 1.8 : 0.9);
    if (parry && !this.t.invincible) this.set('stagger');
  }

  /** Returns true if killed. */
  damage(amount: number, dir: THREE.Vector3, part: 'head' | 'body', stagger: number, knock: number, at?: THREE.Vector3): boolean {
    if (this.state === 'dead') return false;
    this.hitFlash = 1;
    const p = this.w.player;
    this.lastKnown.copy(p.pos); this.hasLastKnown = true; this.alert = 1.2;
    if (at) { this.w.fx.blood(at, dir.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0.2, 0)).normalize(), part === 'head' ? 16 : 10); if (Math.random() < 0.5) this.w.fx.decal(at.clone().setY(0), 0.6); }
    if (this.t.invincible) {
      if (stagger >= this.t.staggerThreshold || knock > 0.4) { this.stun(stagger >= 1 ? 4.5 : 2.5); }
      return false;
    }
    // headshots: triple damage (a pistol round to the head drops a Hollow) and the head snaps back;
    // body hits jolt the torso without interrupting the attack unless they stagger
    this.hp -= amount * (part === 'head' ? 3 : 1);
    this.kick(dir, part, amount);
    if (this.hp <= 0) { this.die(); return true; }
    this.vocal(this.t.voice.hurt, 0.9);
    if (this.state === 'grab') { (p as any).releaseGrab?.(); }
    if (knock > 0 && Math.random() < knock * (1 - this.t.knockResist)) this.set('down');
    else if (stagger >= this.t.staggerThreshold || Math.random() < stagger * 0.5) this.set('stagger');
    else if (this.state !== 'chase' && this.state !== 'attack') this.set('chase');
    return false;
  }

  private kickT = 0; private kickAmt = 0; private kickHead = false; private kickAxis = new THREE.Vector3();
  /** Records a hit impulse: the torso (body) or neck/head (head) is thrown back along the shot. */
  private kick(dir: THREE.Vector3, part: 'head' | 'body', amount: number) {
    this.kickAxis.set(dir.z, 0, -dir.x).normalize(); // horizontal axis perpendicular to the shot
    this.kickHead = part === 'head';
    this.kickAmt = Math.min(0.9, (part === 'head' ? 0.75 : 0.3) * (0.6 + amount / 40));
    this.kickT = part === 'head' ? 0.42 : 0.3;
  }
  private applyKick(dt: number) {
    if (this.kickT <= 0) return;
    this.kickT = Math.max(0, this.kickT - dt);
    const dur = this.kickHead ? 0.42 : 0.3, t = 1 - this.kickT / dur;
    const env = Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * (1 - t) * (1 - t) * 1.6; // fast snap, slow return
    const a = this.kickAmt * env;
    const rot = (n: string, k: number) => {
      const b = this.anim.bone(n); if (!b?.parent) return;
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      const r = new THREE.Quaternion().setFromAxisAngle(this.kickAxis, a * k);
      b.quaternion.premultiply(pq.clone().invert().multiply(r).multiply(pq));
    };
    if (this.kickHead) { rot('spine_03', 0.25); rot('neck_01', 0.45); rot('Head', 0.6); }
    else { rot('spine_02', 0.45); rot('spine_03', 0.45); rot('Head', 0.15); }
  }

  stun(time: number) {
    this.set('stunned');
    this.anim.full('Hit_Knockback', { fade: 0.08, loop: false, speed: 0.9 });
    this.vocal(this.t.voice.hurt, 1);
    this.stateT = -time;
  }

  die() {
    this.set('dead');
    this.state = 'dead';
    this.vocal(this.t.voice.death, 1);
    audio.play('body_fall', { pos: this.pos.clone(), volume: 0.8, delay: 0.7 });
    this.w.fx.spores(this.pos.clone().setY(1.2), 14);
    this.w.onEnemyKilled(this.id, this.pos);
    this.loopVoice?.stop(0.5);
  }

  dispose() {
    this.loopVoice?.stop(0.1);
    this.root.parent?.remove(this.root);
  }
}

export function raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}

/** Ray vs capsule (segment a-b, radius r) via closest approach. */
export function rayCapsule(o: THREE.Vector3, d: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const ba = tmp.subVectors(b, a), oa = tmp2.subVectors(o, a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const A = baba - bard * bard;
  let B = baba * rdoa - baoa * bard;
  let C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-6) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    const oc = y <= 0 ? oa : new THREE.Vector3().subVectors(o, b);
    B = d.dot(oc); C = oc.dot(oc) - r * r; h = B * B - C;
    if (h > 0) { const t2 = -B - Math.sqrt(h); if (t2 >= 0) return t2; }
  }
  return -1;
}

export { BLOCK_SIGHT };
