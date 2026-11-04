import { NodeIO } from '@gltf-transform/core';
import fs from 'fs'; import path from 'path';
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); let tris = 0, prims = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { prims++; const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  console.log(path.basename(f), 'tris', tris, 'prims', prims, 'mats', doc.getRoot().listMaterials().length, 'KB', Math.round(fs.statSync(f).size/1024));
}
