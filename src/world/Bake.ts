import * as THREE from 'three';
import { Grid, BLOCK_CAM, BLOCK_SIGHT } from './Grid';

export interface BakeLight { x: number; y: number; z: number; color: THREE.Color; intensity: number; range: number; bake: number }

/**
 * CPU light baker. Produces per-vertex `aBake` (rgb indirect + a AO) for
 * static geometry and a per-tile irradiance field for dynamic objects.
 * Visibility uses the tile grid (walls cast baked shadows), cached per
 * half-metre cell so baking an area takes a few hundred milliseconds.
 */
export class Baker {
  grid: Grid;
  lights: BakeLight[];
  ambient: THREE.Color;
  outdoorBoost: number;
  private vis = new Map<number, Uint8Array>();
  irr: Float32Array; // per tile rgb
  private wallDist: Float32Array; // distance to nearest full wall, sampled at 0.5m
  private sub = 4; // samples per tile edge for caches (0.5 m with 2 m tiles)

  constructor(grid: Grid, lights: BakeLight[], ambient: THREE.Color, outdoorBoost = 1) {
    this.grid = grid; this.lights = lights; this.ambient = ambient; this.outdoorBoost = outdoorBoost;
    const S = this.sub;
    const W = grid.w * S, H = grid.h * S;
    this.wallDist = new Float32Array(W * H).fill(99);
    // brute-force distance to wall AABBs in a 2-tile neighbourhood
    const T = grid.tile, step = T / S;
    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      const px = (sx + 0.5) * step, pz = (sy + 0.5) * step;
      const cx = Math.floor(px / T), cy = Math.floor(pz / T);
      let best = 99;
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
        if (!(grid.flag(x, y) & BLOCK_CAM)) continue;
        const qx = Math.max(x * T, Math.min(px, (x + 1) * T)), qz = Math.max(y * T, Math.min(pz, (y + 1) * T));
        const d = Math.hypot(px - qx, pz - qz);
        if (d < best) best = d;
      }
      this.wallDist[sy * W + sx] = best;
    }
    this.irr = new Float32Array(grid.w * grid.h * 3);
    const c = new THREE.Color();
    const p = new THREE.Vector3(), n = new THREE.Vector3(0, 1, 0);
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      grid.center(x, y, p); p.y = 1.0;
      this.light(p, n, c, true);
      const i = (y * grid.w + x) * 3;
      this.irr[i] = c.r; this.irr[i + 1] = c.g; this.irr[i + 2] = c.b;
    }
  }

  private distAt(x: number, z: number) {
    const S = this.sub, step = this.grid.tile / S;
    const sx = Math.max(0, Math.min(this.grid.w * S - 1, Math.floor(x / step)));
    const sy = Math.max(0, Math.min(this.grid.h * S - 1, Math.floor(z / step)));
    return this.wallDist[sy * this.grid.w * S + sx];
  }

  private visible(li: number, x: number, z: number) {
    const S = this.sub, step = this.grid.tile / S;
    const W = this.grid.w * S, H = this.grid.h * S;
    const sx = Math.max(0, Math.min(W - 1, Math.floor(x / step))), sy = Math.max(0, Math.min(H - 1, Math.floor(z / step)));
    let arr = this.vis.get(li);
    if (!arr) { arr = new Uint8Array(W * H); this.vis.set(li, arr); }
    const k = sy * W + sx;
    if (arr[k]) return arr[k] === 2;
    const L = this.lights[li];
    const px = (sx + 0.5) * step, pz = (sy + 0.5) * step;
    const d = Math.hypot(px - L.x, pz - L.z);
    const v = d < 0.3 || this.grid.raycast(L.x, L.z, px - L.x, pz - L.z, d, BLOCK_SIGHT, false) < 0;
    arr[k] = v ? 2 : 1;
    return v;
  }

  /** Indirect light at point p with normal n (world space). */
  light(p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color, ignoreNormal = false) {
    out.copy(this.ambient);
    const indoor = this.grid.indoorAt(p.x, p.z);
    if (!indoor) out.multiplyScalar(this.outdoorBoost);
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      if (L.bake <= 0) continue;
      const dx = L.x - p.x, dy = L.y - p.y, dz = L.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L.range) continue;
      if (!this.visible(i, p.x + n.x * 0.2, p.z + n.z * 0.2)) continue;
      let f = 1 - d / L.range; f = f * f;
      const lam = ignoreNormal ? 1 : Math.max(0, (dx * n.x + dy * n.y + dz * n.z) / (d || 1)) * 0.7 + 0.3;
      const k = L.intensity * L.bake * f * lam * 0.06;
      out.r += L.color.r * k; out.g += L.color.g * k; out.b += L.color.b * k;
    }
    return out;
  }

  /** Writes the `aBake` attribute for a world-space geometry. */
  bakeGeometry(geo: THREE.BufferGeometry, kind: 'floor' | 'wall' | 'ceil' | 'prop') {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const n = pos.count;
    const out = new Float32Array(n * 4);
    const p = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      if (nor) nn.fromBufferAttribute(nor, i); else nn.set(0, 1, 0);
      let ao = 1;
      if (kind === 'floor') {
        const d = this.distAt(p.x, p.z);
        ao = 0.42 + 0.58 * smooth(0.0, 1.1, d);
      } else if (kind === 'wall') {
        const d = this.distAt(p.x + nn.x * 0.3, p.z + nn.z * 0.3);
        ao = (0.5 + 0.5 * smooth(0.0, 1.3, p.y)) * (0.75 + 0.25 * smooth(0.0, 0.7, d)) * (p.y > 2.7 ? 0.85 : 1);
      } else if (kind === 'ceil') {
        const d = this.distAt(p.x, p.z);
        ao = 0.55 + 0.45 * smooth(0, 1.2, d);
      } else {
        const d = this.distAt(p.x, p.z);
        ao = (0.55 + 0.45 * smooth(0, 0.9, p.y)) * (0.8 + 0.2 * smooth(0, 0.8, d));
      }
      this.light(p, nn, c);
      out[i * 4] = c.r; out[i * 4 + 1] = c.g; out[i * 4 + 2] = c.b; out[i * 4 + 3] = ao;
    }
    geo.setAttribute('aBake', new THREE.BufferAttribute(out, 4));
  }

  /** Bilinear irradiance for dynamic objects (characters, pickups). */
  sample(x: number, z: number, out: THREE.Color) {
    const g = this.grid, T = g.tile;
    const fx = x / T - 0.5, fz = z / T - 0.5;
    const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx))), z0 = Math.max(0, Math.min(g.h - 1, Math.floor(fz)));
    const x1 = Math.min(g.w - 1, x0 + 1), z1 = Math.min(g.h - 1, z0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), tz = Math.max(0, Math.min(1, fz - z0));
    const I = this.irr, W = g.w;
    const get = (xx: number, zz: number, k: number) => I[(zz * W + xx) * 3 + k];
    for (let k = 0; k < 3; k++) {
      const v = (get(x0, z0, k) * (1 - tx) + get(x1, z0, k) * tx) * (1 - tz) + (get(x0, z1, k) * (1 - tx) + get(x1, z1, k) * tx) * tz;
      if (k === 0) out.r = v; else if (k === 1) out.g = v; else out.b = v;
    }
    return out;
  }
}

function smooth(a: number, b: number, x: number) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
