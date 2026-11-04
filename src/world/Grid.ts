import * as THREE from 'three';

/** Tile semantics shared by builder, collision, navigation and audio. */
export interface TileInfo {
  kind: 'floor' | 'wall' | 'void' | 'door' | 'water';
  floor?: string;       // surface texture key
  wall?: string;        // wall texture key
  indoor?: boolean;     // has ceiling
  step?: 'dirt' | 'concrete' | 'wood' | 'metal' | 'water';
  sight?: boolean;      // true => does NOT block sight (fences, windows)
  height?: number;      // wall height override
  low?: boolean;        // low obstacle (fence) - camera can pass above
}

export const TILES: Record<string, TileInfo> = {
  '.': { kind: 'floor', floor: 'ground_forest', step: 'dirt' },
  ',': { kind: 'floor', floor: 'ground_mud', step: 'dirt' },
  ';': { kind: 'floor', floor: 'ground_grass', step: 'dirt' },
  '=': { kind: 'floor', floor: 'asphalt', step: 'concrete' },
  '|': { kind: 'floor', floor: 'road', step: 'concrete' },
  '_': { kind: 'floor', floor: 'concrete', step: 'concrete' },
  'g': { kind: 'floor', floor: 'gravel', step: 'dirt' },
  'b': { kind: 'floor', floor: 'planks', step: 'wood' },
  'w': { kind: 'floor', floor: 'wood_floor', indoor: true, step: 'wood' },
  't': { kind: 'floor', floor: 'tiles_white', indoor: true, step: 'concrete' },
  'k': { kind: 'floor', floor: 'tiles_check', indoor: true, step: 'concrete' },
  'c': { kind: 'floor', floor: 'concrete', indoor: true, step: 'concrete' },
  'm': { kind: 'floor', floor: 'metal_floor', indoor: true, step: 'metal' },
  'r': { kind: 'floor', floor: 'rock', step: 'dirt' },
  'q': { kind: 'floor', floor: 'gravel', indoor: true, step: 'dirt' },   // tunnel floor
  'x': { kind: 'floor', floor: 'metal_rust', step: 'metal' },            // outdoor grating
  '#': { kind: 'wall' },
  'B': { kind: 'wall', wall: 'bricks' },
  'C': { kind: 'wall', wall: 'concrete' },
  'P': { kind: 'wall', wall: 'plaster' },
  'Y': { kind: 'wall', wall: 'wallpaper' },
  'W': { kind: 'wall', wall: 'planks' },
  'M': { kind: 'wall', wall: 'metal_painted' },
  'N': { kind: 'wall', wall: 'metal_green' },
  'R': { kind: 'wall', wall: 'rock', height: 6 },
  'T': { kind: 'wall', wall: 'tree' },
  'F': { kind: 'wall', wall: 'fence', sight: true, height: 1.25, low: true },
  'v': { kind: 'wall', wall: 'window', sight: true },
  'X': { kind: 'wall', wall: 'rubble', sight: true, low: true, height: 1.1 },
  '~': { kind: 'water', floor: 'water', step: 'water' },
  ' ': { kind: 'void' },
  'D': { kind: 'door', step: 'wood' },
  'S': { kind: 'door', step: 'metal' },
  'G': { kind: 'door', step: 'metal' },
};

export const BLOCK_MOVE = 1, BLOCK_SIGHT = 2, BLOCK_CAM = 4, IS_DOOR = 8;

interface Box { minX: number; minZ: number; maxX: number; maxZ: number; sight: boolean; id?: string }

const tmpV = new THREE.Vector3();

export class Grid {
  w: number; h: number; tile: number;
  rows: string[];
  flags: Uint8Array;
  navBlock: Uint8Array;
  boxes: Box[] = [];
  boxCells = new Map<number, Box[]>();
  doorCells = new Map<number, any>();

  constructor(rows: string[], tile = 2) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.rows = rows.map((r) => r.padEnd(this.w, ' '));
    this.tile = tile;
    this.flags = new Uint8Array(this.w * this.h);
    this.navBlock = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const info = this.info(x, y);
      let f = 0;
      if (info.kind === 'wall' || info.kind === 'void' || info.kind === 'water') f |= BLOCK_MOVE;
      if ((info.kind === 'wall' && !info.sight) || info.kind === 'void') f |= BLOCK_SIGHT;
      if ((info.kind === 'wall' && !info.low) || info.kind === 'void') f |= BLOCK_CAM;
      if (info.kind === 'door') f |= IS_DOOR | BLOCK_MOVE | BLOCK_SIGHT | BLOCK_CAM; // closed until opened
      this.flags[y * this.w + x] = f;
      this.navBlock[y * this.w + x] = f & BLOCK_MOVE ? 1 : 0;
    }
  }

  ch(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? ' ' : this.rows[y][x]; }
  info(x: number, y: number): TileInfo { return TILES[this.ch(x, y)] || TILES['#']; }
  idx(x: number, y: number) { return y * this.w + x; }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  cellOf(wx: number, wz: number): [number, number] { return [Math.floor(wx / this.tile), Math.floor(wz / this.tile)]; }
  center(x: number, y: number, out = new THREE.Vector3()) { return out.set((x + 0.5) * this.tile, 0, (y + 0.5) * this.tile); }
  flag(x: number, y: number) { return this.inside(x, y) ? this.flags[this.idx(x, y)] : BLOCK_MOVE | BLOCK_SIGHT | BLOCK_CAM; }

  setDoorOpen(x: number, y: number, open: boolean) {
    const i = this.idx(x, y);
    if (open) { this.flags[i] = IS_DOOR; this.navBlock[i] = 0; }
    else { this.flags[i] = IS_DOOR | BLOCK_MOVE | BLOCK_SIGHT | BLOCK_CAM; this.navBlock[i] = 1; }
  }

  addBox(minX: number, minZ: number, maxX: number, maxZ: number, sight = false, nav = true, id?: string) {
    const b: Box = { minX, minZ, maxX, maxZ, sight, id };
    this.boxes.push(b);
    const [x0, y0] = this.cellOf(minX, minZ), [x1, y1] = this.cellOf(maxX, maxZ);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.inside(x, y)) continue;
      const k = this.idx(x, y);
      let l = this.boxCells.get(k); if (!l) this.boxCells.set(k, (l = []));
      l.push(b);
      if (nav) {
        // block nav if the box covers most of the cell
        const cx0 = x * this.tile, cz0 = y * this.tile, cx1 = cx0 + this.tile, cz1 = cz0 + this.tile;
        const ox = Math.max(0, Math.min(maxX, cx1) - Math.max(minX, cx0)), oz = Math.max(0, Math.min(maxZ, cz1) - Math.max(minZ, cz0));
        if (ox * oz > this.tile * this.tile * 0.45) this.navBlock[k] = 1;
      }
    }
    return b;
  }

  removeBox(b: Box) {
    this.boxes = this.boxes.filter((o) => o !== b);
    for (const l of this.boxCells.values()) { const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); }
  }

  /** Push a circle out of solid cells and prop boxes. Returns true if it collided. */
  collide(p: THREE.Vector3, r: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const [cx, cy] = this.cellOf(p.x, p.z);
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (this.flag(x, y) & BLOCK_MOVE) {
          if (this.pushOut(p, r, x * this.tile, y * this.tile, (x + 1) * this.tile, (y + 1) * this.tile)) moved = true;
        }
        const l = this.inside(x, y) ? this.boxCells.get(this.idx(x, y)) : undefined;
        if (l) for (const b of l) if (this.pushOut(p, r, b.minX, b.minZ, b.maxX, b.maxZ)) moved = true;
      }
      if (!moved) break;
      hit = true;
    }
    return hit;
  }

  private pushOut(p: THREE.Vector3, r: number, x0: number, z0: number, x1: number, z1: number) {
    const qx = Math.max(x0, Math.min(p.x, x1)), qz = Math.max(z0, Math.min(p.z, z1));
    let dx = p.x - qx, dz = p.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 < 1e-8) {
      // centre inside box: push along the smallest axis
      const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, bb = z1 - p.z;
      const m = Math.min(l, rr, t, bb);
      if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
      return true;
    }
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    p.x += dx * k; p.z += dz * k;
    return true;
  }

  /** DDA ray through the grid; returns hit distance (m) or -1. mask selects blocking flags. */
  raycast(ox: number, oz: number, dx: number, dz: number, maxDist: number, mask = BLOCK_SIGHT, props = true): number {
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return -1;
    dx /= len; dz /= len;
    const T = this.tile;
    let x = Math.floor(ox / T), y = Math.floor(oz / T);
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const tdx = Math.abs(T / dx), tdy = Math.abs(T / dz);
    let tmx = dx > 0 ? ((x + 1) * T - ox) / dx : dx < 0 ? (x * T - ox) / dx : Infinity;
    let tmy = dz > 0 ? ((y + 1) * T - oz) / dz : dz < 0 ? (y * T - oz) / dz : Infinity;
    let t = 0;
    let best = -1;
    const seen = props ? new Set<Box>() : null;
    for (let i = 0; i < 256 && t <= maxDist; i++) {
      if (i > 0 && (this.flag(x, y) & mask)) { best = t; break; }
      if (props && this.inside(x, y)) {
        const l = this.boxCells.get(this.idx(x, y));
        if (l) for (const b of l) {
          if (seen!.has(b) || (mask === BLOCK_SIGHT && b.sight)) continue;
          seen!.add(b);
          const bt = slab(ox, oz, dx, dz, b);
          if (bt >= 0 && bt <= maxDist && (best < 0 || bt < best)) best = bt;
        }
        if (best >= 0 && best <= Math.min(tmx, tmy)) break;
      }
      if (tmx < tmy) { t = tmx; tmx += tdx; x += stepX; } else { t = tmy; tmy += tdy; y += stepY; }
    }
    return best >= 0 && best <= maxDist ? best : -1;
  }

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3, props = true) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const t = this.raycast(a.x, a.z, b.x - a.x, b.z - a.z, d, BLOCK_SIGHT, props);
    return t < 0;
  }

  walkable(x: number, y: number) { return this.inside(x, y) && !this.navBlock[this.idx(x, y)]; }

  /** A* over the tile grid (8-connected, no corner cutting) + string-pulling. */
  findPath(from: THREE.Vector3, to: THREE.Vector3, maxNodes = 1800): THREE.Vector3[] | null {
    let [sx, sy] = this.cellOf(from.x, from.z);
    let [tx, ty] = this.cellOf(to.x, to.z);
    if (!this.walkable(tx, ty)) {
      const n = this.nearestWalkable(tx, ty); if (!n) return null; [tx, ty] = n;
    }
    if (!this.walkable(sx, sy)) { const n = this.nearestWalkable(sx, sy); if (!n) return null; [sx, sy] = n; }
    const W = this.w;
    const start = sy * W + sx, goal = ty * W + tx;
    if (start === goal) return [to.clone()];
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const open: number[] = [start];
    const fScore = new Map<number, number>([[start, 0]]);
    const closed = new Set<number>();
    const H = (i: number) => { const x = i % W, y = (i / W) | 0; const ax = Math.abs(x - tx), ay = Math.abs(y - ty); return Math.max(ax, ay) + 0.414 * Math.min(ax, ay); };
    let expanded = 0;
    while (open.length && expanded < maxNodes) {
      // binary heap would be faster; open list stays small on these grids
      let bi = 0, bf = Infinity;
      for (let i = 0; i < open.length; i++) { const f = fScore.get(open[i])!; if (f < bf) { bf = f; bi = i; } }
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur); expanded++;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!this.walkable(nx, ny)) continue;
        if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (closed.has(ni)) continue;
        const ng = g.get(cur)! + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(ni) ?? Infinity)) {
          g.set(ni, ng); came.set(ni, cur); fScore.set(ni, ng + H(ni)); open.push(ni);
        }
      }
    }
    if (!came.has(goal)) return null;
    const cells: number[] = [];
    for (let c = goal; c !== start; c = came.get(c)!) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c % W, (c / W) | 0));
    pts[pts.length - 1] = to.clone().setY(0);
    // string pulling with LOS on movement-blocking geometry
    const out: THREE.Vector3[] = [];
    let anchor = from.clone();
    for (let i = 0; i < pts.length; i++) {
      const next = pts[i + 1];
      if (next && this.clearPath(anchor, next)) continue;
      out.push(pts[i]); anchor = pts[i];
    }
    return out;
  }

  /** Movement-clearance test (thick ray). */
  clearPath(a: THREE.Vector3, b: THREE.Vector3, r = 0.35) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    const nx = -dz / d * r, nz = dx / d * r;
    for (const s of [-1, 0, 1]) {
      if (this.raycast(a.x + nx * s, a.z + nz * s, dx, dz, d, BLOCK_MOVE, true) >= 0) return false;
    }
    return true;
  }

  nearestWalkable(x: number, y: number): [number, number] | null {
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (this.walkable(x + dx, y + dy)) return [x + dx, y + dy];
    }
    return null;
  }

  stepSurface(wx: number, wz: number): TileInfo['step'] {
    const [x, y] = this.cellOf(wx, wz);
    return this.info(x, y).step || 'concrete';
  }

  indoorAt(wx: number, wz: number) {
    const [x, y] = this.cellOf(wx, wz);
    return !!this.info(x, y).indoor;
  }
}

function slab(ox: number, oz: number, dx: number, dz: number, b: Box) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < b.minX || ox > b.maxX) return -1; }
  else { let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (Math.abs(dz) < 1e-9) { if (oz < b.minZ || oz > b.maxZ) return -1; }
  else { let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (tmax < Math.max(0, tmin)) return -1;
  return tmin < 0 ? 0 : tmin;
}

export { tmpV };
