// Character + animation builder for UĞULTU.
// - Base bodies (Quaternius Universal Base Characters, CC0): strip unused vertex
//   attributes and embedded textures (painted textures are loaded at runtime).
// - Hair meshes: keep geometry + downsized textures.
// - Animations (Quaternius Universal Animation Library 1+2, CC0): keep only the
//   clips the game uses, drop meshes, drop translation tracks except the
//   pelvis/root and all scale tracks, resample, meshopt-compress.
// usage: node build_characters.mjs <ubc_work_dir> <ubc_hair_dir> <ual1.glb> <ual2.glb> <out_dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [work, hairDir, ual1, ual2, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const KEEP_ATTR = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);

function stripAttributes(doc) {
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    for (const s of p.listSemantics()) if (!KEEP_ATTR.has(s)) p.setAttribute(s, null);
  }
}

async function body(file, outName) {
  const doc = await io.read(path.join(work, file));
  stripAttributes(doc);
  // keep eye texture only (small) — body textures are replaced at runtime
  for (const mat of doc.getRoot().listMaterials()) {
    if (!/Eye/i.test(mat.getName())) { mat.setBaseColorTexture(null); mat.setMetallicRoughnessTexture(null); mat.setNormalTexture(null); }
    else { mat.setNormalTexture(null); }
  }
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(prune({ keepAttributes: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [128, 128] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, outName), doc);
  console.log(outName, Math.round(fs.statSync(path.join(OUT, outName)).size / 1024), 'KB');
}

async function hair(name) {
  const doc = await io.read(path.join(hairDir, name + '.gltf'));
  stripAttributes(doc);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(prune({ keepAttributes: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, 'hair_' + name.replace(/^Hair_/, '').toLowerCase() + '.glb');
  await io.write(out, doc);
  console.log(path.basename(out), Math.round(fs.statSync(out).size / 1024), 'KB');
}

async function anims(src, keep, outName) {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) {
    if (!keep.includes(a.getName())) { a.dispose(); continue; }
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode(); const p = ch.getTargetPath();
      const nm = node ? node.getName() : '';
      if (p === 'scale' || /_leaf_/.test(nm) || (p === 'translation' && nm !== 'pelvis' && nm !== 'root')) { const s = ch.getSampler(); ch.dispose(); if (s && s.listParents().length <= 1) s.dispose(); }
    }
  }
  // drop meshes but keep skeleton nodes
  for (const n of doc.getRoot().listNodes()) { if (n.getMesh()) n.setMesh(null); if (n.getSkin()) n.setSkin(null); }
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  await doc.transform(resample({ tolerance: 0.0015 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(OUT, outName), doc);
  console.log(outName, doc.getRoot().listAnimations().map((a) => a.getName()).join(','), Math.round(fs.statSync(path.join(OUT, outName)).size / 1024), 'KB');
}

await body('Superhero_Female_FullBody.gltf', 'human_f.glb');
await body('Superhero_Male_FullBody.gltf', 'human_m.glb');

/** Low-poly body for enemies (skinning attributes survive meshopt simplification). */
async function bodyLod(file, outName, ratio) {
  const { simplify, weld } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const doc = await io.read(path.join(work, file));
  stripAttributes(doc);
  for (const mat of doc.getRoot().listMaterials()) {
    if (!/Eye/i.test(mat.getName())) { mat.setBaseColorTexture(null); mat.setMetallicRoughnessTexture(null); mat.setNormalTexture(null); }
    else mat.setNormalTexture(null);
  }
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: true }), prune({ keepAttributes: true }), dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [128, 128] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  await io.write(path.join(OUT, outName), doc);
  console.log(outName, 'tris', tris, Math.round(fs.statSync(path.join(OUT, outName)).size / 1024), 'KB');
}
await bodyLod('Superhero_Female_FullBody.gltf', 'human_f_lod.glb', 0.4);
await bodyLod('Superhero_Male_FullBody.gltf', 'human_m_lod.glb', 0.4);
for (const h of ['Hair_Buns', 'Hair_Long', 'Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Beard']) await hair(h);
await anims(ual1, ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload', 'Hit_Chest', 'Hit_Head', 'Death01', 'Interact', 'PickUp_Table', 'Sword_Attack', 'Punch_Jab', 'Punch_Cross', 'Idle_Torch_Loop', 'Roll', 'Fixing_Kneeling', 'Sitting_Idle_Loop', 'Push_Loop', 'Walk_Formal_Loop'], 'anims_a.glb');
await anims(ual2, ['Zombie_Idle_Loop', 'Zombie_Walk_Fwd_Loop', 'Zombie_Scratch', 'Hit_Knockback', 'LayToIdle', 'OverhandThrow', 'Consume', 'Melee_Hook', 'Sword_Regular_A', 'Idle_Lantern_Loop', 'Chest_Open', 'Idle_Rail_Loop', 'Idle_No_Loop'], 'anims_b.glb');
