import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from '../core/Assets';
import { characterMaterial, cloneCharacterMaterial } from '../world/Materials';

export interface HumanOpts {
  sex: 'f' | 'm';
  variant: string;              // painted texture set
  hair?: string | null;         // hair glb name (buns, long, simpleparted, buzzed, beard)
  hairColor?: number;
  scale?: number;
  boneScale?: Record<string, [number, number, number]>;
  glow?: number;
  eyes?: 'normal' | 'dead' | 'none';
  shadow?: boolean;
  lod?: boolean;                // use the low-poly body (enemies)
  hairCap?: boolean;            // grow a scalp shell under the hair cards (close-up characters)
}

export interface Human {
  root: THREE.Group;           // positioned in world
  model: THREE.Object3D;       // skinned hierarchy
  meshes: THREE.SkinnedMesh[];
  body: THREE.SkinnedMesh;
  bodyMat: THREE.MeshStandardMaterial;
  skeleton: THREE.Skeleton;
}

const hairMats = new Map<string, THREE.Material>();

export async function preloadHumans() {
  await Promise.all([
    assets.loadGLTF('models/characters/human_f.glb'), assets.loadGLTF('models/characters/human_m.glb'),
    assets.loadGLTF('models/characters/human_f_lod.glb'), assets.loadGLTF('models/characters/human_m_lod.glb'),
    ...['buns', 'long', 'simpleparted', 'buzzed', 'beard'].map((h) => assets.loadGLTF(`models/characters/hair_${h}.glb`)),
    assets.loadAnimations(),
  ]);
}

/** Builds a skinned human from a shared base mesh + painted variant textures. */
export async function createHuman(o: HumanOpts): Promise<Human> {
  const g = await assets.loadGLTF(`models/characters/human_${o.sex}${o.lod ? '_lod' : ''}.glb`);
  const model = skeletonClone(g.scene) as THREE.Object3D;
  const meshes: THREE.SkinnedMesh[] = [];
  let body: THREE.SkinnedMesh | null = null;
  const base = characterMaterial(o.variant, 0x5fe8d0, o.glow ?? 1);
  const bodyMat = cloneCharacterMaterial(base);
  model.traverse((n: any) => {
    if (!n.isSkinnedMesh) return;
    meshes.push(n);
    n.castShadow = o.shadow !== false; n.receiveShadow = true;
    n.frustumCulled = true;
    n.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    const mname = (n.material?.name || '') as string;
    if (/Superhero|SuperHero/i.test(n.name) || /Superhero|SuperHero/i.test(mname)) { n.material = bodyMat; body = n; }
    else if (/Eye/i.test(mname) || /Eye/i.test(n.name) && !/brow/i.test(n.name)) {
      if (o.eyes === 'dead') n.material = new THREE.MeshStandardMaterial({ color: 0xb8c4bc, roughness: 0.25, emissive: 0x253a34 });
      else if (o.eyes === 'none') n.visible = false;
    } else {
      // eyebrows
      n.material = new THREE.MeshStandardMaterial({ color: o.eyes === 'dead' ? 0x3a3a36 : 0x1e1812, roughness: 0.9, transparent: true, alphaTest: 0.3 });
    }
  });
  if (!body) body = meshes[0];
  const skeleton = body.skeleton;
  if (o.hair) {
    const cards = await buildHair(skeleton, o.hair, o.hairColor ?? 0x2a1d14, o.shadow !== false);
    for (const hm of cards) { model.add(hm); meshes.push(hm); }
    if (o.hairCap && cards[0]) { const cap = buildHairCap(body, cards[0].material as THREE.Material); body.parent!.add(cap); meshes.push(cap); }
  }
  if (o.boneScale) {
    for (const b of skeleton.bones) {
      const s = o.boneScale[b.name];
      if (s) { b.scale.set(s[0], s[1], s[2]); (b as any).userData.lockScale = s; }
    }
  }
  const root = new THREE.Group();
  root.add(model);
  // source rig faces +Z; gameplay convention is "forward = -Z"
  model.rotation.y = Math.PI;
  if (o.scale) model.scale.setScalar(o.scale);
  return { root, model, meshes, body, bodyMat, skeleton };
}

/** Binds a hair mesh (rigged to the same skeleton) to an existing character. */
export async function buildHair(skeleton: THREE.Skeleton, hair: string, color: number, shadow: boolean): Promise<THREE.SkinnedMesh[]> {
  const out: THREE.SkinnedMesh[] = [];
  const hg = await assets.loadGLTF(`models/characters/hair_${hair}.glb`);
  hg.scene.traverse((n: any) => {
    if (!n.isSkinnedMesh) return;
    const bones = n.skeleton.bones.map((b: THREE.Bone) => skeleton.bones.find((x) => x.name === b.name) || skeleton.bones[0]);
    const hm = new THREE.SkinnedMesh(n.geometry, hairMaterial(n.material, color));
    hm.bind(new THREE.Skeleton(bones, n.skeleton.boneInverses), n.bindMatrix);
    hm.castShadow = shadow;
    hm.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 1.0);
    hm.userData.hair = true;
    out.push(hm);
  });
  return out;
}

/** Replaces a character's hair (used by the player setup and debug tools). */
export async function setHair(h: Human, hair: string | null, color: number, cap = true) {
  const old = h.meshes.filter((m) => m.userData.hair);
  for (const m of old) { m.parent?.remove(m); }
  h.meshes = h.meshes.filter((m) => !m.userData.hair);
  if (!hair) return;
  const cards = await buildHair(h.skeleton, hair, color, true);
  for (const hm of cards) { h.model.add(hm); h.meshes.push(hm); }
  if (cap && cards[0]) { const c = buildHairCap(h.body, cards[0].material as THREE.MeshStandardMaterial); h.body.parent!.add(c); h.meshes.push(c); }
}

/**
 * Hair cards leave gaps over the crown, so a thin shell is grown from the body's
 * scalp (above a hairline that sits high on the forehead, above the ears and low
 * at the nape) and textured with the same hair material. UVs run from a whorl at
 * the back of the crown down each meridian so the strands fall naturally.
 * Skinned with the body's own weights, so it follows every head movement.
 */
export function buildHairCap(body: THREE.SkinnedMesh, mat: THREE.Material, lift = 0.0045): THREE.SkinnedMesh {
  const src = body.geometry;
  const P = src.attributes.position as THREE.BufferAttribute, N = src.attributes.normal as THREE.BufferAttribute;
  const SI = src.attributes.skinIndex as THREE.BufferAttribute, SW = src.attributes.skinWeight as THREE.BufferAttribute;
  // compressed meshes live in a normalised frame: rescale to metres (body height)
  let mnY = Infinity, mxY = -Infinity;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < mnY) mnY = y; if (y > mxY) mxY = y; }
  const s = 1.775 / (mxY - mnY);
  // weld normals by position so the shell has no cracks along UV seams
  const key = (i: number) => `${Math.round(P.getX(i) * 5000)},${Math.round(P.getY(i) * 5000)},${Math.round(P.getZ(i) * 5000)}`;
  const nsum = new Map<string, THREE.Vector3>();
  for (let i = 0; i < P.count; i++) {
    const k = key(i); let v = nsum.get(k); if (!v) { v = new THREE.Vector3(); nsum.set(k, v); }
    v.x += N.getX(i); v.y += N.getY(i); v.z += N.getZ(i);
  }
  let czs = 0, czn = 0;
  for (let i = 0; i < P.count; i++) if ((mxY - P.getY(i)) * s < 0.04) { czs += P.getZ(i) * s; czn++; }
  const cz = czn ? czs / czn : 0;
  const top = mxY * s;
  const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const inScalp = (i: number) => {
    const h = P.getY(i) * s - top, z = P.getZ(i) * s - cz;
    const line = z >= 0.03 ? -0.095 + 0.05 * sstep(0.03, 0.08, z) : -0.095 - 0.06 * sstep(-0.02, -0.07, z);
    return h > line;
  };
  const idx = src.index ? src.index.array : null;
  const tri = (t: number) => (idx ? idx[t] : t);
  const triCount = (idx ? idx.length : P.count) / 3;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [];
  const c = new THREE.Vector3(0, top - 0.09, cz);
  const up = new THREE.Vector3(0, 1, -0.35).normalize(), right = new THREE.Vector3(1, 0, 0);
  const fwd = new THREE.Vector3().crossVectors(right, up);
  const p = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const v = [tri(t * 3), tri(t * 3 + 1), tri(t * 3 + 2)];
    if (!v.every(inScalp)) continue;
    const us: number[] = [];
    for (const i of v) {
      n.copy(nsum.get(key(i))!).normalize();
      p.set(P.getX(i) * s, P.getY(i) * s, P.getZ(i) * s).addScaledVector(n, lift);
      pos.push(p.x / s, p.y / s, p.z / s); nor.push(n.x, n.y, n.z);
      d.subVectors(p, c).normalize();
      const phi = Math.acos(THREE.MathUtils.clamp(d.dot(up), -1, 1));
      const theta = Math.atan2(d.dot(right), d.dot(fwd));
      us.push((theta / (Math.PI * 2) + 0.5) * 4);
      uv.push(0, 0.04 + Math.min(0.92, phi / (Math.PI * 0.62)) * 0.92);
      si.push(SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)); sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i));
    }
    // keep each triangle on one side of the wrap-around seam
    const hi = Math.max(...us);
    for (let k = 0; k < 3; k++) { if (hi - us[k] > 2) us[k] += 4; uv[uv.length - 6 + k * 2] = us[k]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 1.0);
  const m = new THREE.SkinnedMesh(g, mat);
  m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
  m.bind(body.skeleton, body.bindMatrix);
  m.castShadow = body.castShadow; m.userData.hair = true;
  return m;
}

function hairMaterial(src: THREE.MeshStandardMaterial, tint: number) {
  const key = (src.map?.uuid || 'x') + tint;
  let m = hairMats.get(key) as THREE.MeshStandardMaterial;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: src.map, color: tint, roughness: 0.75, metalness: 0, alphaTest: 0.35, side: THREE.DoubleSide });
  hairMats.set(key, m);
  return m;
}
