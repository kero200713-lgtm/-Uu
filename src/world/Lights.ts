import * as THREE from 'three';
import { settings } from '../core/Settings';

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const coneMat = (color: THREE.Color) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uColor: { value: color.clone() }, uI: { value: 1 } },
  vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
    void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vH; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = edge * pow(vH, 1.4) * 0.11 * uI; gl_FragColor = vec4(uColor * a, a); }`,
});

/** Converts authored intensities to three.js physical (candela) units. */
export const LIGHT_SCALE = 4;

export class LightAnchor {
  pos: THREE.Vector3; color: THREE.Color; intensity: number; range: number;
  flicker: string; on = true; phase = Math.random() * 100; factor = 1; id?: string;
  glow: THREE.Sprite | null = null; cone: THREE.Mesh | null = null;
  constructor(pos: THREE.Vector3, color: THREE.Color, intensity: number, range: number, flicker: string) {
    this.pos = pos; this.color = color; this.intensity = intensity; this.range = range; this.flicker = flicker;
  }
  evaluate(t: number) {
    if (!this.on) { this.factor = 0; return; }
    const p = t + this.phase;
    switch (this.flicker) {
      case 'flicker': {
        const n = Math.sin(p * 13.1) * Math.sin(p * 7.3 + 1.7) * Math.sin(p * 2.9);
        this.factor = n > 0.55 ? 0.15 : n > 0.4 ? 0.6 : 1;
        break;
      }
      case 'pulse': this.factor = 0.55 + 0.45 * Math.sin(p * 1.7); break;
      case 'broken': {
        const n = Math.sin(p * 17.0) * Math.sin(p * 3.1) + Math.sin(p * 0.7) * 0.5;
        this.factor = n > 0.85 ? 1 : n > 0.75 ? 0.4 : 0.02;
        break;
      }
      case 'strobe': this.factor = (Math.sin(p * 3.2) > 0.2 ? 1 : 0.08); break;
      default: this.factor = 1;
    }
    if (settings.data.reduceFlashing && this.flicker !== 'none') this.factor = 0.35 + 0.65 * this.factor * 0.5 + 0.2;
  }
}

/**
 * Fixed-size pool of PointLights re-assigned to the most relevant anchors.
 * Light count never changes at runtime => no shader recompiles/hitches.
 */
export class LightPool {
  lights: THREE.PointLight[] = [];
  anchors: LightAnchor[] = [];
  private assigned: (LightAnchor | null)[] = [];
  private timer = 0;
  group = new THREE.Group();

  constructor(scene: THREE.Object3D, size: number) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false;
      this.lights.push(l); this.assigned.push(null);
      scene.add(l);
    }
    scene.add(this.group);
  }

  add(a: LightAnchor, glow = true, cone = false, coneHeight = 3, glowSize = 0.9) {
    this.anchors.push(a);
    if (glow) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: a.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.copy(a.pos); s.scale.setScalar(glowSize);
      a.glow = s; this.group.add(s);
    }
    if (cone) {
      const g = new THREE.CylinderGeometry(0.12, 1.6, coneHeight, 16, 1, true);
      g.translate(0, -coneHeight / 2, 0);
      // uv.y: 1 at top -> fade toward bottom handled in shader via pow(vH)
      const m = new THREE.Mesh(g, coneMat(a.color));
      m.position.copy(a.pos); m.renderOrder = 5;
      a.cone = m; this.group.add(m);
    }
    return a;
  }

  clear() {
    for (const a of this.anchors) {
      if (a.glow) { this.group.remove(a.glow); (a.glow.material as THREE.Material).dispose(); }
      if (a.cone) { this.group.remove(a.cone); a.cone.geometry.dispose(); (a.cone.material as THREE.Material).dispose(); }
    }
    this.anchors = [];
    for (let i = 0; i < this.lights.length; i++) { this.lights[i].intensity = 0; this.assigned[i] = null; }
  }

  update(dt: number, t: number, cam: THREE.Camera) {
    for (const a of this.anchors) {
      a.evaluate(t);
      if (a.glow) (a.glow.material as THREE.SpriteMaterial).opacity = a.factor * 0.9;
      if (a.cone) ((a.cone.material as THREE.ShaderMaterial).uniforms.uI.value = a.factor);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      const cp = cam.position;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const scored = this.anchors.filter((a) => a.on).map((a) => {
        const d = a.pos.distanceTo(cp);
        const toA = a.pos.clone().sub(cp).normalize();
        const front = 0.6 + 0.4 * Math.max(0, toA.dot(fwd));
        const prev = this.assigned.includes(a) ? 1.25 : 1; // hysteresis
        return { a, s: (a.intensity * a.range) / (1 + d * d * 0.15) * front * prev * (d < a.range + 25 ? 1 : 0) };
      }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, this.lights.length).map((x) => x.a);
      // keep stable slots
      const next: (LightAnchor | null)[] = this.assigned.map((a) => (a && scored.includes(a) ? a : null));
      for (const a of scored) if (!next.includes(a)) { const i = next.indexOf(null); if (i >= 0) next[i] = a; }
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== this.assigned[i]) {
          const l = this.lights[i]; const a = next[i];
          if (a) { l.position.copy(a.pos); l.color.copy(a.color); l.distance = a.range; l.intensity = 0; }
        }
      }
      this.assigned = next;
    }
    for (let i = 0; i < this.lights.length; i++) {
      const a = this.assigned[i], l = this.lights[i];
      const target = a ? a.intensity * a.factor * LIGHT_SCALE : 0;
      l.intensity += (target - l.intensity) * Math.min(1, dt * (a && a.flicker !== 'none' ? 30 : 6));
    }
  }

  byId(id: string) { return this.anchors.find((a) => a.id === id); }
}
