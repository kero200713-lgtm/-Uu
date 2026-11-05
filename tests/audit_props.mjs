// Prop sanity across all areas: things that had to be put down onto furniture/floor
// (were floating), tall furniture standing away from walls, lights hugging ceilings.
//   node tests/audit_props.mjs
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(process.env.DIST || 'dist');
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 320, height: 240 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'low', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
let bad = 0;
for (const area of ['forest', 'town', 'clinic', 'mine', 'facility', 'choir']) {
  // loaded twice: a revisit must build exactly the same area (fixtures once piled up per visit)
  for (let k = 0; k < 2; k++) { await page.evaluate((a) => window.__game.loadArea(a, null), area); await page.waitForTimeout(300); }
  const r = await page.evaluate(() => {
    const L = window.__game.level, g = L.grid, T = g.tile;
    const tallFree = [];
    for (const s of L.supports) {
      const h = s.top; if (h < 1.25 || !/^interior\//.test(s.name || '') || /Light_/.test(s.name)) continue;
      const cx = (s.minX + s.maxX) / 2 / T, cy = (s.minZ + s.maxZ) / 2 / T;
      if (!g.info(Math.floor(cx), Math.floor(cy)).indoor) continue;
      // distance from the box edge to the nearest solid wall cell edge (m)
      let near = 99;
      for (let y = Math.floor(cy) - 2; y <= Math.floor(cy) + 2; y++) for (let x = Math.floor(cx) - 2; x <= Math.floor(cx) + 2; x++) {
        const inf = g.info(x, y); if (inf.kind !== 'wall' || inf.thin) continue;
        const dx = Math.max(x * T - s.maxX, s.minX - (x + 1) * T, 0), dz = Math.max(y * T - s.maxZ, s.minZ - (y + 1) * T, 0);
        near = Math.min(near, Math.hypot(dx, dz));
      }
      if (near > 0.3) tallFree.push(`${s.name} ${h.toFixed(2)}m at (${cx.toFixed(1)},${cy.toFixed(1)}) ${near.toFixed(2)}m from wall`);
    }
    // furniture/lamps intersecting each other (stacked lamps, a lamp inside a couch...)
    const A = window.__assets, TH = window.__THREE, boxes = [];
    for (const p of L.placed) {
      if (p.pack !== 'interior' || /Carpet|Curtain|Window|Door|Light_Ceiling/.test(p.name)) continue;
      const pg = A.prop(p.pack, p.name); if (!pg) continue;
      boxes.push({ n: p.name, b: new TH.Box3(pg.min.clone(), pg.max.clone()).applyMatrix4(p.m) });
    }
    const overlaps = [];
    const vol = (b) => Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j]; if (!a.b.intersectsBox(c.b)) continue;
      const k = vol(a.b.clone().intersect(c.b)) / Math.max(1e-6, Math.min(vol(a.b), vol(c.b)));
      // a lamp is thin: any real overlap with another lamp or with furniture shows
      const lamp = /Light_/.test(a.n) || /Light_/.test(c.n);
      if (k > (lamp ? 0.08 : 0.3)) overlaps.push(`${a.n} x ${c.n} at (${(a.b.min.x / T).toFixed(1)},${(a.b.min.z / T).toFixed(1)}) ${(k * 100).toFixed(0)}%`);
    }
    // nothing may stand on a lamp, plant or chair (desk lamps were stacked four high)
    for (const p of L.placed) {
      const y = p.m.elements[13]; if (y < 0.05) continue;
      const x = p.m.elements[12], z = p.m.elements[14];
      for (const q of boxes) {
        if (!/Light_|Houseplant|Chair|Couch|Bed/.test(q.n) || q.b.max.y > y + 0.03 || q.b.max.y < y - 0.03) continue;
        if (x < q.b.min.x - 0.02 || x > q.b.max.x + 0.02 || z < q.b.min.z - 0.02 || z > q.b.max.z + 0.02) continue;
        overlaps.push(`${p.name} standing on ${q.n} at (${(x / T).toFixed(1)},${(z / T).toFixed(1)}) y=${y.toFixed(2)}`);
      }
    }
    return { fixes: L.floatFixes, tallFree, overlaps };
  });
  console.log(`== ${area}: ${r.fixes.length} put down, ${r.tallFree.length} tall away from walls, ${r.overlaps.length} overlapping`);
  for (const f of r.overlaps) console.log('   overlap', f);
  for (const f of r.fixes) console.log('   down', f);
  for (const f of r.tallFree) console.log('   ', f);
  bad += r.tallFree.length + r.overlaps.length + r.fixes.filter((f) => / -> 0\.00$/.test(f)).length; // floor fallbacks = something was floating
}
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
process.exit(bad || errors.length ? 1 : 0);
