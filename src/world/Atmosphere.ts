import * as THREE from 'three';
import { shared } from './Materials';

/**
 * Atmospheric layers, all camera-relative and drawn in at most 3 draw calls:
 * dust motes that light up inside the flashlight beam, rain streaks, and
 * ground-hugging fog wisps. Counts scale with the quality preset.
 */
export class Atmosphere {
  group = new THREE.Group();
  dust: THREE.Points | null = null;
  rain: THREE.LineSegments | null = null;
  wisps: THREE.InstancedMesh | null = null;
  flash = { pos: { value: new THREE.Vector3() }, dir: { value: new THREE.Vector3(0, 0, -1) }, cos: { value: 0.85 }, on: { value: 1 } };
  lightningTimer = 8 + Math.random() * 10;
  lightning = 0;
  onThunder: (delay: number) => void = () => {};

  constructor(scene: THREE.Scene) { scene.add(this.group); }

  build(opts: { dust: number; rain: number; wisps: number; outdoor: boolean; dustColor?: number }) {
    this.clear();
    if (opts.dust > 0) this.buildDust(opts.dust, opts.dustColor ?? 0xbfc6cc);
    if (opts.rain > 0) this.buildRain(opts.rain);
    if (opts.wisps > 0) this.buildWisps(opts.wisps);
  }

  clear() {
    for (const o of [this.dust, this.rain, this.wisps]) if (o) {
      this.group.remove(o); o.geometry.dispose();
      const m = o.material as THREE.ShaderMaterial; m.uniforms?.tMap?.value?.dispose?.(); m.dispose();
    }
    this.dust = this.rain = this.wisps = null;
  }

  private buildDust(n: number, color: number) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * 16; p[i * 3 + 1] = Math.random() * 4; p[i * 3 + 2] = Math.random() * 16; s[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: shared.uTime, uCam: { value: new THREE.Vector3() }, uFPos: this.flash.pos, uFDir: this.flash.dir, uFCos: this.flash.cos, uFOn: this.flash.on, uColor: { value: new THREE.Color(color) }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: `attribute float seed; uniform float uTime; uniform vec3 uCam; uniform vec3 uFPos; uniform vec3 uFDir; uniform float uFCos; uniform float uFOn; uniform float uScale; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.21 + seed * 40.0) * 0.6 + uTime * 0.05;
          p.y += sin(uTime * 0.13 + seed * 17.0) * 0.3 - uTime * 0.03 * seed;
          p.z += cos(uTime * 0.17 + seed * 23.0) * 0.6;
          vec3 base = uCam - vec3(8.0, 1.5, 8.0);
          vec3 w = base + mod(p - base, vec3(16.0, 4.0, 16.0));
          vec3 toP = w - uFPos; float d = length(toP);
          float inCone = smoothstep(uFCos, uFCos + 0.06, dot(toP / max(d, 0.001), uFDir)) * uFOn * smoothstep(14.0, 2.0, d);
          vA = 0.05 + inCone * 0.75;
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.025 + seed * 0.02) * uScale / -mv.z;
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vA; gl_FragColor = vec4(uColor * a, a); }`,
    });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** Roof cover map (1 = under a roof), sampled by the rain shader. */
  private cover: THREE.DataTexture = (() => { const t = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); t.needsUpdate = true; return t; })();
  setCover(cells: Uint8Array, w: number, h: number, tile: number, roofH: number) {
    this.cover.dispose();
    const t = new THREE.DataTexture(cells, w, h, THREE.RedFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
    this.cover = t;
    if (this.rain) {
      const u = (this.rain.material as THREE.ShaderMaterial).uniforms;
      u.uCover.value = t; u.uCoverSize.value.set(w * tile, h * tile); u.uRoofH.value = roofH;
    }
  }

  private buildRain(n: number) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 6), s = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 24, y = Math.random() * 10, z = Math.random() * 24, r = Math.random();
      p.set([x, y, z, x, y, z], i * 6); s[i * 2] = r; s[i * 2 + 1] = r + 10.0; // second vertex flagged as tail
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: shared.uTime, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(0.8, 0.3) }, uCover: { value: this.cover }, uCoverSize: { value: new THREE.Vector2(1, 1) }, uRoofH: { value: -1 } },
      vertexShader: `attribute float seed; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform sampler2D uCover; uniform vec2 uCoverSize; uniform float uRoofH; varying float vA;
        void main(){
          float tail = step(5.0, seed); float sd = seed - tail * 10.0;
          vec3 p = position; float speed = 9.0 + sd * 4.0;
          p.y -= uTime * speed; p.xz += uWind * uTime * 0.6;
          vec3 base = uCam - vec3(12.0, 4.0, 12.0);
          vec3 w = base + mod(p - base, vec3(24.0, 10.0, 24.0));
          w.y += tail * 0.35; w.xz -= uWind * tail * 0.03;
          vA = mix(0.0, 0.16, tail) * smoothstep(0.0, 1.5, w.y) * smoothstep(1.0, 4.0, length(w - uCam));
          // no rain under roofs (indoors), but it keeps falling above them
          vec2 cuv = w.xz / uCoverSize;
          if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) vA *= 1.0 - texture2D(uCover, cuv).r * step(w.y, uRoofH);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.62, 0.68, 0.74), vA); }`,
    });
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  private buildWisps(n: number) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 14; i++) {
      const gx = 30 + Math.random() * 68, gy = 40 + Math.random() * 48, r = 20 + Math.random() * 30;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tMap: { value: tex }, uTime: shared.uTime, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0x8a96a0) } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; varying vec2 vUv; varying float vA;
        void main(){ vUv = uv;
          vec3 ip = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
          ip.x += uTime * 0.25;
          vec3 base = uCam - vec3(20.0, 0.0, 20.0);
          vec3 c = base + mod(ip - base, vec3(40.0, 1.0, 40.0)); c.y = ip.y;
          float sc = length(instanceMatrix[0].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 wp = c + right * position.x * sc + vec3(0.0, 1.0, 0.0) * position.y * sc * 0.45;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vA = smoothstep(4.0, 12.0, -mv.z) * smoothstep(35.0, 18.0, -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D tMap; uniform vec3 uColor; varying vec2 vUv; varying float vA; void main(){ float a = texture2D(tMap, vUv).a * vA * 0.22; gl_FragColor = vec4(uColor, a); }`,
    });
    (m.uniforms.uColor.value as THREE.Color).setHex(0x56626c);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const s = 6 + Math.random() * 8;
      mtx.makeScale(s, s, s).setPosition(Math.random() * 40, 0.4 + Math.random() * 0.8, Math.random() * 40);
      mesh.setMatrixAt(i, mtx);
    }
    mesh.frustumCulled = false; mesh.renderOrder = 4;
    this.wisps = mesh; this.group.add(mesh);
  }

  update(dt: number, cam: THREE.Camera, lightningEnabled: boolean) {
    const cp = cam.position;
    if (this.dust) { const u = (this.dust.material as THREE.ShaderMaterial).uniforms; u.uCam.value.copy(cp); u.uScale.value = window.innerHeight * 0.5; }
    if (this.rain) (this.rain.material as THREE.ShaderMaterial).uniforms.uCam.value.copy(cp);
    if (this.wisps) (this.wisps.material as THREE.ShaderMaterial).uniforms.uCam.value.copy(cp);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (lightningEnabled) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 14 + Math.random() * 22;
        this.lightning = 1;
        this.onThunder(0.6 + Math.random() * 2.2);
      }
    }
  }
}
