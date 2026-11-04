import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AreaDef, EntityDef, LightDef, PropDef, DoorDef, ExitDef, ItemDef, DocDef, SaveDef, InteractDef, EnemyDef, TriggerDef, SoundDef, ScatterDef, SpawnDef } from './types';
import { Grid, TILES, BLOCK_CAM } from './Grid';
import { Baker, BakeLight } from './Bake';
import { surface, propMaterial, dynamicPropMaterial, waterMaterial } from './Materials';
import { assets } from '../core/Assets';
import { LightAnchor, LightPool, glowTexture } from './Lights';
import type { QualityPreset } from '../core/Quality';

export interface Interactable {
  kind: 'door' | 'item' | 'doc' | 'exit' | 'save' | 'custom';
  id: string;
  pos: THREE.Vector3;
  radius: number;
  active: boolean;
  obj?: THREE.Object3D;
  def: any;
  door?: Door;
}

const INDOOR_WALL: Record<string, string> = { w: 'wallpaper', t: 'plaster', k: 'plaster', c: 'concrete', m: 'metal_painted', q: 'rock' };
const CEILING: Record<string, string> = { w: 'plaster', t: 'ceiling', k: 'plaster', c: 'concrete', m: 'metal_painted', q: 'rock' };

class GeoBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uva: number[], uvb: number[], uvc: number[], uvd: number[]) {
    const o = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) this.nor.push(...n);
    this.uv.push(...uva, ...uvb, ...uvc, ...uvd);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
  get empty() { return this.pos.length === 0; }
}

export class Door {
  pivot = new THREE.Group();
  open = false; angle = 0; target = 0;
  cell: [number, number]; axisX: boolean;
  def: DoorDef; id: string; locked: boolean;
  kind: string;
  constructor(def: DoorDef, cell: [number, number], axisX: boolean, id: string) {
    this.def = def; this.cell = cell; this.axisX = axisX; this.id = id;
    this.locked = !!def.lock || !!def.jammed; this.kind = def.kind || 'wood';
  }
  update(dt: number) {
    this.angle += (this.target - this.angle) * Math.min(1, dt * 4);
    this.pivot.rotation.y = this.angle;
  }
}

/** A loaded, playable area: geometry, collision/nav grid, lights, interactables. */
export class Level {
  def: AreaDef;
  grid: Grid;
  baker!: Baker;
  root = new THREE.Group();
  anchors: LightAnchor[] = [];
  doors: Door[] = [];
  interactables: Interactable[] = [];
  enemies: EnemyDef[] = [];
  triggers: TriggerDef[] = [];
  spawns = new Map<string, SpawnDef>();
  sounds: SoundDef[] = [];
  chunks: { hi: THREE.Mesh; lo: THREE.Mesh | null; center: THREE.Vector3 }[] = [];
  glints: THREE.Sprite[] = [];
  T: number;
  stats = { tris: 0, meshes: 0 };
  private disposables: { dispose(): void }[] = [];

  constructor(def: AreaDef) {
    this.def = def;
    this.T = def.tile || 2;
    this.grid = new Grid(def.grid, this.T);
    this.root.name = 'level:' + def.id;
  }

  w(x: number, y: number, h = 0) { return new THREE.Vector3(x * this.T, h, y * this.T); }

  /** Entity positions are tile coordinates; .5 = tile centre. */
  async build(q: QualityPreset, pool: LightPool, flags: Set<string>) {
    const def = this.def, g = this.grid, T = this.T;
    const ents = def.entities;
    const packs = new Set<string>(['items']);
    for (const e of ents) {
      if (e.type === 'prop' || e.type === 'scatter') packs.add(e.pack);
      if (e.type === 'interact' && e.model) packs.add(e.model.pack);
      if (e.type === 'light' && e.model) packs.add(e.model.split('/')[0]);
    }
    if (g.rows.some((r) => /[T]/.test(r)) || def.voidFill === 'trees') { packs.add('nature'); packs.add('nature_lod'); }
    await Promise.all([...packs].map((p) => assets.loadPack(p)));

    // ---------- lights ----------
    const bakeLights: BakeLight[] = [];
    for (const e of ents) if (e.type === 'light') {
      const L = e as LightDef;
      const h = L.h ?? 2.7;
      const pos = this.w(L.at[0], L.at[1], h);
      const col = new THREE.Color(L.color ?? 0xffd9a8);
      const a = new LightAnchor(pos, col, L.intensity ?? 6, L.range ?? 9, L.flicker || 'none');
      a.id = L.id; a.on = !(L.off) && !(L.id && flags.has('off:' + L.id));
      if (L.id && flags.has('on:' + L.id)) a.on = true;
      pool.add(a, true, !!L.cone && q.lightCones, h);
      this.anchors.push(a);
      bakeLights.push({ x: pos.x, y: pos.y, z: pos.z, color: col, intensity: a.on ? (L.intensity ?? 6) : 0, range: (L.range ?? 9) * 1.4, bake: L.bake ?? 1 });
      if (L.model) {
        const [pk, nm] = L.model.split('/');
        ents.push({ type: 'prop', pack: pk, name: nm, at: L.at, h: nm.startsWith('Light_Ceiling') ? (def.ceiling ?? 3) - (assets.prop(pk, nm)?.size.y ?? 0.3) : 0, solid: nm === 'StreetLights' } as PropDef);
      }
    }

    // ---------- solid props first (they shape AO & nav) ----------
    const propPlacements: { pack: string; name: string; m: THREE.Matrix4; solid: boolean }[] = [];
    let flatCount = 0;
    const placeProp = (p: PropDef) => {
      const pg = assets.prop(p.pack, p.name);
      if (!pg) { console.warn('missing prop', p.pack, p.name); return; }
      const s = p.scale ?? 1;
      const rot = THREE.MathUtils.degToRad(p.rot ?? 0);
      // paper-thin ground decals (blood pools) would z-fight with the floor: lift them a
      // few mm, each a little more than the last so overlapping ones don't fight either
      const lift = pg.size.y < 0.005 ? 0.012 + (flatCount++ % 6) * 0.004 : 0;
      const pos = this.w(p.at[0], p.at[1], (p.h ?? 0) + lift);
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ? THREE.MathUtils.degToRad(p.tilt) : 0, rot, 0)), new THREE.Vector3(s, s, s));
      const solid = p.solid ?? (pg.size.y * s > 0.6 && Math.max(pg.size.x, pg.size.z) * s > 0.5);
      propPlacements.push({ pack: p.pack, name: p.name, m, solid });
      if (solid) {
        const bb = new THREE.Box3(pg.min.clone(), pg.max.clone()).applyMatrix4(m);
        const pad = 0.05;
        g.addBox(bb.min.x + pad, bb.min.z + pad, bb.max.x - pad, bb.max.z - pad, p.sight ?? (pg.size.y * s < 1.3), true);
      }
    };
    for (const e of ents) if (e.type === 'prop') placeProp(e as PropDef);
    for (const e of ents) if (e.type === 'interact' && (e as InteractDef).model && !((e as InteractDef).hideFlag && flags.has((e as InteractDef).hideFlag!))) {
      const I = e as InteractDef;
      placeProp({ type: 'prop', pack: I.model!.pack, name: I.model!.name, at: I.at, rot: I.model!.rot, scale: I.model!.scale, h: I.model!.h, solid: I.model!.solid });
    }
    for (const e of ents) if (e.type === 'scatter') this.scatter(e as ScatterDef, q, propPlacements);

    const env = def.env;
    this.baker = new Baker(g, bakeLights, new THREE.Color(env.ambient).multiplyScalar(6), env.outdoor ? 1.6 : 1);

    // ---------- floors / walls / ceilings ----------
    const builders = new Map<string, { b: GeoBuilder; kind: 'floor' | 'wall' | 'ceil' }>();
    const B = (mat: string, kind: 'floor' | 'wall' | 'ceil') => {
      const k = kind + ':' + mat;
      let v = builders.get(k); if (!v) builders.set(k, (v = { b: new GeoBuilder(), kind }));
      return v.b;
    };
    const ceilH = def.ceiling ?? 3;
    const wallH = def.wallHeight ?? 3.4;
    const uvs = 1 / 2; // texture covers 2 m
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const info = g.info(x, y);
      const x0 = x * T, z0 = y * T, x1 = x0 + T, z1 = z0 + T;
      if (info.kind === 'floor' || info.kind === 'door') {
        let fm = info.floor;
        let indoor = info.indoor;
        if (info.kind === 'door') { const n = this.doorFloor(x, y); fm = n.floor; indoor = n.indoor; }
        const fb = B(fm || 'concrete', 'floor');
        const hs = T / 2;
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
          const ax = x0 + sx * hs, az = z0 + sy * hs, bx = ax + hs, bz = az + hs;
          fb.quad([ax, 0, az], [ax, 0, bz], [bx, 0, bz], [bx, 0, az], [0, 1, 0], [ax * uvs, az * uvs], [ax * uvs, bz * uvs], [bx * uvs, bz * uvs], [bx * uvs, az * uvs]);
        }
        if (indoor) {
          const cm = CEILING[this.dominantIndoor(x, y)] || 'plaster';
          const cb = B(cm, 'ceil');
          cb.quad([x0, ceilH, z0], [x1, ceilH, z0], [x1, ceilH, z1], [x0, ceilH, z1], [0, -1, 0], [x0 * uvs, z0 * uvs], [x1 * uvs, z0 * uvs], [x1 * uvs, z1 * uvs], [x0 * uvs, z1 * uvs]);
          // roof cap seen from outside
          const rb = B('roof', 'ceil');
          rb.quad([x0, wallH, z0], [x0, wallH, z1], [x1, wallH, z1], [x1, wallH, z0], [0, 1, 0], [x0 * uvs, z0 * uvs], [x0 * uvs, z1 * uvs], [x1 * uvs, z1 * uvs], [x1 * uvs, z0 * uvs]);
        }
      } else if (info.kind === 'wall' && !['T', 'F', 'X', 'v'].includes(g.ch(x, y))) {
        const H = info.height ?? wallH;
        const ch = g.ch(x, y);
        const nbs: [number, number, number[], number[][]][] = [
          [x, y - 1, [0, 0, -1], [[x1, z0], [x0, z0]]],
          [x, y + 1, [0, 0, 1], [[x0, z1], [x1, z1]]],
          [x - 1, y, [-1, 0, 0], [[x0, z0], [x0, z1]]],
          [x + 1, y, [1, 0, 0], [[x1, z1], [x1, z0]]],
        ];
        let topNeeded = false;
        for (const [nx, ny, n, [[ax, az], [bx, bz]]] of nbs) {
          const ni = g.info(nx, ny);
          const nch = g.ch(nx, ny);
          if (ni.kind === 'void') continue;
          if (ni.kind === 'wall' && !['T', 'F', 'X', 'v'].includes(nch)) continue;
          const nIndoor = ni.indoor || (ni.kind === 'door' && this.doorFloor(nx, ny).indoor);
          let mat = TILES[ch]?.wall || def.defaultWall || 'concrete';
          if (nIndoor && (ch === '#' || ch === 'B' || ch === 'C')) mat = INDOOR_WALL[this.dominantIndoor(nx, ny)] || 'plaster';
          if (ch === 'R') mat = 'rock';
          const h = nIndoor ? ceilH : H;
          if (!nIndoor) topNeeded = true;
          const wb = B(mat, 'wall');
          this.wallQuad(wb, ax, az, bx, bz, 0, Math.min(1.2, h), n, ch === 'R');
          this.wallQuad(wb, ax, az, bx, bz, Math.min(1.2, h), h, n, ch === 'R');
        }
        if (topNeeded) {
          const H2 = info.height ?? wallH;
          B('roof', 'ceil').quad([x0, H2, z0], [x0, H2, z1], [x1, H2, z1], [x1, H2, z0], [0, 1, 0], [0, 0], [0, 1], [1, 1], [1, 0]);
        }
      } else if (info.kind === 'water') {
        // handled below
      }
    }
    if (def.voidFill === 'trees') this.buildSkirt((m) => B(m, 'floor'));
    for (const [key, { b, kind }] of builders) {
      if (b.empty) continue;
      const geo = b.build();
      if (key.includes('rock') && kind === 'wall') this.jitterRock(geo);
      this.baker.bakeGeometry(geo, kind);
      const mat = surface(key.split(':')[1]);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = kind === 'wall' && q.shadows;
      mesh.matrixAutoUpdate = false;
      this.add(mesh, geo);
    }

    // ---------- special tiles: water, fences, windows, rubble ----------
    this.buildSpecialTiles(q, propPlacements);

    // ---------- trees ----------
    this.buildTrees(q, propPlacements);

    // ---------- merge static props into spatial chunks ----------
    this.mergeProps(propPlacements, q);

    // ---------- doors ----------
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const ch = g.ch(x, y);
      if (ch !== 'D' && ch !== 'S' && ch !== 'G') continue;
      const dd = (ents.find((e) => e.type === 'door' && Math.floor(e.at[0]) === x && Math.floor(e.at[1]) === y) as DoorDef) || { type: 'door', at: [x, y], kind: ch === 'D' ? 'wood' : ch === 'S' ? 'metal' : 'gate' } as DoorDef;
      if (!dd.kind) dd.kind = ch === 'D' ? 'wood' : ch === 'S' ? 'metal' : 'gate';
      const exit = ents.find((e) => e.type === 'exit' && Math.floor(e.at[0]) === x && Math.floor(e.at[1]) === y) as ExitDef | undefined;
      this.buildDoor(dd, x, y, flags, exit);
    }

    // ---------- interactables ----------
    for (const e of ents) this.addEntity(e, flags);

    this.root.updateMatrixWorld(true);
  }

  private add(mesh: THREE.Object3D, geo?: THREE.BufferGeometry) {
    this.root.add(mesh);
    mesh.updateMatrix();
    if (geo) { this.disposables.push(geo); this.stats.tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; this.stats.meshes++; }
  }

  private wallQuad(b: GeoBuilder, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, n: number[], rock: boolean) {
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = (Math.abs(n[0]) > 0 ? az : ax) / 2, du = len / 2 * ((n[2] > 0 || n[0] < 0) ? 1 : -1);
    const s = 0.5;
    b.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, [u0, y0 * s], [u0 + du, y0 * s], [u0 + du, y1 * s], [u0, y1 * s]);
  }

  private jitterRock(geo: THREE.BufferGeometry) {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.sin(x * 1.7 + y * 2.3) * 0.25 + Math.sin(z * 1.3 - y * 1.1) * 0.25 + Math.sin((x + z) * 0.6) * 0.3;
      p.setXYZ(i, x + n.getX(i) * k, y, z + n.getZ(i) * k);
    }
    geo.computeVertexNormals();
  }

  private doorFloor(x: number, y: number) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const i = this.grid.info(x + dx, y + dy);
      if (i.kind === 'floor' && i.indoor) return { floor: i.floor, indoor: true };
    }
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const i = this.grid.info(x + dx, y + dy);
      if (i.kind === 'floor') return { floor: i.floor, indoor: false };
    }
    return { floor: 'concrete', indoor: false };
  }

  private dominantIndoor(x: number, y: number) {
    const ch = this.grid.ch(x, y);
    if (TILES[ch]?.indoor) return ch;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const c = this.grid.ch(x + dx, y + dy); if (TILES[c]?.indoor) return c; }
    return 'c';
  }

  private rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

  private scatter(sd: ScatterDef, q: QualityPreset, out: { pack: string; name: string; m: THREE.Matrix4; solid: boolean }[]) {
    const r = this.rng(sd.seed ?? (sd.rect[0] * 7919 + sd.rect[1] * 104729 + sd.count));
    const n = Math.round(sd.count * (sd.solid ? 1 : q.grass));
    const [x0, y0, x1, y1] = sd.rect;
    let placed = 0, tries = 0;
    while (placed < n && tries < n * 8) {
      tries++;
      const tx = x0 + r() * (x1 - x0), ty = y0 + r() * (y1 - y0);
      const cx = Math.floor(tx), cy = Math.floor(ty);
      const ch = this.grid.ch(cx, cy);
      if (sd.on ? !sd.on.includes(ch) : TILES[ch]?.kind !== 'floor') continue;
      const name = sd.names[Math.floor(r() * sd.names.length)];
      const pg = assets.prop(sd.pack, name); if (!pg) continue;
      const s = (sd.scale ? sd.scale[0] + r() * (sd.scale[1] - sd.scale[0]) : 1);
      const m = new THREE.Matrix4().compose(this.w(tx, ty, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2), new THREE.Vector3(s, s, s));
      out.push({ pack: sd.pack, name, m, solid: !!sd.solid });
      if (sd.solid) {
        const bb = new THREE.Box3(pg.min.clone(), pg.max.clone()).applyMatrix4(m);
        this.grid.addBox(bb.min.x + 0.1, bb.min.z + 0.1, bb.max.x - 0.1, bb.max.z - 0.1, true, true);
      }
      placed++;
    }
  }

  /** Tree/forest margin around outdoor maps (cells). */
  static SKIRT = 12;

  /**
   * Material of a path that continues out of the map through an exit (road past
   * the forest gate etc.), or null. Only for cells outside the grid, straight out
   * from the edge (not corners).
   */
  private laneOut(x: number, y: number): string | null {
    const g = this.grid;
    if (g.inside(x, y)) return null;
    const ox = x < 0 || x >= g.w, oy = y < 0 || y >= g.h;
    if (ox === oy) return null;
    const dx = x < 0 ? 1 : x >= g.w ? -1 : 0, dy = y < 0 ? 1 : y >= g.h ? -1 : 0;
    let ix = Math.min(g.w - 1, Math.max(0, x)), iy = Math.min(g.h - 1, Math.max(0, y));
    for (let i = 0; i < 3; i++, ix += dx, iy += dy) {
      const ch = g.ch(ix, iy), inf = g.info(ix, iy);
      if (ch === 'F' || ch === 'G' || ch === 'D' || ch === 'S') continue; // fences/gates/doors on the edge
      if (inf.kind === 'floor' && inf.floor && !inf.indoor) return inf.floor;
      return null;
    }
    return null;
  }

  /**
   * Outdoor maps never end at the grid edge: ground under tree cells and a
   * forest-floor skirt around the whole map, with roads/paths running on out of
   * the exits. Trees on the skirt come from buildTrees().
   */
  private buildSkirt(floorB: (mat: string) => GeoBuilder) {
    const g = this.grid, T = this.T, M = Level.SKIRT, uvs = 1 / 2;
    for (let y = -M; y < g.h + M; y++) for (let x = -M; x < g.w + M; x++) {
      let mat: string | null = null;
      if (g.inside(x, y)) {
        const ch = g.ch(x, y);
        if (ch === 'T' || ch === ' ') mat = 'ground_forest';
      } else mat = this.laneOut(x, y) ?? 'ground_forest';
      if (!mat) continue;
      const x0 = x * T, z0 = y * T, x1 = x0 + T, z1 = z0 + T;
      floorB(mat).quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [0, 1, 0], [x0 * uvs, z0 * uvs], [x0 * uvs, z1 * uvs], [x1 * uvs, z1 * uvs], [x1 * uvs, z0 * uvs]);
    }
  }

  private buildTrees(q: QualityPreset, out: { pack: string; name: string; m: THREE.Matrix4; solid: boolean }[]) {
    const g = this.grid;
    const r = this.rng(4242 + g.w * 13 + g.h);
    const evergreen = ['PineTree_1', 'PineTree_2', 'PineTree_3', 'PineTree_4', 'PineTree_5'];
    const dead = ['CommonTree_Dead_1', 'CommonTree_Dead_2', 'CommonTree_Dead_3', 'BirchTree_Dead_1', 'BirchTree_Dead_2', 'Willow_Dead_1'];
    const outdoorFill = this.def.voidFill === 'trees';
    const open = (x: number, y: number) => {
      if (!g.inside(x, y)) return outdoorFill && this.laneOut(x, y) !== null;
      const k = g.info(x, y).kind; return k === 'floor' || k === 'door' || k === 'water';
    };
    const DMAX = outdoorFill ? 7 : 4;
    const distToFloor = (x: number, y: number) => {
      for (let d = 1; d <= DMAX; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        if (open(x + dx, y + dy)) return d;
      }
      return 99;
    };
    const M = outdoorFill ? Level.SKIRT : 3;
    for (let y = -M; y < g.h + M; y++) for (let x = -M; x < g.w + M; x++) {
      const ch = g.ch(x, y);
      const isTree = ch === 'T' || (ch === ' ' && outdoorFill && !open(x, y));
      if (!isTree) continue;
      const d = distToFloor(x, y);
      if (d > DMAX) continue;
      // big trees (~9-12 m): sparse placement still reads as dense forest; the
      // outer belt (d >= 5) only has to break the horizon inside the fog
      const chance = d <= 1 ? 0.55 : d === 2 ? 0.38 : d <= 4 ? 0.2 : 0.11;
      if (r() > chance) continue;
      const pool = r() < 0.7 ? evergreen : dead;
      const name = pool[Math.floor(r() * pool.length)];
      // slender spruce-like silhouettes keep branches out of the walkable lane
      const s = 0.75 + r() * 0.45;
      const sxz = s * (pool === evergreen ? 0.42 + r() * 0.12 : 0.6 + r() * 0.2) * (d <= 1 ? 0.85 : 1);
      const jx = 0.3 + r() * 0.4, jy = 0.3 + r() * 0.4;
      const m = new THREE.Matrix4().compose(this.w(x + jx, y + jy, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(sxz, s * (0.95 + r() * 0.3), sxz));
      out.push({ pack: d <= 1 ? 'nature' : 'nature_lod', name, m, solid: false });
      if (d <= 2 && r() < 0.45) {
        const extra = ['Bush_1', 'Bush_2', 'Rock_Moss_1', 'Rock_Moss_2', 'Rock_2', 'Rock_3'][Math.floor(r() * 6)];
        out.push({ pack: d <= 1 ? 'nature' : 'nature_lod', name: extra, m: new THREE.Matrix4().compose(this.w(x + r(), y + r(), 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(0.8 + r() * 0.7, 0.8 + r() * 0.7, 0.8 + r() * 0.7)), solid: false });
      }
    }
  }

  private buildSpecialTiles(q: QualityPreset, out: { pack: string; name: string; m: THREE.Matrix4; solid: boolean }[]) {
    const g = this.grid, T = this.T;
    const water = new GeoBuilder();
    const fence: THREE.BufferGeometry[] = [];
    const boards: THREE.BufferGeometry[] = [];
    const wallBits = new Map<string, THREE.BufferGeometry[]>();
    const r = this.rng(777);
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0) => {
      const b = new THREE.BoxGeometry(sx, sy, sz);
      b.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
      return b;
    };
    const wallH = this.def.wallHeight ?? 3.4, ceilH = this.def.ceiling ?? 3;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const ch = g.ch(x, y);
      const cx = (x + 0.5) * T, cz = (y + 0.5) * T;
      if (ch === '~') {
        const x0 = x * T, z0 = y * T, x1 = x0 + T, z1 = z0 + T;
        water.quad([x0, -0.12, z0], [x0, -0.12, z1], [x1, -0.12, z1], [x1, -0.12, z0], [0, 1, 0], [x0 / 4, z0 / 4], [x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4]);
      } else if (ch === 'F') {
        const horiz = ['F', '#', 'B', 'C', 'G', 'W'].includes(g.ch(x - 1, y)) || ['F', '#', 'B', 'C', 'G', 'W'].includes(g.ch(x + 1, y));
        const ry = horiz ? 0 : Math.PI / 2;
        const ax = horiz ? [1, 0] : [0, 1];
        fence.push(box(0.08, 1.3, 0.08, cx - ax[0] * T / 2, 0.65, cz - ax[1] * T / 2));
        fence.push(box(T, 0.06, 0.05, cx, 1.18, cz, ry));
        fence.push(box(T, 0.05, 0.05, cx, 0.35, cz, ry));
        for (let i = 0; i < 9; i++) { const o = -T / 2 + (i + 0.5) * (T / 9); fence.push(box(0.025, 0.85, 0.025, cx + ax[0] * o, 0.77, cz + ax[1] * o, ry)); }
        g.addBox(cx - (horiz ? T / 2 : 0.12), cz - (horiz ? 0.12 : T / 2), cx + (horiz ? T / 2 : 0.12), cz + (horiz ? 0.12 : T / 2), true, false);
      } else if (ch === 'v') {
        const horiz = !(g.info(x, y - 1).kind === 'wall' && g.info(x, y + 1).kind === 'wall');
        const n1 = horiz ? g.info(x, y - 1) : g.info(x - 1, y), n2 = horiz ? g.info(x, y + 1) : g.info(x + 1, y);
        const indoor = n1.indoor || n2.indoor;
        const H = indoor ? ceilH : wallH;
        // window takes the material of the wall line it sits in
        const along = horiz ? [g.ch(x - 1, y), g.ch(x + 1, y)] : [g.ch(x, y - 1), g.ch(x, y + 1)];
        const explicit = along.map((c) => TILES[c]?.wall).find((m) => m && !['tree', 'fence', 'window', 'rubble'].includes(m));
        const mat = explicit && !['bricks', 'concrete'].includes(explicit) ? explicit : indoor ? INDOOR_WALL[this.dominantIndoor(x, y)] || 'plaster' : (explicit || this.def.defaultWall || 'bricks');
        const L = horiz ? T : 0.3, D = horiz ? 0.3 : T;
        const bits = wallBits.get(mat) || []; wallBits.set(mat, bits);
        bits.push(box(L, 0.95, D, cx, 0.475, cz));
        bits.push(box(L, H - 2.15, D, cx, 2.15 + (H - 2.15) / 2, cz));
        const ry = horiz ? 0 : Math.PI / 2;
        for (let i = 0; i < 3; i++) boards.push(box(T * 0.95, 0.16, 0.035, cx, 1.15 + i * 0.36 + r() * 0.05, cz, ry + (r() - 0.5) * 0.25));
      } else if (ch === 'X') {
        const pick = ['CinderBlock', 'Pallet_Broken', 'TrashBag_1', 'Barrel'];
        for (let i = 0; i < 3; i++) out.push({ pack: 'urban', name: pick[Math.floor(r() * pick.length)], m: new THREE.Matrix4().compose(this.w(x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(1, 1, 1)), solid: false });
      }
    }
    if (!water.empty) { const geo = water.build(); const m = new THREE.Mesh(geo, waterMaterial()); m.receiveShadow = true; this.add(m, geo); }
    const solid = (geos: THREE.BufferGeometry[], matName: string, kind: 'wall' | 'prop') => {
      if (!geos.length) return;
      const geo = mergeGeometries(geos.map((b) => b.toNonIndexed()), false)!;
      geos.forEach((b) => b.dispose());
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(n.getX(i)) > 0.5;
        uv.setXY(i, (ax ? p.getZ(i) : p.getX(i)) * 0.5, p.getY(i) * 0.5);
      }
      this.baker.bakeGeometry(geo, kind === 'wall' ? 'wall' : 'prop');
      const mesh = new THREE.Mesh(geo, surface(matName));
      mesh.receiveShadow = true; mesh.castShadow = q.shadows;
      this.add(mesh, geo);
    };
    solid(fence, 'metal_rust', 'prop');
    solid(boards, 'planks', 'prop');
    for (const [mat, bits] of wallBits) solid(bits, mat, 'wall');
  }

  private mergeProps(list: { pack: string; name: string; m: THREE.Matrix4; solid: boolean }[], q: QualityPreset) {
    const CH = 16;
    const buckets = new Map<string, { geos: THREE.BufferGeometry[]; lod: THREE.BufferGeometry[]; center: THREE.Vector3 }>();
    const v = new THREE.Vector3();
    for (const p of list) {
      const pg = assets.prop(p.pack, p.name);
      if (!pg) continue;
      v.setFromMatrixPosition(p.m);
      const isTree = p.pack === 'nature' || p.pack === 'nature_lod';
      const key = `${isTree ? 'n' : 'p'}:${Math.floor(v.x / CH)},${Math.floor(v.z / CH)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { geos: [], lod: [], center: new THREE.Vector3((Math.floor(v.x / CH) + 0.5) * CH, 0, (Math.floor(v.z / CH) + 0.5) * CH), nature: isTree } as any));
      const geo = pg.geometry.clone();
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(p.m);
      if (!geo.attributes.color) { const c = new Float32Array(geo.attributes.position.count * 4).fill(1); geo.setAttribute('color', new THREE.BufferAttribute(c, 4)); }
      if (!geo.attributes._rm) { const c = new Float32Array(geo.attributes.position.count * 2); for (let i = 0; i < c.length; i += 2) { c[i] = 0.85; c[i + 1] = 0; } geo.setAttribute('_rm', new THREE.BufferAttribute(c, 2)); }
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', '_rm'].includes(k)) geo.deleteAttribute(k);
      if (isTree && p.pack === 'nature') {
        b.geos.push(geo);
        const lg = assets.prop('nature_lod', p.name);
        if (lg) {
          const l = lg.geometry.clone(); if (!l.attributes.normal) l.computeVertexNormals(); l.applyMatrix4(p.m);
          for (const k of Object.keys(l.attributes)) if (!['position', 'normal', 'color', '_rm'].includes(k)) l.deleteAttribute(k);
          b.lod.push(l);
        } else b.lod.push(geo.clone());
      } else if (p.pack === 'nature_lod') {
        b.geos.push(geo); b.lod.push(geo.clone());
      } else {
        b.geos.push(geo); b.lod.push(geo.clone());
      }
    }
    const mat = propMaterial();
    for (const b of buckets.values()) {
      const norm = (gs: THREE.BufferGeometry[]) => gs.map((x) => (x.index ? x.toNonIndexed() : x));
      const hiGeo = mergeGeometries(norm(b.geos), false);
      if (!hiGeo) continue;
      this.baker.bakeGeometry(hiGeo, 'prop');
      const hi = new THREE.Mesh(hiGeo, mat);
      // vegetation only casts flashlight shadows on high; props always do when shadows are on
      hi.castShadow = q.shadows && (!(b as any).nature || q.level === 'high'); hi.receiveShadow = true;
      this.add(hi, hiGeo);
      let lo: THREE.Mesh | null = null;
      if (b.lod.length && b.lod.some((x, i) => x.attributes.position.count !== b.geos[i]?.attributes.position.count)) {
        const loGeo = mergeGeometries(norm(b.lod), false);
        if (loGeo) {
          this.baker.bakeGeometry(loGeo, 'prop');
          lo = new THREE.Mesh(loGeo, mat); lo.castShadow = false; lo.visible = false;
          this.root.add(lo); this.disposables.push(loGeo);
        }
      }
      this.chunks.push({ hi, lo, center: b.center });
    }
  }

  private buildDoor(dd: DoorDef, x: number, y: number, flags: Set<string>, exit?: ExitDef) {
    const g = this.grid, T = this.T;
    const axisX = g.info(x - 1, y).kind === 'wall' || g.info(x + 1, y).kind === 'wall'; // door plane spans X
    const id = dd.id || `${this.def.id}_door_${x}_${y}`;
    const door = new Door(dd, [x, y], axisX, id);
    if (flags.has('unlock:' + id)) door.locked = false;
    const cx = (x + 0.5) * T, cz = (y + 0.5) * T;
    const gate = door.kind === 'gate';
    const ow = gate ? T * 0.92 : 1.1; // opening width
    const dh = gate ? 2.4 : 2.15;
    const ceilH = this.def.ceiling ?? 3, wallH = this.def.wallHeight ?? 3.4;
    const n1 = axisX ? g.info(x, y - 1) : g.info(x - 1, y), n2 = axisX ? g.info(x, y + 1) : g.info(x + 1, y);
    const indoor = n1.indoor || n2.indoor;
    const H = indoor && n1.indoor && n2.indoor ? ceilH : wallH;
    // frame: side jambs + lintel using neighbour wall material
    const nb = axisX ? g.ch(x - 1, y) : g.ch(x, y - 1);
    let mat = TILES[nb]?.wall || this.def.defaultWall || 'concrete';
    if (indoor && (nb === '#' || nb === 'B' || nb === 'C')) mat = INDOOR_WALL[this.dominantIndoor(x, y)] || 'plaster';
    if (['tree', 'fence', 'window', 'rubble'].includes(mat)) mat = 'concrete';
    const parts: THREE.BufferGeometry[] = [];
    const side = (T - ow) / 2;
    const thick = 0.3;
    const mk = (sx: number, sy: number, sz: number, px: number, py: number, pz: number) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(px, py, pz); parts.push(b.toNonIndexed()); };
    if (!gate) {
      if (axisX) { mk(side, H, thick, cx - T / 2 + side / 2, H / 2, cz); mk(side, H, thick, cx + T / 2 - side / 2, H / 2, cz); mk(ow, H - dh, thick, cx, dh + (H - dh) / 2, cz); }
      else { mk(thick, H, side, cx, H / 2, cz - T / 2 + side / 2); mk(thick, H, side, cx, H / 2, cz + T / 2 - side / 2); mk(thick, H - dh, ow, cx, dh + (H - dh) / 2, cz); }
      const fg = mergeGeometries(parts, false)!;
      const uv = fg.attributes.uv as THREE.BufferAttribute, p = fg.attributes.position as THREE.BufferAttribute, nn = fg.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.abs(nn.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) * 0.5, p.getY(i) * 0.5);
      this.baker.bakeGeometry(fg, 'wall');
      const fm = new THREE.Mesh(fg, surface(mat)); fm.receiveShadow = true; this.add(fm, fg);
      if (axisX) { g.addBox(cx - T / 2, cz - thick / 2, cx - ow / 2, cz + thick / 2, false, false); g.addBox(cx + ow / 2, cz - thick / 2, cx + T / 2, cz + thick / 2, false, false); }
      else { g.addBox(cx - thick / 2, cz - T / 2, cx + thick / 2, cz - ow / 2, false, false); g.addBox(cx - thick / 2, cz + ow / 2, cx + thick / 2, cz + T / 2, false, false); }
    }
    // panel
    const pw = ow - 0.04, pt = gate ? 0.05 : 0.06;
    const panelGeo = new THREE.BoxGeometry(pw, dh - 0.03, pt);
    panelGeo.translate(pw / 2, (dh - 0.03) / 2, 0);
    const puv = panelGeo.attributes.uv as THREE.BufferAttribute, pp = panelGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < puv.count; i++) puv.setXY(i, pp.getX(i) * 0.6, pp.getY(i) * 0.45);
    const pm = door.kind === 'wood' ? 'planks' : door.kind === 'gate' ? 'metal_rust' : 'metal_green';
    const fakeBake = new Float32Array(panelGeo.attributes.position.count * 4);
    const c = new THREE.Color(); this.baker.sample(cx, cz, c);
    for (let i = 0; i < fakeBake.length; i += 4) { fakeBake[i] = c.r; fakeBake[i + 1] = c.g; fakeBake[i + 2] = c.b; fakeBake[i + 3] = 0.9; }
    panelGeo.setAttribute('aBake', new THREE.BufferAttribute(fakeBake, 4));
    const panel = new THREE.Mesh(panelGeo, surface(pm));
    panel.castShadow = true; panel.receiveShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b6258, metalness: 0.8, roughness: 0.35 }));
    knob.position.set(pw - 0.09, 1.0, pt / 2 + 0.03);
    const knob2 = knob.clone(); knob2.position.z = -knob.position.z;
    if (!gate) panel.add(knob, knob2);
    door.pivot.add(panel);
    if (axisX) door.pivot.position.set(cx - ow / 2 + 0.02, 0, cz);
    else { door.pivot.position.set(cx, 0, cz - ow / 2 + 0.02); door.pivot.rotation.y = -Math.PI / 2; panel.rotation.y = 0; }
    const holder = new THREE.Group(); holder.add(door.pivot);
    if (!axisX) { holder.position.set(0, 0, 0); door.pivot.rotation.set(0, 0, 0); door.pivot.position.set(cx, 0, cz - ow / 2 + 0.02); panel.rotation.y = -Math.PI / 2; }
    this.root.add(holder);
    this.doors.push(door);
    const isExit = !!exit;
    if (dd.open || flags.has('open:' + id)) { door.open = true; door.target = door.angle = axisX ? -1.6 : 1.6; g.setDoorOpen(x, y, true); door.update(0); }
    this.interactables.push({ kind: isExit ? 'exit' : 'door', id, pos: new THREE.Vector3(cx, 1, cz), radius: 1.7, active: true, obj: door.pivot, def: isExit ? exit : dd, door });
  }

  private itemModel(item: string): { pack: string; name: string; scale: number } {
    const M: Record<string, [string, number]> = {
      ammo_9mm: ['Can_Closed', 1.2], ammo_shell: ['Can_Red', 1.2], bandage: ['Bandages', 1.5], medkit: ['FirstAidKit', 1], adrenaline: ['WaterBottle_1', 1],
      battery: ['Battery_Big', 1.6], knife: ['Knife', 1.3], flare: ['FlareGun', 1.2], pistol: ['W_Pistol', 1.4], shotgun: ['Shotgun_1', 1], pipe: ['Shovel', 1],
      backpack: ['Backpack', 1], fuel: ['GasCan', 1], tape: ['Radio', 0.8], key: ['Matchbox', 2.2],
    };
    const k = M[item] || (item.startsWith('key') || item.startsWith('card') || item.startsWith('q_') ? M.key : ['Can_Closed', 1]);
    return { pack: 'items', name: k[0] as string, scale: k[1] as number };
  }

  private addEntity(e: EntityDef, flags: Set<string>) {
    const T = this.T;
    switch (e.type) {
      case 'item': case 'doc': {
        const d = e as ItemDef | DocDef;
        if (flags.has('took:' + d.id)) return;
        const pos = this.w(d.at[0], d.at[1], d.h ?? 0);
        let obj: THREE.Object3D;
        if (e.type === 'doc') {
          const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32), new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.9, emissive: 0x18160f }));
          paper.rotation.x = -Math.PI / 2; paper.rotation.z = (d.rot ?? 15) * Math.PI / 180; paper.position.y = 0.012;
          obj = new THREE.Group(); obj.add(paper);
          if ((d as DocDef).doc.startsWith('tape')) {
            const tp = assets.prop('items', 'Radio');
            if (tp) { const m = new THREE.Mesh(tp.geometry, dynamicPropMaterial()); m.scale.setScalar(0.7); obj.add(m); paper.visible = false; }
          }
        } else {
          const im = this.itemModel((d as ItemDef).item);
          const pg = assets.prop(im.pack, im.name);
          obj = pg ? new THREE.Mesh(pg.geometry, dynamicPropMaterial()) : new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.15), dynamicPropMaterial());
          obj.scale.setScalar(im.scale);
          obj.rotation.y = ((d.rot ?? (Math.random() * 360)) * Math.PI) / 180;
        }
        obj.position.copy(pos);
        obj.castShadow = true;
        this.root.add(obj);
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xcfe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
        glint.scale.setScalar(0.35); glint.position.copy(pos).add(new THREE.Vector3(0, 0.25, 0));
        this.root.add(glint); this.glints.push(glint);
        (glint as any).phase = Math.random() * 6;
        this.interactables.push({ kind: e.type === 'doc' ? 'doc' : 'item', id: d.id, pos: pos.clone().setY(0.6), radius: 1.75, active: true, obj, def: d, door: undefined, glint } as any);
        break;
      }
      case 'exit': {
        const x = e as ExitDef;
        const ch = this.grid.ch(Math.floor(x.at[0]), Math.floor(x.at[1]));
        if (ch === 'D' || ch === 'S' || ch === 'G') return; // handled as door
        this.interactables.push({ kind: 'exit', id: `exit_${x.to}_${x.spawn}`, pos: this.w(x.at[0], x.at[1], 1), radius: x.kind === 'path' ? 2.2 : 1.8, active: true, def: x });
        break;
      }
      case 'save': {
        const s = e as SaveDef;
        const pos = this.w(s.at[0], s.at[1], 0.85);
        const pg = assets.prop('items', 'Radio');
        const obj = pg ? new THREE.Mesh(pg.geometry, dynamicPropMaterial()) : new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.15));
        obj.position.copy(pos); obj.rotation.y = ((s.dir ?? 0) * Math.PI) / 180;
        this.root.add(obj);
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
        lamp.scale.setScalar(0.25); lamp.position.copy(pos).add(new THREE.Vector3(0, 0.22, 0));
        this.root.add(lamp); this.glints.push(lamp);
        this.interactables.push({ kind: 'save', id: s.id, pos: pos.clone(), radius: 2.0, active: true, obj, def: s });
        break;
      }
      case 'interact': {
        const I = e as InteractDef;
        if (I.hideFlag && flags.has(I.hideFlag)) return;
        this.interactables.push({ kind: 'custom', id: I.id, pos: this.w(I.at[0], I.at[1], 1), radius: I.radius ?? 1.8, active: true, def: I });
        break;
      }
      case 'enemy': this.enemies.push(e as EnemyDef); break;
      case 'trigger': this.triggers.push(e as TriggerDef); break;
      case 'spawn': this.spawns.set((e as SpawnDef).id, e as SpawnDef); break;
      case 'sound': this.sounds.push(e as SoundDef); break;
    }
  }

  removeInteractable(it: Interactable) {
    it.active = false;
    if (it.obj && it.kind !== 'door' && it.kind !== 'exit') this.root.remove(it.obj);
    const gl = (it as any).glint; if (gl) { this.root.remove(gl); this.glints = this.glints.filter((x) => x !== gl); }
  }

  openDoor(d: Door, fromPos: THREE.Vector3) {
    if (d.open) return;
    d.open = true;
    const T = this.T;
    const c = new THREE.Vector3((d.cell[0] + 0.5) * T, 0, (d.cell[1] + 0.5) * T);
    // swing away from the player
    const side = d.axisX ? Math.sign(fromPos.z - c.z) : Math.sign(fromPos.x - c.x);
    d.target = (d.axisX ? 1 : -1) * (side >= 0 ? 1.65 : -1.65);
    this.grid.setDoorOpen(d.cell[0], d.cell[1], true);
  }

  update(dt: number, t: number, camPos: THREE.Vector3) {
    for (const d of this.doors) d.update(dt);
    for (const gl of this.glints) {
      const ph = (gl as any).phase ?? 0;
      (gl.material as THREE.SpriteMaterial).opacity = 0.25 + 0.35 * Math.max(0, Math.sin(t * 2.4 + ph));
    }
    for (const c of this.chunks) {
      if (!c.lo) continue;
      const far = c.center.distanceTo(camPos) > 24;
      c.hi.visible = !far; c.lo.visible = far;
    }
  }

  spawnPos(id: string): { pos: THREE.Vector3; dir: number } {
    const s = this.spawns.get(id) || [...this.spawns.values()][0];
    if (!s) return { pos: this.w(this.grid.w / 2, this.grid.h / 2), dir: 0 };
    return { pos: this.w(s.at[0], s.at[1], 0), dir: ((s.dir ?? 0) * Math.PI) / 180 };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.traverse((o: any) => { if (o.isSprite) o.material.dispose(); });
    this.root.parent?.remove(this.root);
  }
}
