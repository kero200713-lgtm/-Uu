import * as THREE from 'three';
import { createHuman, Human } from './CharacterFactory';
import { Animator } from './Animator';
import { CameraRig } from './CameraRig';
import { input } from '../core/Input';
import { assets } from '../core/Assets';
import { audio } from '../audio/AudioEngine';
import { noise } from '../combat/Noise';
import { ITEMS, WeaponDef } from '../items/ItemDefs';
import { Inventory } from '../items/Inventory';
import { dynamicPropMaterial } from '../world/Materials';
import { bus } from '../core/Events';
import { settings } from '../core/Settings';
import type { Level } from '../world/Level';
import type { PlayerLike } from '../core/World';
import type { QualityPreset } from '../core/Quality';
import { vibrate } from '../platform/Native';

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Removes anatomical detail (chest, abdominal and back muscles) under the
 * jacket with Taubin smoothing on a position-welded copy of the body, so the
 * painted clothing reads as a garment rather than skin. Normals are rebuilt
 * from the smoothed surface and blended in by the same mask.
 */
function smoothGarment(geo: THREE.BufferGeometry, P: THREE.BufferAttribute, Nrm: THREE.BufferAttribute) {
  const N = P.count;
  const group = new Int32Array(N);
  const keys = new Map<string, number>();
  const gp: number[] = [];
  for (let i = 0; i < N; i++) {
    const k = `${Math.round(P.getX(i) * 4000)},${Math.round(P.getY(i) * 4000)},${Math.round(P.getZ(i) * 4000)}`;
    let g = keys.get(k);
    if (g === undefined) { g = gp.length / 3; keys.set(k, g); gp.push(P.getX(i), P.getY(i), P.getZ(i)); }
    group[i] = g;
  }
  const G = gp.length / 3;
  const adj: Set<number>[] = Array.from({ length: G }, () => new Set<number>());
  const idx = geo.index!.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = group[idx[t]], b = group[idx[t + 1]], c = group[idx[t + 2]];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  // garment mask in bind pose (female rig: pelvis ~0.93 m, neck ~1.48 m, shoulders |x|~0.15)
  const w = new Float32Array(G);
  for (let g = 0; g < G; g++) {
    const x = Math.abs(gp[g * 3]), y = gp[g * 3 + 1];
    const torso = sstep(0.85, 0.9, y) * sstep(1.44, 1.38, y) * sstep(0.22, 0.17, x); // jacket hem ~0.87 m
    const arm = sstep(0.17, 0.22, x) * sstep(0.6, 0.55, x) * sstep(1.3, 1.35, y) * 0.35;
    w[g] = Math.max(torso, arm);
  }
  let cur = Float32Array.from(gp);
  drapeFront(cur, w, 1, 0.96, 0.3);  // front: chest falls straight
  drapeFront(cur, w, -1, 0.86, 0);   // back: hangs from the shoulder blades over the seat
  const next = new Float32Array(cur.length);
  for (let it = 0; it < 40; it++) {
    const f = it % 2 === 0 ? 0.6 : -0.62; // Taubin lambda/mu: smooths without shrinking
    for (let g = 0; g < G; g++) {
      const wg = w[g];
      if (wg <= 0 || adj[g].size === 0) { next[g * 3] = cur[g * 3]; next[g * 3 + 1] = cur[g * 3 + 1]; next[g * 3 + 2] = cur[g * 3 + 2]; continue; }
      let sx = 0, sy = 0, sz = 0;
      for (const o of adj[g]) { sx += cur[o * 3]; sy += cur[o * 3 + 1]; sz += cur[o * 3 + 2]; }
      const c = adj[g].size;
      next[g * 3] = cur[g * 3] + wg * f * (sx / c - cur[g * 3]);
      next[g * 3 + 1] = cur[g * 3 + 1] + wg * f * (sy / c - cur[g * 3 + 1]);
      next[g * 3 + 2] = cur[g * 3 + 2] + wg * f * (sz / c - cur[g * 3 + 2]);
    }
    cur.set(next);
  }
  // group normals from the smoothed surface
  const gn = new Float32Array(G * 3);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const a = group[idx[t]], b = group[idx[t + 1]], c = group[idx[t + 2]];
    va.fromArray(cur, a * 3); vb.fromArray(cur, b * 3); vc.fromArray(cur, c * 3);
    e1.subVectors(vb, va); e2.subVectors(vc, va); e1.cross(e2);
    for (const g of [a, b, c]) { gn[g * 3] += e1.x; gn[g * 3 + 1] += e1.y; gn[g * 3 + 2] += e1.z; }
  }
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  const nv = new THREE.Vector3(), on = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const g = group[i];
    pos[i * 3] = cur[g * 3]; pos[i * 3 + 1] = cur[g * 3 + 1]; pos[i * 3 + 2] = cur[g * 3 + 2];
    on.set(Nrm.getX(i), Nrm.getY(i), Nrm.getZ(i));
    nv.set(gn[g * 3], gn[g * 3 + 1], gn[g * 3 + 2]).normalize();
    if (nv.dot(on) < 0) nv.negate();
    on.lerp(nv, w[g]).normalize();
    nor[i * 3] = on.x; nor[i * 3 + 1] = on.y; nor[i * 3 + 2] = on.z;
  }
  return { p: new THREE.BufferAttribute(pos, 3), n: new THREE.BufferAttribute(nor, 3) };
}

/**
 * Fabric bridges the body's concavities: per vertical strip of the torso (front or back) the
 * side profile is replaced by its upper convex hull (so the jacket falls straight
 * from the chest), and the bust bump above the hull's chord is softened.
 */
function drapeFront(cur: Float32Array, w: Float32Array, side: 1 | -1, Y0: number, flatten: number) {
  const G = cur.length / 3, BX = 0.02, KX = 7, NB = KX * 2 + 1;
  const Y1 = 1.44, BY = 0.01, NY = Math.round((Y1 - Y0) / BY) + 1;
  const zmax = new Float32Array(NB * NY).fill(-1);
  for (let g = 0; g < G; g++) {
    const x = cur[g * 3], y = cur[g * 3 + 1], z = cur[g * 3 + 2] * side;
    if (z <= 0) continue;
    const k = Math.round(x / BX) + KX, j = Math.round((y - Y0) / BY);
    if (k < 0 || k >= NB || j < 0 || j >= NY) continue;
    if (z > zmax[k * NY + j]) zmax[k * NY + j] = z;
  }
  const disp = new Float32Array(NB * NY), prof = new Float32Array(NB * NY);
  for (let k = 0; k < NB; k++) {
    const row = zmax.subarray(k * NY, k * NY + NY);
    const pts: number[] = [];
    for (let j = 0; j < NY; j++) if (row[j] > 0) pts.push(j);
    if (pts.length < 4) continue;
    // fill empty bins
    for (let j = 0; j < NY; j++) if (row[j] <= 0) {
      let a = -1, b = -1;
      for (const q of pts) { if (q < j) a = q; else if (b < 0) b = q; }
      row[j] = a < 0 ? row[b] : b < 0 ? row[a] : row[a] + (row[b] - row[a]) * (j - a) / (b - a);
    }
    // upper hull of (j, z)
    const hull: number[] = [];
    for (let j = 0; j < NY; j++) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2], b = hull[hull.length - 1];
        if ((b - a) * (row[j] - row[a]) - (j - a) * (row[b] - row[a]) >= 0) hull.pop(); else break;
      }
      hull.push(j);
    }
    for (let h = 0; h < hull.length - 1; h++) {
      const a = hull[h], b = hull[h + 1];
      for (let j = a; j <= b; j++) prof[k * NY + j] = row[a] + (row[b] - row[a]) * (j - a) / Math.max(1, b - a);
    }
    const h0 = prof[k * NY], h1 = prof[k * NY + NY - 1];
    for (let j = 0; j < NY; j++) {
      const H = prof[k * NY + j], L = h0 + (h1 - h0) * j / (NY - 1);
      const P = H - (H - L) * flatten;
      disp[k * NY + j] = Math.max(-0.035, Math.min(0.035, P - row[j]));
      prof[k * NY + j] = row[j];
    }
  }
  const at = (a: Float32Array, x: number, y: number) => {
    const fx = Math.max(0, Math.min(NB - 1.001, x / BX + KX)), fy = Math.max(0, Math.min(NY - 1.001, (y - Y0) / BY));
    const k = Math.floor(fx), j = Math.floor(fy), tx = fx - k, ty = fy - j;
    const v = (kk: number, jj: number) => a[kk * NY + jj];
    return (v(k, j) * (1 - tx) + v(k + 1, j) * tx) * (1 - ty) + (v(k, j + 1) * (1 - tx) + v(k + 1, j + 1) * tx) * ty;
  };
  for (let g = 0; g < G; g++) {
    const x = cur[g * 3], y = cur[g * 3 + 1], z = cur[g * 3 + 2] * side;
    if (z <= 0 || y < Y0 || y > Y1 || Math.abs(x) > 0.14) continue;
    const front = at(prof, x, y);
    if (front <= 0) continue;
    const wt = sstep(0.1, 0.13, Math.abs(x)) * sstep(Y0, Y0 + 0.04, y) * sstep(Y1, Y1 - 0.04, y) * sstep(0.35, 0.85, z / front);
    if (wt <= 0) continue;
    cur[g * 3 + 2] = (z + at(disp, x, y) * wt) * side;
    w[g] = Math.max(w[g], wt);
  }
}

type PState ='normal' | 'reload' | 'melee' | 'shoot' | 'heal' | 'interact' | 'hurt' | 'down' | 'grabbed' | 'dead' | 'locked' | 'throw';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export class Player implements PlayerLike {
  human!: Human; anim!: Animator;
  root = new THREE.Group();
  pos = this.root.position;
  yaw = 0; vel = new THREE.Vector3();
  hp = 100; maxHp = 100; stamina = 100; staminaLock = false; staminaDelay = 0;
  crouching = false; running = false; dead = false;
  state: PState = 'normal'; stateT = 0;
  inv = new Inventory();
  flashOn = true;
  flash: THREE.SpotLight; flashTarget = new THREE.Object3D(); flashFill: THREE.PointLight;
  grabbedBy: any = null; struggle = 0; grabDmgT = 0; grabKnifeT = 0;
  invulnerable = 0;
  fireCd = 0; spread = 0; recoil = 0;
  stepDist = 0; moveAmount = 0;
  weaponHolder = new THREE.Group();
  weapons = new Map<string, THREE.Object3D>();
  muzzle = new THREE.Object3D();
  level: Level | null = null;
  bake = new THREE.Color();
  adrenalineT = 0;
  limp = 0;
  aimBlend = 0;
  onFire: (w: WeaponDef, origin: THREE.Vector3) => void = () => {};
  onMelee: (w: WeaponDef) => void = () => {};
  onFlare: () => void = () => {};
  private shootHold = 0;
  private flickT = 0;
  private torch: THREE.Object3D | null = null;

  constructor(private q: QualityPreset) {
    this.flash = new THREE.SpotLight(0xfff1dc, 0, 26, 0.48, 0.55, 1.4);
    this.flash.castShadow = q.shadows;
    this.flash.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    this.flash.shadow.camera.near = 0.3; this.flash.shadow.camera.far = 26;
    this.flash.shadow.bias = -0.0008; this.flash.shadow.normalBias = 0.03;
    this.flash.target = this.flashTarget;
    this.flashFill = new THREE.PointLight(0xc8d4e0, 0.0, 6, 2); // soft fill so the player never stands in pure black
  }

  async init(scene: THREE.Scene) {
    this.human = await createHuman({ sex: 'f', variant: 'player', hair: 'long', hairColor: 0x2b1b12, hairCap: true, eyes: 'normal', glow: 0 });
    this.inflateClothes(this.human.body);
    this.human.bodyMat.color.setScalar(1.12); // keep Ela readable in very dark scenes
    this.root.add(this.human.root);
    this.anim = new Animator(this.human.model);
    this.anim.onFinished((n) => this.onAnimDone(n));
    this.anim.full('Idle_Loop', { fade: 0 });
    scene.add(this.root, this.flash, this.flashTarget, this.flashFill);
    // weapons
    const hand = this.anim.bone('hand_r')!;
    hand.add(this.weaponHolder);
    const mk = (name: string, s: number) => { const pg = assets.prop('items', name); const m = new THREE.Mesh(pg ? pg.geometry : new THREE.BoxGeometry(0.05, 0.15, 0.25), dynamicPropMaterial()); m.scale.setScalar(s); m.castShadow = true; return m; };
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.55, metalness: 0.75 }));
    pipe.castShadow = true;
    const pistol = mk('W_Pistol', 1.0), shotgun = mk('Shotgun_1', 0.8);
    const g = (o: THREE.Object3D, p: number[], r: number[]) => { const h = new THREE.Group(); h.add(o); h.position.set(p[0], p[1], p[2]); h.rotation.set(r[0], r[1], r[2]); h.visible = false; this.weaponHolder.add(h); return h; };
    this.weapons.set('pipe', g(pipe, [0.0, 0.09, 0.03], [0, 0, 0]));
    this.weapons.set('pistol', g(pistol, [0.0, 0.07, 0.03], [0, Math.PI / 2, -Math.PI / 2]));
    this.weapons.set('shotgun', g(shotgun, [0.0, 0.08, 0.05], [0, Math.PI / 2, -Math.PI / 2]));
    this.weapons.get('pistol')!.add(this.muzzle); this.muzzle.position.set(0, 0.25, 0.04);
    // shoulder lamp
    const tp = assets.prop('items', 'Torch');
    const spine = this.anim.bone('spine_03');
    if (tp && spine) {
      const t = new THREE.Mesh(tp.geometry, dynamicPropMaterial());
      t.scale.setScalar(0.8); t.rotation.set(Math.PI / 2, 0, 0); t.position.set(0.09, 0.12, 0.13);
      spine.add(t); this.torch = t;
    }
  }

  /** Gives painted clothes some thickness so they read as garments, not skin. */
  private inflateClothes(mesh: THREE.SkinnedMesh) {
    const geo = mesh.geometry;
    const raw = geo.attributes.position as THREE.BufferAttribute, n0 = geo.attributes.normal as THREE.BufferAttribute;
    // Compressed meshes are stored in a normalised frame (quantisation is folded into
    // the inverse bind matrices). Map to the known bind-pose frame in metres
    // (female base body: y -0.008..1.767, z -0.162..0.14), work there, map back.
    let mnY = Infinity, mxY = -Infinity, mnZ = Infinity;
    for (let i = 0; i < raw.count; i++) { const y = raw.getY(i); if (y < mnY) mnY = y; if (y > mxY) mxY = y; mnZ = Math.min(mnZ, raw.getZ(i)); }
    const s = 1.775 / (mxY - mnY), oy = -0.008 - mnY * s, oz = -0.162 - mnZ * s;
    const bind = new Float32Array(raw.count * 3);
    for (let i = 0; i < raw.count; i++) { bind[i * 3] = raw.getX(i) * s; bind[i * 3 + 1] = raw.getY(i) * s + oy; bind[i * 3 + 2] = raw.getZ(i) * s + oz; }
    const { p, n } = smoothGarment(geo, new THREE.BufferAttribute(bind, 3), n0);
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x);
      let k = 0;
      if (y > 0.885 && y < 1.47 && ax < 0.6) k = 0.014;          // jacket torso + arms (hem ~0.87 m)
      if (y > 1.36 && y < 1.47 && ax > 0.17 && ax < 0.58) k = 0.012;
      if (y <= 0.885 && y > 0.17) k = 0.007;                       // trousers
      if (y <= 0.17) k = 0.011;                                    // boots
      if (y > 1.4 && ax < 0.08 && z > 0) k = 0;                    // neck/collar opening
      // back to the mesh's own frame
      arr[i * 3] = (x + n.getX(i) * k) / s; arr[i * 3 + 1] = (y + n.getY(i) * k - oy) / s; arr[i * 3 + 2] = (z + n.getZ(i) * k - oz) / s;
    }
    const g2 = geo.clone();
    g2.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g2.setAttribute('normal', n);
    g2.boundingSphere = geo.boundingSphere;
    mesh.geometry = g2;
  }

  get weapon(): WeaponDef | null { return this.inv.equipped ? ITEMS[this.inv.equipped]?.weapon || null : null; }
  get firearm() { const w = this.weapon; return !!w && w.type !== 'melee'; }
  get aiming() { return this.firearm && input.aiming && !this.dead && ['normal', 'shoot', 'hurt'].includes(this.state) && !this.grabbedBy; }

  setLevel(l: Level) { this.level = l; }

  spawn(pos: THREE.Vector3, yaw: number) {
    this.pos.copy(pos); this.yaw = yaw; this.root.rotation.y = yaw; this.vel.set(0, 0, 0);
    this.state = 'normal'; this.grabbedBy = null; this.updateWeaponVisual();
  }

  equip(id: string) {
    if (!this.inv.weapons.includes(id)) return;
    this.inv.equipped = id; this.updateWeaponVisual(); bus.emit('inv'); audio.proc?.click(600, 0.08);
  }
  cycleWeapon() {
    const w = this.inv.weapons; if (!w.length) return;
    const i = w.indexOf(this.inv.equipped);
    this.equip(w[(i + 1) % w.length]);
  }
  updateWeaponVisual() { for (const [k, o] of this.weapons) o.visible = k === this.inv.equipped; }

  litLevel() {
    const l = this.bake.r * 0.3 + this.bake.g * 0.59 + this.bake.b * 0.11;
    return Math.min(1, l * 6 + (this.flashOn && this.inv.battery > 0.02 ? 0.45 : 0));
  }

  // ------------------------------------------------------------- update --
  update(dt: number, rig: CameraRig, controlsEnabled: boolean) {
    this.stateT += dt; this.fireCd -= dt; this.invulnerable -= dt; this.adrenalineT -= dt;
    this.spread = Math.max(0, this.spread - dt * 0.08); this.recoil = Math.max(0, this.recoil - dt * 0.6);
    const lvl = this.level!;
    lvl.baker.sample(this.pos.x, this.pos.z, this.bake);
    const bm = this.human.bodyMat.userData.bake.value as THREE.Color; bm.copy(this.bake).multiplyScalar(1.3);
    if (this.dead) { this.anim.update(dt); this.updateFlash(dt, rig); return; }

    const allow = controlsEnabled && !['down', 'grabbed', 'locked', 'dead'].includes(this.state);
    // crouch toggle
    if (allow && input.wasPressed('crouch')) { this.crouching = !this.crouching; input.crouchToggled = this.crouching; }
    if (allow && input.wasPressed('flashlight')) this.toggleFlash();
    if (allow && input.wasPressed('switch')) this.cycleWeapon();

    // ---- movement
    let mx = allow ? input.move.x : 0, my = allow ? input.move.y : 0;
    const mag = Math.min(1, Math.hypot(mx, my));
    const aiming = this.aiming;
    const busy = ['reload', 'heal', 'interact', 'melee', 'hurt', 'throw'].includes(this.state);
    let wantRun = allow && (input.running || mag > 0.97) && !aiming && !this.crouching && mag > 0.5;
    if (this.staminaLock) wantRun = false;
    if (this.limp > 0) wantRun = false;
    this.running = wantRun && this.adrenalineT <= 0 ? this.stamina > 0 : wantRun;
    let speed = 0;
    if (mag > 0.08) {
      const base = this.crouching ? 1.05 : aiming ? 1.25 : mag < 0.6 ? 1.6 : 3.1;
      speed = this.running ? 4.7 : base * Math.min(1, mag / 0.6 + 0.2);
      if (busy) speed *= this.state === 'heal' || this.state === 'reload' ? 0.45 : 0.25;
      if (this.hp < 25) speed *= 0.82;
    }
    // stamina
    if (this.running && speed > 3 && this.adrenalineT <= 0) { this.stamina -= dt * 17; this.staminaDelay = 1.1; if (this.stamina <= 0) { this.stamina = 0; this.staminaLock = true; audio.play('p_breath', { volume: 0.5 }); } }
    else { this.staminaDelay -= dt; if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + dt * 14); if (this.staminaLock && this.stamina > 35) this.staminaLock = false; }

    const camYaw = rig.yaw;
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    // camera-relative: forward = (-sin, -cos)
    const dirX = (mx * cy - my * sy), dirZ = (-mx * sy - my * cy);
    const dl = Math.hypot(dirX, dirZ) || 1;
    const targetVx = (dirX / dl) * speed, targetVz = (dirZ / dl) * speed;
    const acc = speed > this.vel.length() ? 9 : 12;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (targetVz - this.vel.z) * Math.min(1, dt * acc);
    if (['down', 'grabbed', 'dead', 'locked'].includes(this.state)) this.vel.multiplyScalar(0.0);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    lvl.grid.collide(this.pos, 0.3);
    const v = Math.hypot(this.vel.x, this.vel.z);
    this.moveAmount = v;

    // ---- facing
    if (aiming || this.state === 'shoot') {
      this.turnTo(camYaw, dt, 14);
    } else if (v > 0.2 && !['down', 'grabbed'].includes(this.state)) {
      this.turnTo(Math.atan2(-this.vel.x, -this.vel.z), dt, this.running ? 7 : 9);
    }
    this.root.rotation.y = this.yaw;

    // ---- footsteps + noise
    if (v > 0.3) {
      this.stepDist += v * dt;
      const stride = this.running ? 1.05 : this.crouching ? 0.6 : v > 2.5 ? 0.9 : 0.72;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const surf = lvl.grid.stepSurface(this.pos.x, this.pos.z);
        const vol = this.crouching ? 0.22 : this.running ? 0.75 : v > 2.5 ? 0.55 : 0.4;
        audio.play('st_' + (surf === 'water' ? 'dirt' : surf), { volume: vol, rate: surf === 'water' ? 0.8 : 1, vary: 0.08 });
        const r = this.crouching ? 0.9 : this.running ? 11 : v > 2.5 ? 6.5 : 3.2;
        noise.emit(this.pos, r * (surf === 'metal' ? 1.3 : surf === 'wood' ? 1.15 : 1), 'step');
      }
    }

    // ---- actions
    if (allow) this.handleActions(dt, rig, aiming);
    this.handleGrab(dt);

    // ---- animation
    this.animate(dt, v, aiming, rig);
    this.updateFlash(dt, rig);
    if (this.recoil > 0) rig.pitch += this.recoil * dt * 3.5;
  }

  private turnTo(target: number, dt: number, rate: number) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  private handleActions(dt: number, rig: CameraRig, aiming: boolean) {
    const w = this.weapon;
    const busy = ['reload', 'heal', 'interact', 'melee', 'hurt', 'throw', 'down'].includes(this.state);
    if (input.wasPressed('reload') && this.firearm && !busy) this.startReload();
    if (input.wasPressed('heal') && !busy) this.useBestHeal();
    if (input.wasPressed('flare') && !busy) this.throwFlare();
    if (input.isDown('fire')) this.shootHold += dt; else this.shootHold = 0;
    if (input.wasPressed('fire') && !busy && w) {
      if (w.type === 'melee' || (!this.firearm)) this.startMelee();
      else if (aiming || !input.touchActive) {
        if (this.fireCd <= 0) this.shoot(w, rig);
      }
    }
    if (this.state === 'shoot' && this.stateT > 0.35) this.state = 'normal';
  }

  shoot(w: WeaponDef, rig: CameraRig) {
    const id = this.inv.equipped;
    if ((this.inv.mags[id] ?? 0) <= 0) {
      audio.play('dry_fire', { volume: 0.7 });
      this.fireCd = 0.35;
      if (this.inv.reserveAmmo(id) > 0) this.startReload();
      else bus.emit('toast', settings.data.language === 'tr' ? 'Cephane yok' : 'Out of ammo');
      return;
    }
    this.inv.mags[id]--;
    this.fireCd = w.fireDelay;
    this.state = 'shoot'; this.stateT = 0;
    this.anim.arms('Pistol_Shoot', { fade: 0.04, loop: false, speed: w.type === 'shotgun' ? 1.0 : 1.6 });
    const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
    if (w.type === 'shotgun') muzzlePos.addScaledVector(rig.forward(tmp), 0.35);
    this.onFire(w, muzzlePos);
    audio.play(w.type === 'shotgun' ? 'shotgun' : 'pistol', { volume: w.type === 'shotgun' ? 1 : 0.9, vary: 0.04, priority: 3 });
    if (w.type === 'shotgun') audio.play('shotgun_pump', { volume: 0.6, delay: 0.45 });
    noise.emit(this.pos, w.noise, 'shot');
    rig.shake(w.type === 'shotgun' ? 0.45 : 0.22);
    this.recoil += w.recoil; this.spread = Math.min(0.08, this.spread + w.recoil * 0.4);
    rig.yaw += (Math.random() - 0.5) * w.recoil * 0.25;
    bus.emit('inv');
    if (settings.data.vibration) vibrate(w.type === 'shotgun' ? 45 : 18);
  }

  startReload() {
    const id = this.inv.equipped, w = this.weapon;
    if (!w || w.type === 'melee') return;
    const need = w.mag - (this.inv.mags[id] ?? 0);
    const have = this.inv.reserveAmmo(id);
    if (need <= 0 || have <= 0) { if (have <= 0) bus.emit('toast', settings.data.language === 'tr' ? 'Yedek cephane yok' : 'No spare ammo'); return; }
    this.state = 'reload'; this.stateT = 0;
    this.anim.arms('Pistol_Reload', { fade: 0.15, loop: false, speed: 2.1 / w.reload * 1.0 });
    audio.play('reload', { volume: 0.7, delay: 0.25 });
    if (w.type === 'shotgun') { audio.play('reload', { volume: 0.6, delay: 0.9 }); audio.play('shotgun_pump', { volume: 0.7, delay: w.reload - 0.35 }); }
    noise.emit(this.pos, 2.5, 'reload');
  }

  private finishReload() {
    const id = this.inv.equipped, w = this.weapon!;
    const need = w.mag - (this.inv.mags[id] ?? 0);
    const take = Math.min(need, this.inv.reserveAmmo(id));
    this.inv.remove(w.ammo!, take);
    this.inv.mags[id] = (this.inv.mags[id] ?? 0) + take;
    bus.emit('inv');
  }

  startMelee() {
    const w = ITEMS.pipe.weapon!;
    if (this.fireCd > 0) return;
    this.fireCd = w.fireDelay;
    this.state = 'melee'; this.stateT = 0;
    this.anim.arms(this.inv.equipped === 'pipe' ? 'Sword_Attack' : 'Punch_Cross', { fade: 0.08, loop: false, speed: 1.55 });
    audio.play('swing', { volume: 0.7, delay: 0.12 });
    (this as any)._meleeDone = false;
  }

  useBestHeal() {
    if (this.hp >= this.maxHp) return false;
    const order = this.maxHp - this.hp > 50 ? ['medkit', 'bandage', 'adrenaline'] : ['bandage', 'medkit', 'adrenaline'];
    for (const id of order) if (this.inv.count(id) > 0) { this.heal(id); return true; }
    bus.emit('toast', settings.data.language === 'tr' ? 'İyileştirici yok' : 'Nothing to heal with');
    return false;
  }

  heal(id: string) {
    if (!this.inv.remove(id, 1)) return;
    this.state = 'heal'; this.stateT = 0;
    this.anim.arms('Consume', { fade: 0.15, loop: false, speed: 1.6 });
    audio.play('bandage', { volume: 0.7 });
    (this as any)._healAmount = ITEMS[id].heal || 25;
    if (id === 'adrenaline') this.adrenalineT = 20;
  }

  throwFlare() {
    if (!this.inv.remove('flare', 1)) { bus.emit('toast', settings.data.language === 'tr' ? 'İşaret fişeği yok' : 'No flares'); return; }
    this.state = 'throw'; this.stateT = 0;
    this.anim.arms('OverhandThrow', { fade: 0.1, loop: false, speed: 1.5 });
    (this as any)._thrown = false;
  }

  playInteract(kind: 'low' | 'mid' = 'mid') {
    if (this.dead || this.grabbedBy) return;
    this.state = 'interact'; this.stateT = 0;
    this.anim.arms(kind === 'low' ? 'PickUp_Table' : 'Interact', { fade: 0.12, loop: false, speed: 1.8 });
  }

  toggleFlash() {
    this.flashOn = !this.flashOn;
    audio.proc?.click(this.flashOn ? 1900 : 1300, 0.15, 0.03);
    noise.emit(this.pos, 0.8, 'click');
  }

  private onAnimDone(name: string) {
    if (this.dead) return;
    if (this.state === 'reload') this.finishReload();
    if (this.state === 'heal') { this.hp = Math.min(this.maxHp, this.hp + ((this as any)._healAmount || 25)); bus.emit('hp', this.hp, 'heal'); }
    if (this.state === 'down') { this.state = 'normal'; this.anim.full('Idle_Loop', { fade: 0.3 }); return; }
    if (['reload', 'heal', 'interact', 'melee', 'shoot', 'hurt', 'throw'].includes(this.state)) this.state = 'normal';
  }

  // -------------------------------------------------------------- damage --
  damage(amount: number, from: THREE.Vector3, opts: { knock?: boolean; kind?: string } = {}) {
    if (this.dead || this.invulnerable > 0) return;
    this.hp -= amount;
    this.invulnerable = 0.45;
    bus.emit('hp', this.hp, 'hit', amount);
    audio.play('p_hurt', { volume: 0.9, priority: 3 });
    audio.play('hit', { volume: 0.7 });
    if (settings.data.vibration) vibrate(60);
    if (this.hp <= 0) { this.hp = 0; this.die(); return; }
    tmp.subVectors(this.pos, from).setY(0).normalize();
    this.vel.addScaledVector(tmp, opts.knock ? 4 : 1.6);
    if (opts.knock) { this.state = 'down'; this.stateT = 0; this.anim.full('Hit_Knockback', { fade: 0.08, loop: false, speed: 1.1 }); this.invulnerable = 1.4; }
    else if (!['reload', 'heal'].includes(this.state)) { this.state = 'hurt'; this.stateT = 0; this.anim.arms(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { fade: 0.05, loop: false, speed: 1.4 }); }
    this.limp = this.hp < 25 ? 1 : 0;
  }

  startGrab(enemy: any): boolean {
    if (this.dead || this.grabbedBy || this.invulnerable > 0 || this.state === 'down') return false;
    this.grabbedBy = enemy; this.state = 'grabbed'; this.stateT = 0;
    this.struggle = 1; this.grabDmgT = 0.6;
    this.anim.full('Push_Loop', { fade: 0.1, speed: 1.4 });
    tmp.subVectors(enemy.pos, this.pos); this.yaw = Math.atan2(-tmp.x, -tmp.z);
    audio.play('z_attack', { pos: enemy.pos.clone().setY(1.6), volume: 1, priority: 3 });
    this.grabKnifeT = this.inv.count('knife') > 0 ? 0.55 : -1;
    bus.emit('grab', true, this.grabKnifeT > 0);
    return true;
  }

  releaseGrab(pushEnemy = true) {
    const e = this.grabbedBy;
    this.grabbedBy = null;
    if (this.state === 'grabbed') { this.state = 'normal'; this.anim.full('Idle_Loop', { fade: 0.2 }); }
    this.invulnerable = 1.2;
    bus.emit('grab', false);
    if (e && pushEnemy) { e.attackCd = 2.5; if (e.state === 'grab') e.set('stagger'); }
  }

  private handleGrab(dt: number) {
    if (this.state !== 'grabbed' || !this.grabbedBy) return;
    const e = this.grabbedBy;
    if (e.state === 'dead' || e.state === 'stagger' || e.state === 'down') { this.releaseGrab(false); return; }
    if (this.grabKnifeT > 0) {
      this.grabKnifeT -= dt;
      if (this.grabKnifeT <= 0) {
        this.inv.remove('knife', 1);
        audio.play('stab', { volume: 1 });
        const dir = new THREE.Vector3().subVectors(e.pos, this.pos).normalize();
        e.damage(55, dir, 'body', 1, 0.9, e.pos.clone().setY(1.3));
        bus.emit('toast', settings.data.language === 'tr' ? 'Çakıyla kurtuldun' : 'You stabbed your way free');
        this.releaseGrab(true);
      }
      return;
    }
    if (input.wasPressed('interact') || input.wasPressed('fire') || input.wasPressed('aim')) { this.struggle -= 0.16; audio.proc?.click(300, 0.05, 0.03); }
    this.struggle = Math.min(1, this.struggle + dt * 0.08);
    this.grabDmgT -= dt;
    if (this.grabDmgT <= 0) { this.grabDmgT = 1.0; this.damageRaw(9); audio.play('z_attack', { pos: e.pos.clone().setY(1.6), volume: 0.8 }); }
    if (this.struggle <= 0) this.releaseGrab(true);
    bus.emit('struggle', this.struggle);
  }

  private damageRaw(a: number) {
    this.hp -= a; bus.emit('hp', this.hp, 'hit', a); audio.play('p_hurt', { volume: 0.8 });
    if (this.hp <= 0) { this.hp = 0; this.releaseGrab(false); this.die(); }
  }

  die() {
    if (this.dead) return;
    this.dead = true; this.state = 'dead';
    this.anim.full('Death01', { fade: 0.15, loop: false });
    audio.play('p_death', { volume: 1, priority: 5 });
    bus.emit('player:dead');
  }

  revive() { this.dead = false; this.hp = this.maxHp; this.state = 'normal'; this.grabbedBy = null; this.anim.full('Idle_Loop', { fade: 0 }); }

  // ------------------------------------------------------------ animation --
  private animate(dt: number, v: number, aiming: boolean, rig: CameraRig) {
    const st = this.state;
    if (st === 'down' || st === 'grabbed' || st === 'dead') { this.anim.update(dt); return; }
    // lower body locomotion
    let legs = 'Idle_Loop', rate = 1;
    if (this.crouching) { legs = v > 0.2 ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop'; rate = Math.max(0.6, v / 1.05); }
    else if (v > 3.6) { legs = 'Sprint_Loop'; rate = v / 4.7; }
    else if (v > 2.0) { legs = 'Jog_Fwd_Loop'; rate = v / 3.1; }
    else if (v > 0.2) { legs = 'Walk_Loop'; rate = Math.max(0.55, v / 1.45); }
    else if (this.firearm) legs = 'Pistol_Idle_Loop';
    // aim strafing: play walk backwards when moving away from facing
    let backwards = false;
    if (aiming && v > 0.2) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dot = (this.vel.x * fx + this.vel.z * fz) / v;
      if (dot < -0.3) backwards = true;
    }
    const l = this.anim.legs(legs, { fade: 0.22, speed: rate * (backwards ? -1 : 1) });
    if (l) l.timeScale = rate * (backwards ? -1 : 1);
    // upper body
    const busy = ['reload', 'heal', 'interact', 'melee', 'shoot', 'hurt', 'throw'].includes(st);
    if (!busy) {
      if (aiming) this.anim.arms('Pistol_Aim_Neutral', { fade: 0.12 });
      else if (this.firearm && v < 3.6) this.anim.arms(v > 0.2 && !this.crouching ? 'Pistol_Idle_Loop' : 'Pistol_Idle_Loop', { fade: 0.25 });
      else this.anim.arms(legs, { fade: 0.25, sync: true, speed: rate });
    }
    // melee hit frame
    if (st === 'melee' && !(this as any)._meleeDone && this.stateT > 0.28) { (this as any)._meleeDone = true; this.onMelee(ITEMS.pipe.weapon!); }
    if (st === 'throw' && !(this as any)._thrown && this.stateT > 0.42) { (this as any)._thrown = true; this.onFlare(); }
    this.anim.update(dt);
    // procedural: aim pitch + lower-body twist toward movement while aiming
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 10);
    if (this.aimBlend > 0.01) {
      const sp = this.anim.bone('spine_03'), sp2 = this.anim.bone('spine_02');
      const pitch = -rig.pitch * this.aimBlend;
      if (sp) sp.rotateX(pitch * 0.55);
      if (sp2) sp2.rotateX(pitch * 0.35);
      if (v > 0.2 && !backwards) {
        const mv = Math.atan2(-this.vel.x, -this.vel.z);
        let d = mv - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        d = THREE.MathUtils.clamp(d, -1.1, 1.1) * this.aimBlend;
        const pel = this.anim.bone('pelvis'), s1 = this.anim.bone('spine_01');
        if (pel) pel.rotateY(d);
        if (s1) s1.rotateY(-d * 0.6);
        if (sp2) sp2.rotateY(-d * 0.4);
      }
    }
  }

  private updateFlash(dt: number, rig: CameraRig) {
    const inv = this.inv;
    if (this.flashOn && !this.dead) inv.battery = Math.max(0, inv.battery - dt / 540);
    let I = 0;
    if (this.flashOn) {
      const b = inv.battery;
      I = b > 0.2 ? 1 : b > 0.02 ? 0.5 + b * 2.5 : 0.18;
      if (b < 0.2) {
        this.flickT -= dt;
        if (this.flickT <= 0) { this.flickT = 0.05 + Math.random() * (b < 0.05 ? 0.3 : 1.2); (this as any)._fl = Math.random() < (b < 0.05 ? 0.5 : 0.2) ? 0.15 : 1; }
        I *= (this as any)._fl ?? 1;
      }
    }
    // beam origin: chest lamp; direction: camera aim (smoothed)
    const sp = this.anim.bone('spine_03');
    const origin = sp ? sp.getWorldPosition(tmp) : tmp.copy(this.pos).setY(1.4);
    origin.y += 0.08;
    const fwd = rig.forward(tmp2);
    if (!this.aiming && this.moveAmount > 0.4 && rig.aim < 0.2) {
      // when walking unaimed, bias the beam to the body facing, slightly down
      const bx = -Math.sin(this.yaw), bz = -Math.cos(this.yaw);
      fwd.x = fwd.x * 0.6 + bx * 0.4; fwd.z = fwd.z * 0.6 + bz * 0.4; fwd.y = Math.min(fwd.y, 0.05) - 0.08;
      fwd.normalize();
    }
    const cur = this.flashTarget.position.clone().sub(this.flash.position).normalize();
    if (!isFinite(cur.x) || cur.lengthSq() < 0.5) cur.copy(fwd);
    cur.lerp(fwd, Math.min(1, dt * 12)).normalize();
    this.flash.position.copy(origin).addScaledVector(fwd, 0.15);
    this.flashTarget.position.copy(this.flash.position).addScaledVector(cur, 6);
    this.flash.intensity = I * 75;
    // soft "character light" between camera and player keeps Ela readable in the dark
    const chest = tmp.copy(this.pos).setY(this.crouching ? 1.0 : 1.4);
    const back = tmp2.copy(rig.pos).sub(chest).setY(0).normalize();
    this.flashFill.position.copy(chest).addScaledVector(back, 1.15); this.flashFill.position.y += 0.45;
    this.flashFill.distance = 5;
    this.flashFill.intensity = 4.5;
  }
}
