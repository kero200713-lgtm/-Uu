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
  if (o.hair) for (const hm of await buildHair(skeleton, o.hair, o.hairColor ?? 0x2a1d14, o.shadow !== false)) { model.add(hm); meshes.push(hm); }
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
export async function setHair(h: Human, hair: string | null, color: number) {
  const old = h.meshes.filter((m) => m.userData.hair);
  for (const m of old) { m.parent?.remove(m); }
  h.meshes = h.meshes.filter((m) => !m.userData.hair);
  if (!hair) return;
  for (const hm of await buildHair(h.skeleton, hair, color, true)) { h.model.add(hm); h.meshes.push(hm); }
}

function hairMaterial(src: THREE.MeshStandardMaterial, tint: number) {
  const key = (src.map?.uuid || 'x') + tint;
  let m = hairMats.get(key) as THREE.MeshStandardMaterial;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: src.map, color: tint, roughness: 0.75, metalness: 0, alphaTest: 0.35, side: THREE.DoubleSide });
  hairMats.set(key, m);
  return m;
}
