import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Collects coloured parts and merges them into one vertex-coloured mesh (one draw call). */
class Parts {
  list: THREE.BufferGeometry[] = [];
  push(g0: THREE.BufferGeometry, hex: number, at: THREE.Vector3, rot = new THREE.Euler()) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1)));
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    this.list.push(g);
  }
  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, hex: number, rx = 0) {
    this.push(new THREE.BoxGeometry(sx, sy, sz), hex, new THREE.Vector3(x, y, z), new THREE.Euler(rx, 0, 0));
  }
  mesh(mat: THREE.MeshStandardMaterial, flat = true) {
    const geo = mergeGeometries(this.list, false)!;
    if (flat) geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }
}

/**
 * A compact service pistol built from a few boxes at real size (~19 cm long, ~13 cm
 * tall): slide, frame, angled grip, magazine base, trigger guard, trigger, sights.
 * The library model was a thin 22 cm sliver with a stub grip that read as a toy in
 * the hand. One draw call (vertex colours), ~150 triangles.
 * Axes: muzzle +Z, up +Y, grip bottom near y = 0.
 */
export const PISTOL = {
  grip: new THREE.Vector3(0, 0.055, -0.05),        // palm centre on the grip
  muzzle: new THREE.Vector3(0, 0.118, 0.112),
};

export function buildPistol(): THREE.Mesh {
  const p = new Parts();
  const SLIDE = 0x2c2e31, FRAME = 0x17181a, GRIP = 0x1e1f21, DARK = 0x050505, SIGHT = 0x9a9a94;
  p.box(0.028, 0.031, 0.19, 0, 0.118, 0.014, SLIDE);            // slide
  p.box(0.024, 0.006, 0.16, 0, 0.1345, 0.014, SLIDE);           // slide top bevel
  p.box(0.026, 0.022, 0.15, 0, 0.093, 0.024, FRAME);            // frame / dust cover
  p.box(0.030, 0.108, 0.05, 0, 0.046, -0.058, GRIP, 0.3);       // grip, raked back
  p.box(0.032, 0.011, 0.054, 0, -0.004, -0.074, FRAME, 0.3);    // magazine base
  p.box(0.026, 0.02, 0.03, 0, 0.088, -0.07, FRAME);             // beavertail
  p.box(0.012, 0.007, 0.05, 0, 0.061, 0.001, FRAME);            // trigger guard (bottom)
  p.box(0.012, 0.03, 0.008, 0, 0.073, 0.027, FRAME, -0.25);     // trigger guard (front)
  p.box(0.006, 0.021, 0.006, 0, 0.074, -0.004, DARK, -0.2);     // trigger
  p.box(0.004, 0.006, 0.006, 0, 0.137, 0.1, SIGHT);             // front sight
  p.box(0.018, 0.006, 0.008, 0, 0.137, -0.072, DARK);           // rear sight
  p.box(0.012, 0.012, 0.002, 0, 0.115, 0.1095, DARK);           // muzzle
  p.box(0.029, 0.018, 0.004, 0, 0.118, -0.05, 0x232528);        // slide serration band
  return p.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.45 }));
}

/**
 * Rusty water pipe, 80 cm: cloth-taped handle at the bottom, two rust rings, a
 * threaded coupling and a 90-degree elbow fitting at the head (the striking end).
 * Axes: shaft along +Y from the butt (y = 0), elbow pointing +Z. ~300 triangles.
 */
export const PIPE = {
  length: 0.8,
  grip: 0.1,            // hand centre on the taped handle (distance from the butt)
  support: 0.42,        // second hand when guarding
};

export function buildPipe(): THREE.Mesh {
  const p = new Parts(), L = PIPE.length;
  const RUST = 0x5a4232, STEEL = 0x55524c, TAPE = 0x26231f, ORANGE = 0x6e3d1f;
  const cyl = (r: number, h: number, y: number, hex: number, seg = 10) => p.push(new THREE.CylinderGeometry(r, r, h, seg, 1, false), hex, new THREE.Vector3(0, y, 0));
  cyl(0.021, L - 0.07, (L - 0.07) / 2, STEEL);                   // shaft
  cyl(0.0235, 0.2, 0.11, TAPE);                                  // taped handle
  cyl(0.0242, 0.012, 0.016, 0x1a1816);                           // tape edge (bottom)
  cyl(0.0242, 0.012, 0.204, 0x1a1816);                           // tape edge (top)
  cyl(0.0215, 0.06, 0.37, RUST);                                 // rust patches
  cyl(0.0215, 0.09, 0.56, ORANGE);
  cyl(0.0275, 0.06, L - 0.085, RUST);                            // threaded coupling
  cyl(0.0285, 0.008, L - 0.112, 0x3d2c22);
  cyl(0.0285, 0.008, L - 0.058, 0x3d2c22);
  // elbow fitting: a short socket bent toward +Z
  p.push(new THREE.CylinderGeometry(0.027, 0.027, 0.075, 10), RUST, new THREE.Vector3(0, L - 0.03, 0.024), new THREE.Euler(Math.PI / 2, 0, 0));
  p.push(new THREE.CylinderGeometry(0.0285, 0.0285, 0.01, 10), 0x3d2c22, new THREE.Vector3(0, L - 0.03, 0.062), new THREE.Euler(Math.PI / 2, 0, 0));
  p.push(new THREE.CylinderGeometry(0.0195, 0.0195, 0.004, 10), 0x0d0b0a, new THREE.Vector3(0, L - 0.03, 0.067), new THREE.Euler(Math.PI / 2, 0, 0)); // open bore
  return p.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.6 }), false);
}
