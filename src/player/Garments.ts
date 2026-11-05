import * as THREE from 'three';
import { assets } from '../core/Assets';
import { patchCharacter } from '../world/Materials';

/**
 * Real clothes for Ela instead of paint on the skin: a jacket, jeans and boots grown
 * as thin shells from the body mesh (so they deform with the same skin weights), each
 * with its own tiling fabric (CC0, Poly Haven) and real thickness at the openings: a
 * flared hem, cuffs, a stand-up collar and a jeans hem over the boots. Body triangles
 * fully covered by a garment are dropped from the body, so the cost is small (one
 * extra draw call per garment, about as many triangles as were hidden).
 */

type GName = 'jacket' | 'jeans' | 'boots';
/** Jacket hem height (bind pose, m): a waist-length work jacket ending on the upper hip. */
const HEM = 0.93;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Frame { s: number; oy: number; oz: number }

const LOOK: Record<GName, { color: number; rough: number; normal: number; tile: number; rim: number }> = {
  jacket: { color: 0x6a7550, rough: 0.9, normal: 0.9, tile: 0.2, rim: 0.07 },   // waxed olive canvas
  jeans: { color: 0xffffff, rough: 0.95, normal: 1.0, tile: 0.22, rim: 0.06 }, // dark worn denim (texture is already blue)
  boots: { color: 0x806a58, rough: 0.55, normal: 0.8, tile: 0.18, rim: 0.05 },  // dark brown leather
};

export function dressGarments(body: THREE.SkinnedMesh, bake: { value: THREE.Color }): THREE.SkinnedMesh[] {
  const geo = body.geometry;
  const fr = geo.userData.frame as Frame | undefined;
  if (!fr || !geo.index) return [];
  const P = geo.attributes.position as THREE.BufferAttribute, N = geo.attributes.normal as THREE.BufferAttribute;
  const SI = geo.attributes.skinIndex as THREE.BufferAttribute, SW = geo.attributes.skinWeight as THREE.BufferAttribute;
  const n = P.count, idx = geo.index.array as ArrayLike<number>;
  const mx = (i: number) => P.getX(i) * fr.s, my = (i: number) => P.getY(i) * fr.s + fr.oy, mz = (i: number) => P.getZ(i) * fr.s + fr.oz;

  // wrist: where the hand bones start (bind pose, metres)
  let wristX = 0.62;
  const hb = body.skeleton.bones.findIndex((b) => b.name === 'hand_l');
  if (hb >= 0) {
    const o = new THREE.Vector3().applyMatrix4(body.skeleton.boneInverses[hb].clone().invert());
    if (Math.abs(o.x * fr.s) > 0.3) wristX = Math.abs(o.x * fr.s) - 0.035;
  }

  // smooth normals welded by position (UV seams must not crack the shells)
  const key = (i: number) => `${Math.round(P.getX(i) * 4000)},${Math.round(P.getY(i) * 4000)},${Math.round(P.getZ(i) * 4000)}`;
  const acc = new Map<string, THREE.Vector3>();
  for (let i = 0; i < n; i++) { const k = key(i); let v = acc.get(k); if (!v) acc.set(k, (v = new THREE.Vector3())); v.x += N.getX(i); v.y += N.getY(i); v.z += N.getZ(i); }
  const idxOfKey = new Map<string, number>();
  for (let i = 0; i < n; i++) if (!idxOfKey.has(key(i))) idxOfKey.set(key(i), i);
  const wn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = acc.get(key(i))!.clone().normalize(); wn[i * 3] = v.x; wn[i * 3 + 1] = v.y; wn[i * 3 + 2] = v.z; }

  // neck opening only (the shoulders stay covered up to the collar)
  const neck = (i: number) => { const y = my(i), ax = Math.abs(mx(i)), z = mz(i); return y > 1.56 || (ax < 0.085 && y > (z > 0.0 ? 1.425 : 1.46)) || (ax < 0.11 && y > 1.5); };
  const hand = (i: number) => Math.abs(mx(i)) > wristX && my(i) > 1.15;
  const inG: Record<GName, (i: number) => boolean> = {
    jacket: (i) => my(i) >= HEM && !neck(i) && !hand(i),
    jeans: (i) => my(i) >= 0.105 && my(i) < HEM + 0.1,
    boots: (i) => my(i) < 0.15,
  };
  const offset: Record<GName, (i: number) => number> = {
    jacket: (i) => {
      const y = my(i), ax = Math.abs(mx(i));
      if (ax > 0.2 && y > 1.2) return 0.011 + 0.012 * sstep(wristX - 0.12, wristX, ax);       // sleeve, flared cuff
      return 0.010 + 0.024 * sstep(HEM + 0.14, HEM, y) + (mz(i) < 0 ? 0.004 : 0) - 0.004 * sstep(1.38, 1.44, y);
    },
    jeans: (i) => 0.004 + 0.009 * sstep(0.32, 0.11, my(i)),
    boots: () => 0.006,
  };

  // boots: smooth the foot so the boot does not show toes (welded Laplacian, feet only)
  const footPos = new Map<string, THREE.Vector3>();
  {
    const nb = new Map<string, Set<string>>();
    for (let t = 0; t < idx.length; t += 3) {
      const v = [idx[t], idx[t + 1], idx[t + 2]];
      if (!v.every((i) => my(i) < 0.12)) continue;
      for (let k = 0; k < 3; k++) {
        const a = key(v[k]), b = key(v[(k + 1) % 3]);
        if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set());
        nb.get(a)!.add(b); nb.get(b)!.add(a);
        if (!footPos.has(a)) footPos.set(a, new THREE.Vector3(mx(v[k]), my(v[k]), mz(v[k])));
        if (!footPos.has(b)) footPos.set(b, new THREE.Vector3(mx(v[(k + 1) % 3]), my(v[(k + 1) % 3]), mz(v[(k + 1) % 3])));
      }
    }
    for (let it = 0; it < 14; it++) {
      const nxt = new Map<string, THREE.Vector3>();
      for (const [k, p] of footPos) {
        const ns = nb.get(k)!; const avg = new THREE.Vector3();
        for (const o of ns) avg.add(footPos.get(o)!);
        avg.multiplyScalar(1 / ns.size);
        const w = (it % 2 === 0 ? 0.6 : -0.62) * sstep(0.11, 0.06, p.y); // Taubin; ankle edge stays put
        nxt.set(k, p.clone().lerp(avg, w));
      }
      for (const [k, v] of nxt) footPos.get(k)!.copy(v);
    }
  }

  const footN = new Map<string, THREE.Vector3>();
  for (let t = 0; t < idx.length; t += 3) {
    const ks = [key(idx[t]), key(idx[t + 1]), key(idx[t + 2])];
    if (!ks.every((k) => footPos.has(k))) continue;
    const [a, b, c] = ks.map((k) => footPos.get(k)!);
    const f = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    for (const k of ks) { let v = footN.get(k); if (!v) footN.set(k, (v = new THREE.Vector3())); v.add(f); }
  }
  for (const [k, v] of footN) {
    v.normalize();
    // keep the orientation of the original (outward) normal
    const i = idxOfKey.get(k); if (i !== undefined && v.x * wn[i * 3] + v.y * wn[i * 3 + 1] + v.z * wn[i * 3 + 2] < 0) v.negate();
  }

  const covered = new Uint8Array(idx.length / 3);
  const out: THREE.SkinnedMesh[] = [];
  for (const g of ['jacket', 'jeans', 'boots'] as GName[]) {
    const tris: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (inG[g](a) && inG[g](b) && inG[g](c)) { tris.push(a, b, c); covered[t / 3] = 1; }
    }
    if (!tris.length) continue;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [];
    const L = LOOK[g];
    // openings follow the mesh triangles (a saw-tooth edge): find their vertices first and
    // put them on clean lines (hem / jeans hem at one height, cuffs at the wrist)
    const edgeUse = new Map<string, number>();
    const ek = (a: number, b: number) => (a < b ? `${key(a)}|${key(b)}` : `${key(b)}|${key(a)}`);
    for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const e = ek(tris[t + k], tris[t + (k + 1) % 3]); edgeUse.set(e, (edgeUse.get(e) || 0) + 1); }
    const snapY = new Map<string, number>(), snapX = new Map<string, number>();
    for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = tris[t + k], b = tris[t + (k + 1) % 3];
      if (edgeUse.get(ek(a, b)) !== 1) continue;
      for (const v of [a, b]) {
        const y = my(v), ax = Math.abs(mx(v));
        if (g === 'jacket' && y < HEM + 0.12 && !(ax > 0.2 && y > 1.2)) snapY.set(key(v), HEM);
        else if (g === 'jacket' && ax > wristX - 0.15 && y > 1.2) snapX.set(key(v), Math.sign(mx(v)) * (wristX - 0.005));
        else if (g === 'jeans' && y < 0.3) snapY.set(key(v), 0.105);
      }
    }
    const shellPos = (i: number, extra = 0, lift = 0) => {
      const o = offset[g](i) + extra;
      const fp = g === 'boots' ? footPos.get(key(i)) : undefined;
      const k = key(i), sy = snapY.get(k), sx = snapX.get(k);
      const x = fp ? fp.x : sx ?? mx(i), y = fp ? Math.max(fp.y, my(i) - 0.004) : sy ?? my(i), z = fp ? fp.z : mz(i);
      return [(x + wn[i * 3] * o) / fr.s, (y + wn[i * 3 + 1] * o + lift - fr.oy) / fr.s, (z + wn[i * 3 + 2] * o - fr.oz) / fr.s];
    };
    // fabric UVs: cylinders around the body / each leg / each arm (metres / tile size)
    const uvOf = (x: number, y: number, z: number, ref: { arm: boolean; side: number }) => {
      if (ref.arm) return [Math.atan2(y - 1.4, z) * 0.06 / L.tile, Math.abs(x) / L.tile];
      if (g !== 'jacket' && y < 0.9) { const cx = ref.side * 0.1; return [Math.atan2(x - cx, z) * 0.08 / L.tile, y / L.tile]; }
      return [Math.atan2(x, z) * 0.15 / L.tile, y / L.tile];
    };
    const shade = (i: number) => {
      if (g !== 'jacket') return 1;
      const x = mx(i), y = my(i), z = mz(i), ax = Math.abs(x);
      let c = 1;
      if (z > 0 && ax < 0.012 && y < 1.44) c = 0.45;                         // zipper
      if (y < HEM + 0.035) c *= 0.8;                                          // hem band
      if (ax > wristX - 0.05 && y > 1.2) c *= 0.8;                            // cuff band
      if (z > 0 && ax > 0.05 && ax < 0.13 && Math.abs(y - 1.27) < 0.065 && Math.abs(y - 1.27) > 0.055) c *= 0.7; // chest pocket flap seam
      return c;
    };
    const push = (p: number[], i: number, u: number[], c: number, nrm?: number[]) => {
      pos.push(p[0], p[1], p[2]);
      const fnm = !nrm && g === 'boots' ? footN.get(key(i)) : undefined;
      if (fnm) nor.push(fnm.x, fnm.y, fnm.z);
      else nor.push(nrm ? nrm[0] : wn[i * 3], nrm ? nrm[1] : wn[i * 3 + 1], nrm ? nrm[2] : wn[i * 3 + 2]);
      uv.push(u[0], u[1]); col.push(c, c, c);
      si.push(SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)); sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i));
    };
    // shell triangles (unindexed: cylinder seams get their own UVs per triangle)
    for (let t = 0; t < tris.length; t += 3) {
      const v = [tris[t], tris[t + 1], tris[t + 2]];
      const arm = v.every((i) => Math.abs(mx(i)) > 0.2 && my(i) > 1.2);
      const side = Math.sign(mx(v[0]) + mx(v[1]) + mx(v[2])) || 1;
      const us = v.map((i) => uvOf(mx(i), my(i), mz(i), { arm, side }));
      const per = (arm ? 0.06 : g === 'jacket' || my(v[0]) > 0.9 ? 0.15 : 0.08) * Math.PI * 2 / L.tile;
      const hi = Math.max(...us.map((u) => u[0]));
      for (const u of us) if (hi - u[0] > per / 2) u[0] += per;
      v.forEach((i, k) => push(shellPos(i), i, us[k], shade(i)));
    }
    // openings: thickness turned in (hem, cuffs, jeans hem) or a stand-up collar
    for (let t = 0; t < tris.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = tris[t + k], b = tris[t + (k + 1) % 3];
        if (edgeUse.get(ek(a, b)) !== 1) continue;
        const ya = my(a), yb = my(b), axa = Math.abs(mx(a));
        if (g === 'jeans' && ya > 0.6) continue;  // waist: under the jacket
        if (g === 'boots' && ya > 0.1) continue;  // boot top: under the jeans
        const collar = g === 'jacket' && ya > 1.4 && yb > 1.4 && axa < 0.12;
        const pa = shellPos(a), pb = shellPos(b);
        let qa: number[], qb: number[];
        if (collar) {
          const top = (v: number) => 1.47 + 0.05 * sstep(0.03, -0.06, mz(v)); // low in front, higher at the nape
          qa = shellPos(a, 0.004, Math.max(0.03, top(a) - my(a))); qb = shellPos(b, 0.004, Math.max(0.03, top(b) - my(b)));
        }
        else { const ia = -(offset[g](a) - 0.002), ib = -(offset[g](b) - 0.002); qa = shellPos(a, ia); qb = shellPos(b, ib); }

        // face the opening outward (collar: away from the neck, hem: down, cuff: along the arm);
        // with double-sided shading a back-facing strip would be lit from the wrong side
        const want = collar ? new THREE.Vector3(wn[a * 3], 0, wn[a * 3 + 2]).normalize()
          : axa > wristX - 0.15 && ya > 1.2 ? new THREE.Vector3(Math.sign(mx(a)), 0, 0) : new THREE.Vector3(0, -1, 0);
        const fn = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).cross(new THREE.Vector3(qa[0] - pa[0], qa[1] - pa[1], qa[2] - pa[2])).normalize();
        let A = a, B = b, PA = pa, PB = pb, QA = qa, QB = qb;
        if (fn.dot(want) < 0) { fn.negate(); A = b; B = a; PA = pb; PB = pa; QA = qb; QB = qa; }
        const nA = [fn.x, fn.y, fn.z];
        const ua = uvOf(mx(A), my(A), mz(A), { arm: false, side: 1 }), ub = uvOf(mx(B), my(B), mz(B), { arm: false, side: 1 });
        const c = collar ? 1.0 : 0.6;
        // two triangles: A, B, QB  /  A, QB, QA
        push(PA, A, ua, c, nA); push(PB, B, ub, c, nA); push(QB, B, [ub[0], ub[1] + 0.25], c * 0.85, nA);
        push(PA, A, ua, c, nA); push(QB, B, [ub[0], ub[1] + 0.25], c * 0.85, nA); push(QA, A, [ua[0], ua[1] + 0.25], c * 0.85, nA);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    const map = assets.texture(`textures/cloth/${g}_c.jpg`, true), nmap = assets.texture(`textures/cloth/${g}_n.jpg`);
    const m = new THREE.MeshStandardMaterial({
      map, normalMap: nmap, normalScale: new THREE.Vector2(L.normal, L.normal), color: L.color, roughness: L.rough, metalness: 0,
      vertexColors: true, side: THREE.DoubleSide,
    });
    patchCharacter(m, L.rim, bake);
    m.customProgramCacheKey = () => 'garment';
    const mesh = new THREE.SkinnedMesh(sg, m);
    mesh.name = 'garment_' + g;
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.castShadow = body.castShadow; mesh.receiveShadow = true; mesh.frustumCulled = body.frustumCulled;
    out.push(mesh);
  }
  // the body keeps only what no garment covers
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) if (!covered[t / 3]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  geo.setIndex(keep);
  return out;
}
