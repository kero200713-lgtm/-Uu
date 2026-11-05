import * as THREE from 'three';
import { PRESETS, QualityPreset, detectQuality } from './Quality';
import { settings, QualityLevel } from './Settings';
import { bus } from './Events';
import { assets } from './Assets';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform float uThreshold; uniform vec2 uScale; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv * uScale).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold * 2.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270;
  c += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL_FRAG = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom;
uniform float uTime, uExposure, uVignette, uGrain, uCA, uSat, uContrast, uDamage, uLow, uFade, uFlash, uHum;
uniform vec3 uLift, uGain; uniform vec2 uRes, uScale;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  // subtle lens wobble when the Hum is loud
  uv += d * sin(uTime * 3.0 + r2 * 20.0) * 0.004 * uHum;
  float ca = uCA * (0.4 + r2 * 2.0) + uDamage * 0.004;
  vec3 col;
  // dynamic resolution renders the scene into the lower-left part of the target (uScale)
  col.r = texture2D(tScene, (uv + d * ca) * uScale).r;
  col.g = texture2D(tScene, uv * uScale).g;
  col.b = texture2D(tScene, (uv - d * ca) * uScale).b;
  // never let a stray Inf/NaN pixel through (it would show as separate R/G/B dots)
  if (!(col.r + col.g + col.b < 1.0e4)) col = vec3(0.0);
  col = min(col, vec3(48.0));
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = aces(col);
  // grading in display-ish space
  col = toSRGB(col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat * (1.0 - uLow * 0.65));
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uGain + uLift * (1.0 - col);
  // low health: pulsing dark edges, never blinding
  float pulse = 0.5 + 0.5 * sin(uTime * 5.5);
  float vig = smoothstep(0.85, 0.18, r2 * (uVignette + uLow * 0.6 * (0.7 + 0.3 * pulse)));
  col *= mix(0.35, 1.0, vig);
  col = mix(col, col * vec3(1.0, 0.25, 0.22) + vec3(0.12, 0.0, 0.0), uDamage * smoothstep(0.05, 0.4, r2));
  float g = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain * (1.2 - l);
  col += uFlash;
  col *= 1.0 - uFade;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export type UpdateFn = (dt: number, t: number) => void;

/**
 * Renderer, render targets, post-processing and the main loop. Quality tiers
 * genuinely change cost: render scale, MSAA, post, bloom, shadows, light pool.
 */
export class Engine {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  q: QualityPreset;
  level: QualityLevel;
  private rt: THREE.WebGLRenderTarget | null = null;
  private bloomA: THREE.WebGLRenderTarget | null = null;
  private bloomB: THREE.WebGLRenderTarget | null = null;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsQuad: THREE.Mesh;
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  finalMat: THREE.ShaderMaterial;
  private updaters: UpdateFn[] = [];
  private last = 0;
  time = 0;
  timeScale = 1;
  paused = false;
  dynScale = 1;
  fps = 60;
  private frameAcc = 0; private frameCount = 0; private slowTime = 0; private fastTime = 0;
  renderOverride: ((r: THREE.WebGLRenderer) => boolean) | null = null;
  halfFloat = true;
  grade = { exposure: 1, sat: 0.82, contrast: 1.06, lift: new THREE.Color(0.012, 0.014, 0.02), gain: new THREE.Color(0.98, 1.0, 1.02), vignette: 1.1, grain: 0.045, ca: 0.0016 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    const gl = this.renderer.getContext();
    const want = settings.data.quality;
    this.level = want === 'auto' ? detectQuality(gl) : want;
    this.q = { ...PRESETS[this.level] };
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; // per-light castShadow toggles cost
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.12, this.q.far);
    this.halfFloat = this.probeHalfFloat(gl as WebGL2RenderingContext);
    assets.anisotropy = this.q.anisotropy;

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.brightMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.9 }, uScale: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uTime: { value: 0 }, uExposure: { value: 1 },
        uVignette: { value: 1 }, uGrain: { value: 0.04 }, uCA: { value: 0.0015 }, uSat: { value: 0.85 }, uContrast: { value: 1.05 },
        uDamage: { value: 0 }, uLow: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uHum: { value: 0 },
        uLift: { value: new THREE.Color() }, uGain: { value: new THREE.Color(1, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.fsQuad = new THREE.Mesh(quadGeo, this.finalMat);
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);

    window.addEventListener('resize', () => this.resize());
    // iOS may drop the GL context under memory pressure: keep it restorable and tell the game
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); bus.emit('contextlost'); });
    canvas.addEventListener('webglcontextrestored', () => bus.emit('contextrestored'));
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    bus.on('settings', (k) => { if (k === 'quality' || k === 'renderScale' || k === '*') this.applyQuality(); });
    this.applyQuality();
  }

  applyQuality() {
    const want = settings.data.quality;
    this.level = want === 'auto' ? (this.level || detectQuality(this.renderer.getContext())) : want;
    this.q = { ...PRESETS[this.level] };
    this.camera.far = this.q.far;
    this.camera.updateProjectionMatrix();
    assets.small = this.level === 'low';
    assets.anisotropy = this.q.anisotropy;
    this.renderer.shadowMap.type = this.level === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.dynScale = 1;
    this.resize();
    bus.emit('quality', this.q);
  }

  /**
   * HDR target support differs between GPUs/browsers (older iOS Safari can
   * report the extension yet refuse a multisampled RGBA16F framebuffer), so
   * a tiny target is actually built and checked before relying on it.
   */
  private probeHalfFloat(gl: WebGL2RenderingContext) {
    if (!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return false;
    try {
      for (const samples of [0, 4]) {
        const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
        this.renderer.setRenderTarget(rt);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        this.renderer.setRenderTarget(null);
        rt.dispose();
        if (!ok) return false;
      }
      return true;
    } catch { return false; }
  }

  /** Total rendered pixels per preset: keeps Retina iPads/phones from rendering 5M+ px per frame. */
  static PIXEL_BUDGET: Record<string, number> = { low: 0.9e6, medium: 1.6e6, high: 2.8e6 };

  get pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr);
    let pr = dpr * this.q.renderScale * settings.data.renderScale;
    const px = window.innerWidth * window.innerHeight * pr * pr, budget = Engine.PIXEL_BUDGET[this.level] ?? 1.6e6;
    if (px > budget) pr *= Math.sqrt(budget / px);
    return pr;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.max(0.35, this.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.rt?.dispose(); this.bloomA?.dispose(); this.bloomB?.dispose();
    this.rt = this.bloomA = this.bloomB = null;
    if (this.q.post) {
      const type = this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
      this.rt = new THREE.WebGLRenderTarget(W, H, { type, samples: this.q.antialias && this.renderer.capabilities.isWebGL2 ? 4 : 0, depthBuffer: true });
      if (this.q.bloom) {
        const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
        this.bloomA = new THREE.WebGLRenderTarget(bw, bh, { type });
        this.bloomB = new THREE.WebGLRenderTarget(bw, bh, { type });
      }
      this.renderer.toneMapping = THREE.NoToneMapping;
    } else {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }
    (this.finalMat.uniforms.uRes.value as THREE.Vector2).set(W, H);
    const vig = document.getElementById('vignette');
    if (vig) vig.style.opacity = this.q.post ? '0' : '1';
  }

  onUpdate(fn: UpdateFn) { this.updaters.push(fn); return () => { this.updaters = this.updaters.filter((f) => f !== fn); }; }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25; // tab switch etc.
      this.governor(dt);
      const sdt = this.paused ? 0 : Math.min(dt, 1 / 20) * this.timeScale;
      this.time += sdt;
      for (const fn of this.updaters) fn(sdt, this.time);
      this.render(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Dynamic resolution: trades pixels for frame-rate before anything else. */
  private governor(dt: number) {
    this.frameAcc += dt; this.frameCount++;
    if (this.frameAcc >= 0.5) {
      this.fps = this.frameCount / this.frameAcc;
      this.frameAcc = 0; this.frameCount = 0;
      // only with post-processing: the scale is a viewport inside the full-size target, so a
      // change costs nothing (it used to reallocate the canvas and every render target -
      // a freeze that lowered the measured fps again and repeated every 2 s)
      if (!settings.data.dynamicResolution || this.paused || !this.rt) { this.dynScale = 1; return; }
      if (this.fps < 28) { this.slowTime += 0.5; this.fastTime = 0; } else if (this.fps > 50) { this.fastTime += 0.5; this.slowTime = 0; } else { this.slowTime = 0; this.fastTime = 0; }
      if (this.slowTime >= 1 && this.dynScale > 0.6) { this.dynScale = Math.max(0.6, this.dynScale - 0.05); this.slowTime = 0; }
      if (this.fastTime >= 3 && this.dynScale < 1) { this.dynScale = Math.min(1, this.dynScale + 0.05); this.fastTime = 0; }
    }
  }

  fx = { damage: 0, low: 0, fade: 0, flash: 0, hum: 0 };

  render(realDt: number) {
    const r = this.renderer;
    r.info.autoReset = false;
    r.info.reset();
    if (this.renderOverride && this.renderOverride(r)) return;
    const u = this.finalMat.uniforms;
    if (!this.rt) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    // dynamic resolution: draw into the lower-left dynScale part of the full-size target
    const s = this.dynScale, rt = this.rt;
    rt.viewport.set(0, 0, Math.max(1, Math.floor(rt.width * s)), Math.max(1, Math.floor(rt.height * s)));
    const sx = rt.viewport.z / rt.width, sy = rt.viewport.w / rt.height;
    (u.uScale.value as THREE.Vector2).set(sx, sy);
    (this.brightMat.uniforms.uScale.value as THREE.Vector2).set(sx, sy);
    (u.uRes.value as THREE.Vector2).set(rt.viewport.z, rt.viewport.w);
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    let bloomTex: THREE.Texture | null = null;
    if (this.bloomA && this.bloomB) {
      this.fsQuad.material = this.brightMat; this.brightMat.uniforms.tDiffuse.value = this.rt.texture;
      r.setRenderTarget(this.bloomA); r.render(this.fsScene, this.fsCam);
      this.fsQuad.material = this.blurMat;
      for (let i = 0; i < 2; i++) {
        this.blurMat.uniforms.tDiffuse.value = this.bloomA.texture; this.blurMat.uniforms.uDir.value.set(1 / this.bloomA.width, 0);
        r.setRenderTarget(this.bloomB); r.render(this.fsScene, this.fsCam);
        this.blurMat.uniforms.tDiffuse.value = this.bloomB.texture; this.blurMat.uniforms.uDir.value.set(0, 1 / this.bloomA.height);
        r.setRenderTarget(this.bloomA); r.render(this.fsScene, this.fsCam);
      }
      bloomTex = this.bloomA.texture;
    }
    this.fsQuad.material = this.finalMat;
    const g = this.grade;
    u.tScene.value = this.rt.texture;
    u.tBloom.value = bloomTex || this.rt.texture;
    u.uBloom.value = bloomTex ? 0.55 : 0;
    u.uTime.value = performance.now() / 1000;
    u.uExposure.value = g.exposure;
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
    u.uCA.value = settings.data.reduceFlashing ? g.ca * 0.5 : g.ca;
    u.uSat.value = g.sat; u.uContrast.value = g.contrast;
    (u.uLift.value as THREE.Color).copy(g.lift); (u.uGain.value as THREE.Color).copy(g.gain);
    u.uDamage.value = this.fx.damage; u.uLow.value = this.fx.low; u.uFade.value = this.fx.fade;
    u.uFlash.value = settings.data.reduceFlashing ? this.fx.flash * 0.3 : this.fx.flash; u.uHum.value = this.fx.hum;
    r.setRenderTarget(null);
    r.render(this.fsScene, this.fsCam);
  }
}
