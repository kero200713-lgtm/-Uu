import * as THREE from 'three';
import type { WeaponDef } from '../items/ItemDefs';
import type { Enemy } from '../enemies/Enemy';
import type { Level } from '../world/Level';
import { BLOCK_SIGHT } from '../world/Grid';
import type { FX } from './FX';
import { audio } from '../audio/AudioEngine';
import { settings } from '../core/Settings';
import { bus } from '../core/Events';
import type { CameraRig } from '../player/CameraRig';

const tmp = new THREE.Vector3();

export interface CombatCtx { level: Level; enemies: Enemy[]; fx: FX; rig: CameraRig; cam: THREE.PerspectiveCamera; playerPos: THREE.Vector3; spread: number }

/** Hitscan from the camera through the crosshair; bullets visually leave the muzzle. */
export function fireWeapon(c: CombatCtx, w: WeaponDef, muzzle: THREE.Vector3) {
  const origin = c.cam.position.clone();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.cam.quaternion);
  const startT = Math.max(0, origin.distanceTo(c.playerPos) - 0.2);
  c.fx.muzzleFlash(muzzle, w.type === 'shotgun');
  let anyHit = false, killed = false, head = false;
  const hitEnemies = new Map<Enemy, { dmg: number; part: 'head' | 'body'; at: THREE.Vector3 }>();
  for (let i = 0; i < w.pellets; i++) {
    const sp = w.spread + c.spread;
    const dir = fwd.clone();
    if (sp > 0) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.cam.quaternion);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp;
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const o = origin.clone().addScaledVector(dir, startT);
    // world: grid walls / props (2D) + floor/ceiling plane
    const horiz = Math.hypot(dir.x, dir.z) || 1e-6;
    let wallT = c.level.grid.raycast(o.x, o.z, dir.x, dir.z, w.range * horiz, BLOCK_SIGHT, true);
    let tWorld = wallT >= 0 ? wallT / horiz : w.range;
    let normal = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
    if (dir.y < -0.01) { const tf = -o.y / dir.y; if (tf < tWorld) { tWorld = tf; normal.set(0, 1, 0); } }
    const ceil = c.level.grid.indoorAt(o.x, o.z) ? (c.level.def.ceiling ?? 3) : 50;
    if (dir.y > 0.01) { const tc = (ceil - o.y) / dir.y; if (tc < tWorld) { tWorld = tc; normal.set(0, -1, 0); } }
    // enemies
    let best: { e: Enemy; t: number; part: 'head' | 'body' } | null = null;
    for (const e of c.enemies) {
      const h = e.hitTest(o, dir, tWorld);
      if (h && (!best || h.t < best.t)) best = { e, t: h.t, part: h.part };
    }
    if (best) {
      const at = o.clone().addScaledVector(dir, best.t);
      const falloff = w.type === 'shotgun' ? Math.max(0.25, 1 - best.t / w.range) : 1;
      const prev = hitEnemies.get(best.e);
      const dmg = w.damage * falloff;
      if (prev) { prev.dmg += dmg; if (best.part === 'head') prev.part = 'head'; }
      else hitEnemies.set(best.e, { dmg, part: best.part, at });
    } else if (tWorld < w.range) {
      const at = o.clone().addScaledVector(dir, tWorld);
      if (i % 2 === 0) c.fx.sparks(at, normal, w.type === 'shotgun' ? 4 : 9);
      if (i === 0) audio.play('impact', { pos: at, volume: 0.6 });
    }
  }
  for (const [e, h] of hitEnemies) {
    anyHit = true; if (h.part === 'head') head = true;
    const k = e.damage(h.dmg, fwd, h.part, w.stagger, w.knockdown, h.at);
    if (k) killed = true;
    audio.play('hit', { pos: h.at, volume: 0.8 });
  }
  if (anyHit) bus.emit('hitmarker', killed, head);
}

/** Short-range swing hitting everything in a frontal arc. */
export function meleeSwing(c: CombatCtx, w: WeaponDef, yaw: number) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let hit = false;
  for (const e of c.enemies) {
    if (e.state === 'dead' || e.state === 'dormant') continue;
    tmp.subVectors(e.pos, c.playerPos); tmp.y = 0;
    const d = tmp.length();
    if (d > w.range + 0.3) continue;
    const cos = (tmp.x * fx + tmp.z * fz) / (d || 1);
    if (cos < 0.45 && d > 0.8) continue;
    const dir = tmp.clone().normalize();
    e.damage(w.damage, dir, 'body', w.stagger, w.knockdown, e.pos.clone().setY(1.3));
    hit = true;
  }
  // (the swing whoosh itself is played by the player when the swing starts)
  if (hit) { audio.play('hit', { volume: 0.9 }); c.rig.shake(0.18); bus.emit('hitmarker', false, false); bus.emit('hitstop', 0.07); }
}

/** Melee helper: turn toward the closest enemy roughly in front, so a swing on a touch screen connects. */
export function meleeFacing(c: CombatCtx, yaw: number): number {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = Infinity, out = yaw;
  for (const e of c.enemies) {
    if (e.state === 'dead' || e.state === 'dormant' || !e.root.visible) continue;
    tmp.subVectors(e.pos, c.playerPos); tmp.y = 0;
    const d = tmp.length();
    if (d > 2.8 || d < 0.05) continue;
    if ((tmp.x * fx + tmp.z * fz) / d < 0.2) continue; // only enemies in the front half
    if (d < best) { best = d; out = Math.atan2(-tmp.x, -tmp.z); }
  }
  return out;
}

/**
 * Mobile aim assist: when aiming, gently steer the camera toward the nearest
 * visible enemy close to the crosshair. Can be disabled in settings.
 */
export function aimAssist(c: CombatCtx, dt: number, justStarted: boolean) {
  if (!settings.data.aimAssist) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.cam.quaternion);
  let best: { e: Enemy; ang: number; p: THREE.Vector3 } | null = null;
  for (const e of c.enemies) {
    if (['dead', 'dormant', 'ambush'].includes(e.state) || !e.root.visible) continue;
    const chest = e.anim.bone('spine_03')?.getWorldPosition(new THREE.Vector3());
    if (!chest) continue;
    const to = chest.clone().sub(c.cam.position);
    const d = to.length(); if (d > 28) continue;
    const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(fwd), -1, 1));
    const lim = justStarted ? 0.42 : 0.16;
    if (ang > lim) continue;
    if (!c.level.grid.lineOfSight(c.playerPos, e.pos, true)) continue;
    if (!best || ang < best.ang) best = { e, ang, p: chest };
  }
  if (!best) return;
  const to = best.p.clone().sub(c.cam.position).normalize();
  const wantYaw = Math.atan2(-to.x, -to.z);
  const wantPitch = Math.asin(THREE.MathUtils.clamp(to.y, -1, 1));
  let dy = wantYaw - c.rig.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  const k = justStarted ? 0.85 : Math.min(1, dt * 3.2);
  c.rig.yaw += dy * k;
  c.rig.pitch += (wantPitch - c.rig.pitch) * k * 0.7;
}
