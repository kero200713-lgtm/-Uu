import * as THREE from 'three';
import { glowTexture } from '../world/Lights';

interface P { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; grav: number; drag: number; grow: number; additive: number }

let bloodTex: THREE.Texture | null = null;
function bloodTexture() {
  if (bloodTex) return bloodTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.scale(2, 2); // drawn in 128-unit space at 2x resolution: smooth edges up close
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 70 * (i < 4 ? 0.3 : 1), y = 64 + (Math.random() - 0.5) * 70 * (i < 4 ? 0.3 : 1), r = i < 4 ? 22 + Math.random() * 14 : 2 + Math.random() * 9;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(60,4,4,0.95)'); grd.addColorStop(0.7, 'rgba(45,3,3,0.85)'); grd.addColorStop(1, 'rgba(30,2,2,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  bloodTex = new THREE.CanvasTexture(c); bloodTex.colorSpace = THREE.SRGBColorSpace;
  return bloodTex;
}

/**
 * Pooled visual effects. All particles share one Points draw call; decals
 * are a fixed ring buffer of quads; transient lights are permanent scene
 * lights whose intensity is animated (no shader recompiles).
 */
export class FX {
  group = new THREE.Group();
  private parts: P[] = [];
  private points: THREE.Points;
  private posArr: Float32Array; private colArr: Float32Array; private sizeArr: Float32Array;
  private N = 320;
  muzzleLight = new THREE.PointLight(0xffb070, 0, 9, 2);
  flareLight = new THREE.PointLight(0xff3020, 0, 16, 1.6);
  private muzzle: THREE.Sprite;
  private muzzleT = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  flare: { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; life: number; landed: boolean } | null = null;
  private flareObj: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    scene.add(this.muzzleLight); scene.add(this.flareLight);
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.N * 3); this.colArr = new Float32Array(this.N * 4); this.sizeArr = new Float32Array(this.N);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.colArr, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.sizeArr, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tMap: { value: glowTexture() }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; uniform float uScale; varying vec4 vC;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * uScale / -mv.z; }`,
      fragmentShader: `uniform sampler2D tMap; varying vec4 vC; void main(){ float a = texture2D(tMap, gl_PointCoord).a * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * a, a * (1.0 - step(0.5, vC.a) * 0.0)); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    for (let i = 0; i < this.N; i++) this.parts.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, color: new THREE.Color(), grav: 0, drag: 0, grow: 0, additive: 0 });
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.muzzle.scale.setScalar(0.5);
    this.group.add(this.muzzle);
    // lifted geometry instead of a slope-scaled polygon offset (that shifts with the view angle)
    const dm = new THREE.MeshBasicMaterial({ map: bloodTexture(), transparent: true, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dm);
      d.rotation.x = -Math.PI / 2; d.visible = false; d.renderOrder = 2;
      this.decals.push(d); this.group.add(d);
    }
    this.flareObj = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff2a10, emissiveIntensity: 2 }));
    this.flareObj.visible = false;
    this.group.add(this.flareObj);
  }

  private spawn(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, color: number, grav: number, drag: number, grow: number, additive: number) {
    const p = this.parts.find((x) => !x.alive);
    if (!p) return;
    p.alive = true; p.pos.copy(pos); p.vel.copy(vel); p.life = p.max = life; p.size = size; p.color.setHex(color); p.grav = grav; p.drag = drag; p.grow = grow; p.additive = additive;
  }

  /**
   * Loading-time warm-up: puts every pooled effect in front of the camera with a
   * visible size so the GPU builds its pipelines (fragment stage included) now
   * rather than on the first hit of a fight. Returns the restore function.
   */
  prewarm(cam: THREE.Camera): () => void {
    const at = new THREE.Vector3(0, 0, -2.5).applyQuaternion(cam.quaternion).add(cam.position);
    const saved: [THREE.Object3D, THREE.Vector3, boolean][] = [];
    for (const o of [...this.decals, this.muzzle, this.flareObj]) { saved.push([o, o.position.clone(), o.visible]); o.position.copy(at); o.visible = true; }
    // decals lie flat: put them below eye level so they are seen from above, not edge-on
    for (const d of this.decals) d.position.y -= 1.2;
    const mm = this.muzzle.material as THREE.SpriteMaterial, op = mm.opacity; mm.opacity = 0.01;
    const sz = this.sizeArr[0], col = this.colArr[3];
    this.posArr[0] = at.x; this.posArr[1] = at.y; this.posArr[2] = at.z; this.sizeArr[0] = 0.05; this.colArr[3] = 0.02;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.psize.needsUpdate = g.attributes.pcolor.needsUpdate = true;
    return () => {
      for (const [o, p, v] of saved) { o.position.copy(p); o.visible = v; }
      mm.opacity = op; this.sizeArr[0] = sz; this.colArr[3] = col;
      g.attributes.psize.needsUpdate = g.attributes.pcolor.needsUpdate = true;
    };
  }

  sparks(pos: THREE.Vector3, normal: THREE.Vector3, n = 10) {
    for (let i = 0; i < n; i++) {
      const v = normal.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.spawn(pos, v, 0.25 + Math.random() * 0.3, 0.06, 0xffc070, -9, 1.5, 0, 1);
    }
    for (let i = 0; i < 4; i++) this.spawn(pos, normal.clone().multiplyScalar(0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4)), 0.9, 0.25, 0x6a665e, 0.2, 2.5, 0.6, 0);
  }

  blood(pos: THREE.Vector3, dir: THREE.Vector3, n = 12) {
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(1 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
      this.spawn(pos, v, 0.4 + Math.random() * 0.4, 0.07 + Math.random() * 0.05, 0x4a0606, -9, 1, 0.2, 0);
    }
    this.spawn(pos, dir.clone().multiplyScalar(0.3), 0.5, 0.3, 0x3a0505, 0, 3, 1.5, 0);
  }

  /** Infection "spores" puff — the Hum's signature colour. */
  spores(pos: THREE.Vector3, n = 8) {
    for (let i = 0; i < n; i++) this.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2), 1.2 + Math.random(), 0.08, 0x5fe8d0, 0.4, 1.2, 0.3, 1);
  }

  dust(pos: THREE.Vector3, n = 6) {
    for (let i = 0; i < n; i++) this.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 1.5), 1 + Math.random(), 0.3, 0x55524c, 0, 2, 1, 0);
  }

  decal(pos: THREE.Vector3, size = 1) {
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.set(pos.x, 0.02 + (this.decalIdx % 7) * 0.003, pos.z);
    d.rotation.z = Math.random() * 6.28;
    d.scale.setScalar(size * (0.7 + Math.random() * 0.6));
    d.visible = true;
  }

  muzzleFlash(pos: THREE.Vector3, big = false) {
    this.muzzle.position.copy(pos);
    this.muzzle.scale.setScalar(big ? 0.9 : 0.55);
    (this.muzzle.material as THREE.SpriteMaterial).opacity = 1;
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = big ? 22 : 14;
    this.muzzleT = 0.06;
    for (let i = 0; i < 3; i++) this.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), 0.8, 0.18, 0x7a7670, 0, 2, 0.8, 0);
  }

  throwFlare(from: THREE.Vector3, dir: THREE.Vector3) {
    this.flare = { obj: this.flareObj, pos: from.clone(), vel: dir.clone().multiplyScalar(9).add(new THREE.Vector3(0, 3.5, 0)), life: 22, landed: false };
    this.flareObj.visible = true;
  }

  update(dt: number, ground: (p: THREE.Vector3) => boolean) {
    this.muzzleT -= dt;
    if (this.muzzleT <= 0) { (this.muzzle.material as THREE.SpriteMaterial).opacity = 0; this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 400); }
    const f = this.flare;
    if (f) {
      f.life -= dt;
      if (!f.landed) {
        f.vel.y -= 14 * dt; const next = f.pos.clone().addScaledVector(f.vel, dt);
        if (!ground(next)) { f.vel.x *= -0.3; f.vel.z *= -0.3; } else f.pos.copy(next);
        if (f.pos.y <= 0.05) { f.pos.y = 0.05; f.landed = true; }
        f.obj.rotation.x += dt * 12;
      } else { f.obj.rotation.set(Math.PI / 2, 0, 0.4); }
      f.obj.position.copy(f.pos);
      const flick = 0.75 + Math.random() * 0.35;
      this.flareLight.position.copy(f.pos).add(new THREE.Vector3(0, 0.3, 0));
      this.flareLight.intensity = (f.life > 2 ? 9 : 9 * f.life / 2) * flick;
      if (Math.random() < dt * 40) this.spawn(f.pos, new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 0.4, 0.05, 0xff7040, -6, 1, 0, 1);
      if (Math.random() < dt * 8) this.spawn(f.pos, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3), 2.2, 0.4, 0x8a5a52, 0.3, 0.5, 1.2, 0);
      if (f.life <= 0) { this.flare = null; this.flareObj.visible = false; this.flareLight.intensity = 0; }
    }
    let i = 0;
    for (const p of this.parts) {
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; }
        else {
          p.vel.y += p.grav * dt;
          p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
          p.pos.addScaledVector(p.vel, dt);
          if (p.pos.y < 0.02) { p.pos.y = 0.02; p.vel.set(0, 0, 0); }
        }
      }
      const k = p.alive ? p.life / p.max : 0;
      this.posArr[i * 3] = p.pos.x; this.posArr[i * 3 + 1] = p.pos.y; this.posArr[i * 3 + 2] = p.pos.z;
      const a = p.alive ? (p.additive ? k : Math.min(1, k * 2) * 0.85) : 0;
      // premultiplied: additive particles get low alpha so they add, normal ones occlude
      this.colArr[i * 4] = p.color.r * (p.additive ? 2.5 : 1); this.colArr[i * 4 + 1] = p.color.g * (p.additive ? 2.5 : 1); this.colArr[i * 4 + 2] = p.color.b * (p.additive ? 2.5 : 1);
      this.colArr[i * 4 + 3] = a * (p.additive ? 0.5 : 1);
      this.sizeArr[i] = p.size * (1 + (1 - k) * p.grow);
      i++;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.psize as THREE.BufferAttribute).needsUpdate = true;
    ((this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = window.innerHeight * 0.5);
  }
}
