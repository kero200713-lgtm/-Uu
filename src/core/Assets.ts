import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = './assets/';

export interface PropGeo { geometry: THREE.BufferGeometry; size: THREE.Vector3; min: THREE.Vector3; max: THREE.Vector3; }

/**
 * Central asset cache. Everything is loaded once and shared; per-area loading
 * only requests what that area references, and progress feeds the loading UI.
 */
class AssetStore {
  gltfLoader = new GLTFLoader();
  texLoader = new THREE.TextureLoader();
  private gltf = new Map<string, Promise<GLTF>>();
  private tex = new Map<string, THREE.Texture>();
  private props = new Map<string, PropGeo>();
  private packs = new Map<string, Promise<void>>();
  clips = new Map<string, THREE.AnimationClip>();
  anisotropy = 1;
  pending = 0; done = 0;
  onProgress: (p: number) => void = () => {};

  constructor() {
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.pending++;
    this.report();
    return p.finally(() => { this.done++; this.report(); });
  }
  private report() { this.onProgress(this.pending ? this.done / this.pending : 1); }
  resetProgress() { this.pending = 0; this.done = 0; }

  loadGLTF(path: string): Promise<GLTF> {
    let p = this.gltf.get(path);
    if (!p) {
      p = this.track(this.gltfLoader.loadAsync(BASE + path));
      this.gltf.set(path, p);
    }
    return p;
  }

  /** Low quality uses 512 px variants of the large colour/normal maps. */
  small = false;

  private texInflight = new Set<Promise<void>>();
  /** Resolves once every texture requested so far has arrived (or after `ms`, never blocking a load for long). */
  texturesSettled(ms = 8000): Promise<void> {
    return Promise.race([Promise.all([...this.texInflight]).then(() => {}), new Promise<void>((r) => setTimeout(r, ms))]);
  }

  texture(path: string, srgb = false, repeat = true): THREE.Texture {
    if (this.small && /(_c|_albedo|_normal)\.jpg$/.test(path)) path = path.replace(/\.jpg$/, '_s.jpg');
    const key = path + (srgb ? '|s' : '');
    let t = this.tex.get(key);
    if (t) return t;
    this.pending++; this.report();
    let settle!: () => void;
    const inflight = new Promise<void>((r) => { settle = r; });
    this.texInflight.add(inflight);
    const fin = () => { this.done++; this.report(); this.texInflight.delete(inflight); settle(); };
    t = this.texLoader.load(BASE + path, fin, undefined, () => { console.warn('texture failed', path); fin(); });
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy;
    this.tex.set(key, t);
    return t;
  }

  /** Loads a prop pack and converts every node into a baked, de-quantised geometry. */
  loadPack(pack: string): Promise<void> {
    let p = this.packs.get(pack);
    if (!p) {
      p = this.loadGLTF(`models/${pack}.glb`).then((g) => {
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o: any) => {
          if (!o.isMesh) return;
          const geo = dequantize(o.geometry);
          geo.applyMatrix4(o.matrixWorld);
          geo.computeBoundingBox();
          const bb = geo.boundingBox!;
          const name = o.name || o.parent?.name;
          const size = new THREE.Vector3(); bb.getSize(size);
          this.props.set(`${pack}/${name}`, { geometry: geo, size, min: bb.min.clone(), max: bb.max.clone() });
        });
      });
      this.packs.set(pack, p);
    }
    return p;
  }

  /**
   * Frees GPU memory of cached textures the current scene doesn't use.
   * Image data stays cached, so a later area re-uploads instantly.
   */
  trimGPU(scene: THREE.Object3D, extra: THREE.Object3D[] = []) {
    const used = new Set<THREE.Texture>();
    const visit = (o: any) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) for (const k of Object.keys(m)) { const v = (m as any)[k]; if (v && v.isTexture) used.add(v); }
    };
    scene.traverse(visit); for (const e of extra) e.traverse(visit);
    let freed = 0;
    for (const t of this.tex.values()) if (!used.has(t)) { t.dispose(); freed++; }
    return freed;
  }

  prop(pack: string, name: string): PropGeo | undefined {
    return this.props.get(`${pack}/${name}`);
  }

  /** Loads animation GLBs and stores clips by name (tracks already stripped offline). */
  async loadAnimations() {
    const [a, b] = await Promise.all([this.loadGLTF('models/characters/anims_a.glb'), this.loadGLTF('models/characters/anims_b.glb')]);
    for (const c of [...a.animations, ...b.animations]) this.clips.set(c.name, c);
  }
}

/** Converts quantised / interleaved attributes into plain Float32 attributes. */
export function dequantize(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a: any = src.attributes[name];
    const n = a.count, k = a.itemSize;
    const out = new Float32Array(n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = a.getComponent(i, j);
    g.setAttribute(name, new THREE.BufferAttribute(out, k));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array as any), 1));
  return g;
}

export const assets = new AssetStore();
