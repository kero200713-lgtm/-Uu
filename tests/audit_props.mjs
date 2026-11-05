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
  await page.evaluate((a) => window.__game.loadArea(a, null), area);
  await page.waitForTimeout(300);
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
    return { fixes: L.floatFixes, tallFree };
  });
  console.log(`== ${area}: ${r.fixes.length} put down, ${r.tallFree.length} tall away from walls`);
  for (const f of r.fixes) console.log('   down', f);
  for (const f of r.tallFree) console.log('   ', f);
  bad += r.tallFree.length + r.fixes.filter((f) => / -> 0\.00$/.test(f)).length; // floor fallbacks = something was floating
}
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
process.exit(bad || errors.length ? 1 : 0);
