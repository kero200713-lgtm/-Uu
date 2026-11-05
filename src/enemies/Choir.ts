import * as THREE from 'three';
import type { Game } from '../Game';
import { shared } from '../world/Materials';
import { audio } from '../audio/AudioEngine';
import { createHuman } from '../player/CharacterFactory';
import { Animator } from '../player/Animator';
import { noise } from '../combat/Noise';

const NOISE_GLSL = /* glsl */`
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

/**
 * Organic flesh-crystal material: vertex displacement "breathing", glowing
 * veins that pulse with the song, and a dissolve used when it shatters.
 */
function choirMaterial(base: number, veinStrength: number, amp: number, freq = 1) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.35, metalness: 0.1, emissive: 0x5fe8d0, emissiveIntensity: 0.55 });
  const u = { uDissolve: { value: 0 }, uPulse: { value: 0 }, uAmp: { value: amp }, uVein: { value: veinStrength }, uFreq: { value: freq } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u, { uTime: shared.uTime });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uAmp; uniform float uPulse; varying vec3 vObj;\n${NOISE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vObj = position;\n float n = fbm3(position * 0.45 + vec3(0.0, uTime * 0.25, 0.0));\n transformed += normal * (n - 0.45) * uAmp * (1.0 + 0.35 * sin(uTime * 2.2) + uPulse);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uDissolve; uniform float uPulse; uniform float uVein; uniform float uFreq; varying vec3 vObj;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n float dn = fbm3(vObj * 0.8);\n if (dn < uDissolve * 1.1 - 0.05) discard;\n diffuseColor.rgb *= 0.7 + 0.5 * fbm3(vObj * 2.5 * uFreq);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n float v = 1.0 - abs(fbm3(vObj * 3.2 * uFreq + vec3(uTime * 0.05)) - 0.5) * 2.0;\n float aa = fwidth(v);\n float vein = smoothstep(0.9 - aa, 0.99 + aa, v) * (0.09 / (0.09 + 2.0 * aa)) * uVein * 0.8;\n float edge = smoothstep(uDissolve * 1.1 - 0.05, uDissolve * 1.1 + 0.08, dn);\n totalEmissiveRadiance *= vein * (0.6 + 0.4 * sin(uTime * 3.0 - vObj.y * 1.5) + uPulse * 2.0);\n totalEmissiveRadiance += vec3(1.0, 0.9, 0.7) * (1.0 - edge) * step(0.001, uDissolve) * 3.0;`);
  };
  m.customProgramCacheKey = () => 'choir';
  return m;
}

interface Telegraph { pos: THREE.Vector3; t: number; ring: THREE.Mesh; spike: THREE.Mesh | null; hit: boolean }

export class ChoirBoss {
  group = new THREE.Group();
  core!: THREE.Mesh;
  tendrils: THREE.Mesh[] = [];
  mats: THREE.MeshStandardMaterial[] = [];
  center: THREE.Vector3;
  phase = 0;           // resonators shut down
  slamT = 7;
  tele: Telegraph[] = [];
  dissolve = 0; shattering = false; done = false;
  pulse = 0;
  light = new THREE.PointLight(0x5fe8d0, 0, 26, 1.5);
  kemal: any = null;
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private spikeMat: THREE.MeshStandardMaterial;

  constructor(private g: Game, center: THREE.Vector3) {
    this.center = center.clone();
    this.spikeMat = choirMaterial(0x3a4a44, 0.9, 0.08, 0.6);
  }

  async init() {
    const c = this.center;
    // core mass
    const coreMat = choirMaterial(0x41504a, 1.15, 0.9, 0.38);
    this.mats.push(coreMat);
    const geo = new THREE.IcosahedronGeometry(4.2, 5);
    geo.scale(1, 1.25, 1);
    this.core = new THREE.Mesh(geo, coreMat);
    this.core.position.set(c.x, 3.6, c.z);
    this.core.castShadow = false; this.core.receiveShadow = true;
    this.group.add(this.core);
    // gill plates around the core (it "listens")
    const plateMat = choirMaterial(0x6a7a70, 1.1, 0.25, 0.55);
    this.mats.push(plateMat);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const pg = new THREE.CircleGeometry(1.6 + Math.random() * 1.2, 12, 0, Math.PI);
      const p = new THREE.Mesh(pg, plateMat);
      p.position.set(c.x + Math.cos(a) * 3.8, 2.5 + Math.random() * 3.5, c.z + Math.sin(a) * 3.8);
      p.lookAt(c.x + Math.cos(a) * 9, p.position.y + 2, c.z + Math.sin(a) * 9);
      p.rotateZ((Math.random() - 0.5) * 0.8);
      this.group.add(p);
    }
    // tendrils to walls / ceiling
    const tMat = choirMaterial(0x34403c, 0.7, 0.18, 0.28);
    this.mats.push(tMat);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const r = 9 + Math.random() * 12;
      const end = new THREE.Vector3(c.x + Math.cos(a) * r, Math.random() < 0.5 ? 0 : 7 + Math.random() * 3, c.z + Math.sin(a) * r);
      const mid = c.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4));
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(c.x, 3, c.z), mid, end]);
      const tg = new THREE.TubeGeometry(curve, 24, 0.2 + Math.random() * 0.22, 7, false);
      const t = new THREE.Mesh(tg, tMat);
      this.tendrils.push(t); this.group.add(t);
    }
    this.light.position.set(c.x, 5, c.z);
    // a telegraph ring and a spike exist from the start (hidden) so their shaders are
    // compiled with the area, not at the first slam
    const warm = new THREE.Group(); warm.visible = false; warm.name = 'choir_warm';
    warm.add(new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), this.ringMat), new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.5, 7), this.spikeMat));
    this.group.add(warm);
    this.g.scene.add(this.group, this.light);
    // collider (the mass blocks movement and sight)
    this.g.level.grid.addBox(c.x - 4.2, c.z - 4.2, c.x + 4.2, c.z + 4.2, false, true, 'choir');
    // Kemal, fused at the console
    try {
      const h = await createHuman({ sex: 'm', variant: 'hollow_town', hair: 'simpleparted', hairColor: 0x3a3430, eyes: 'dead', glow: 1.4, lod: true, shadow: false });
      const T = this.g.level.T;
      h.root.position.set(16 * T, 0, 3.7 * T);
      h.root.rotation.y = Math.PI;
      const an = new Animator(h.model);
      an.full('Sitting_Idle_Loop', { fade: 0, speed: 0.15 });
      an.update(0.4);
      this.g.scene.add(h.root);
      this.kemal = { h, an };
      const back = new THREE.Vector3(16 * T, 1.0, 3.2 * T);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(c.x, 4, c.z - 2), new THREE.Vector3(c.x - 1, 6, (c.z + back.z) / 2), back]);
      const tub = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.22, 6, false), tMat);
      this.tendrils.push(tub); this.group.add(tub);
    } catch { /* optional */ }
  }

  slamInterval() { return [8, 6.2, 4.8, 3.6][Math.min(3, this.phase)]; }

  update(dt: number) {
    const p = this.g.player;
    const t = shared.uTime.value;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    for (const m of this.mats) { m.userData.u.uPulse.value = this.pulse; m.userData.u.uDissolve.value = this.dissolve; }
    this.spikeMat.userData.u.uPulse.value = this.pulse;
    this.light.intensity = this.done ? 0 : (12 + Math.sin(t * 2.2) * 4 + this.pulse * 25) * (1 - this.dissolve);
    this.kemal?.an.update(dt * 0.2);
    if (this.shattering) {
      this.dissolve = Math.min(1, this.dissolve + dt * 0.18);
      this.core.scale.setScalar(1 + this.dissolve * 0.2);
      if (this.dissolve >= 1 && !this.done) { this.done = true; this.group.visible = false; }
      return;
    }
    // sing: periodic noise that keeps hosts agitated
    if (Math.random() < dt * 0.3) noise.emit(this.center, 6, 'choir', false);
    // slam attacks
    if (!p.dead && this.phase >= 0) {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = this.slamInterval() * (0.8 + Math.random() * 0.4);
        const lead = p.vel.clone().multiplyScalar(0.6);
        const pos = p.pos.clone().add(lead).setY(0.03);
        if (pos.distanceTo(this.center) > 5) this.telegraph(pos);
        if (this.phase >= 2 && Math.random() < 0.5) this.telegraph(p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)).setY(0.03));
      }
    }
    for (const tg of this.tele) {
      tg.t += dt;
      const k = Math.min(1, tg.t / 1.5);
      (tg.ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.5 * k * (0.6 + 0.4 * Math.sin(t * 20));
      tg.ring.scale.setScalar(0.4 + 0.6 * k);
      if (tg.t >= 1.5 && !tg.hit) {
        tg.hit = true;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.5, 7), this.spikeMat);
        spike.position.copy(tg.pos).setY(-2.2);
        this.group.add(spike); tg.spike = spike;
        audio.play('choir_roar', { pos: tg.pos.clone().setY(1), volume: 0.5, rate: 1.6, vary: 0.1 });
        audio.play('impact', { pos: tg.pos.clone().setY(0.5), volume: 1, rate: 0.6 });
        this.g.fx.dust(tg.pos.clone().setY(0.3), 10); this.g.fx.spores(tg.pos.clone().setY(1), 8);
        this.g.shakeNear(tg.pos, 0.5);
        if (!p.dead && p.pos.distanceTo(tg.pos) < 2.1) p.damage(32, tg.pos, { knock: true });
      }
      if (tg.spike) tg.spike.position.y = Math.min(1.2, tg.spike.position.y + dt * 30) - Math.max(0, tg.t - 2.1) * 6;
    }
    this.tele = this.tele.filter((tg) => {
      if (tg.t > 2.6) { this.group.remove(tg.ring); if (tg.spike) { this.group.remove(tg.spike); tg.spike.geometry.dispose(); } tg.ring.geometry.dispose(); return false; }
      return true;
    });
  }

  telegraph(pos: THREE.Vector3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), this.ringMat.clone());
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos);
    this.group.add(ring);
    this.tele.push({ pos: pos.clone(), t: 0, ring, spike: null, hit: false });
  }

  roar() {
    this.pulse = 1.5;
    audio.play('choir_roar', { pos: this.center.clone().setY(4), volume: 1, ref: 12, max: 120, occlude: false, priority: 5 });
    this.g.rig.shake(0.6);
  }

  shatter() {
    this.shattering = true;
    this.tele.forEach((tg) => { this.group.remove(tg.ring); if (tg.spike) this.group.remove(tg.spike); });
    this.tele = [];
    this.g.level.grid.boxes.filter((b) => b.id === 'choir').forEach((b) => this.g.level.grid.removeBox(b));
  }

  /**
   * Built hidden while the area loads (its light already counted, its shaders compiled by
   * the loading warm-up); the encounter only switches it on. A PointLight added mid-game
   * changed every lit shader and recompiled all of them at the boss intro.
   */
  setActive(on: boolean) {
    this.group.visible = on;
    if (this.kemal) this.kemal.h.root.visible = on;
    if (!on) this.light.intensity = 0;
  }

  dispose() {
    this.g.scene.remove(this.group, this.light);
    if (this.kemal) this.g.scene.remove(this.kemal.h.root);
  }
}
