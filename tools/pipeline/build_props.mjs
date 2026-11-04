// Prop pack builder for UĞULTU.
// Bakes every material (base colour factor or atlas texel) into per-vertex
// COLOR_0 (+ emissive in alpha) and roughness/metalness into a custom _RM
// attribute, flattens node transforms and joins every primitive of a model
// into ONE primitive. All models of a category are then written into a single
// pack GLB sharing one material => 1 draw call per prop and trivial batching.
//
// usage: node build_props.mjs <manifest.json>
// manifest: { "packs": { "<packName>": [ ["<name>", "<src.glb>", {opts}], ... ] }, "out": "<dir>" }
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, quantize, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = manifest.out;
fs.mkdirSync(OUT, { recursive: true });

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const texCache = new Map();
async function decodeTexture(tex) {
  if (texCache.has(tex)) return texCache.get(tex);
  const img = tex.getImage();
  const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = { data, w: info.width, h: info.height };
  texCache.set(tex, r);
  return r;
}

function mat4mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function xformPoint(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
function xformDir(m, p) { const v = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }

// Collect all triangles of a model as flat arrays in model space
async function collect(srcPath, opts) {
  const doc = await io.read(srcPath);
  const pos = [], nrm = [], col = [], rm = [];
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const visit = async (node, parent) => {
    const world = mat4mul(parent, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh && !node.getSkin()) {
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        let base = mat ? mat.getBaseColorFactor() : [0.8, 0.8, 0.8, 1];
        const emi = mat ? mat.getEmissiveFactor() : [0, 0, 0];
        const emissive = Math.max(...emi) > 0.05 ? 1 : 0;
        let rough = mat ? mat.getRoughnessFactor() : 0.8;
        let metal = mat ? mat.getMetallicFactor() : 0;
        if (opts.rough !== undefined) rough = opts.rough;
        rough = Math.min(1, Math.max(0.25, rough));
        const tex = mat ? mat.getBaseColorTexture() : null;
        const texData = tex ? await decodeTexture(tex) : null;
        const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0');
        const I = prim.getIndices();
        const n = I ? I.getCount() : P.getCount();
        const a = [], b = [], c = [];
        for (let k = 0; k < n; k++) {
          const vi = I ? I.getScalar(k) : k;
          const p = xformPoint(world, P.getElement(vi, a));
          const nn = N ? xformDir(world, N.getElement(vi, b)) : [0, 1, 0];
          let rgb = [base[0], base[1], base[2]];
          if (texData && UV) {
            const uv = UV.getElement(vi, c);
            const x = Math.min(texData.w - 1, Math.max(0, Math.floor((uv[0] - Math.floor(uv[0])) * texData.w)));
            const y = Math.min(texData.h - 1, Math.max(0, Math.floor((uv[1] - Math.floor(uv[1])) * texData.h)));
            const o = (y * texData.w + x) * 4;
            rgb = [srgbToLin(texData.data[o] / 255) * base[0], srgbToLin(texData.data[o + 1] / 255) * base[1], srgbToLin(texData.data[o + 2] / 255) * base[2]];
          }
          if (opts.tint) rgb = rgb.map((v, i) => v * opts.tint[i]);
          if (opts.desat) { const l = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11; rgb = rgb.map((v) => v * (1 - opts.desat) + l * opts.desat); }
          pos.push(...p); nrm.push(...nn); col.push(rgb[0], rgb[1], rgb[2], emissive ? 0.0 : 1.0); rm.push(rough, metal);
        }
      }
    }
    for (const ch of node.listChildren()) await visit(ch, world);
  };
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of scene.listChildren()) await visit(n, I4);
  return { pos, nrm, col, rm };
}

const report = {};
for (const [packName, entries] of Object.entries(manifest.packs)) {
  const out = new Document();
  const buf = out.createBuffer();
  const sharedMat = out.createMaterial('VC').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const scene = out.createScene(packName);
  report[packName] = {};
  for (const [name, src, opts = {}] of entries) {
    const g = await collect(src, opts);
    let { pos, nrm, col, rm } = g;
    let s = opts.scale || 1;
    if (opts.fit) {
      // normalise to a real-world size: largest dimension in metres
      let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], pos[i + k]); b[k] = Math.max(b[k], pos[i + k]); }
      s = opts.fit / Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    // bounds
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { pos[i + k] *= s; mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    // re-origin: centre on XZ, base at y=0 (props are placed by their footprint)
    if (opts.origin !== 'keep') {
      const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, by = mn[1];
      for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= by; pos[i + 2] -= cz; }
      mx = [mx[0] - cx, mx[1] - by, mx[2] - cz]; mn = [mn[0] - cx, 0, mn[2] - cz];
    }
    const vcount = pos.length / 3;
    const idx = new Uint32Array(vcount); for (let i = 0; i < vcount; i++) idx[i] = i;
    const prim = out.createPrimitive()
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
      .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
      .setAttribute('COLOR_0', out.createAccessor().setType('VEC4').setArray(new Float32Array(col)).setBuffer(buf))
      .setAttribute('_RM', out.createAccessor().setType('VEC2').setArray(new Float32Array(rm)).setBuffer(buf))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buf))
      .setMaterial(sharedMat);
    const mesh = out.createMesh(name).addPrimitive(prim);
    const node = out.createNode(name).setMesh(mesh);
    scene.addChild(node);
    report[packName][name] = { min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)), tris: vcount / 3 };
  }
  const doSimplify = manifest.simplify && manifest.simplify[packName];
  if (doSimplify) {
    // flat-shaded sources: drop normals so welding can share vertices (normals are rebuilt at runtime)
    for (const m of out.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
  }
  await out.transform(weld({ tolerance: 0.0001 }), dedup(), prune());
  // optional simplification for dense packs
  if (doSimplify) {
    await out.transform(simplify({ simplifier: MeshoptSimplifier, ratio: manifest.simplify[packName], error: 0.05, lockBorder: false }));
  }
  for (const m of out.getRoot().listMeshes()) {
    const p = m.listPrimitives()[0];
    report[packName][m.getName()].tris = p.getIndices().getCount() / 3;
  }
  await out.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizeColor: 8, quantizeNormal: 8, pattern: /^(NORMAL|COLOR_0)$/ }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(OUT, `${packName}.glb`);
  await io.write(file, out);
  console.log(packName, entries.length, 'models', Math.round(fs.statSync(file).size / 1024), 'KB');
}
const mf = path.join(OUT, 'props_manifest.json');
const prev = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
fs.writeFileSync(mf, JSON.stringify({ ...prev, ...report }));
