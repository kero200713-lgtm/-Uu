// Lines up interior props at rot 0 and photographs them from +Z, to see which side
// of each model is its front: node tests/prop_faces.mjs -> tests/out/props-front.png
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1600, height: 600 } });
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
const names = (process.argv[2] || 'Couch_Medium1,Couch_Small1,Bed_Single,Bookshelf,Shelf_Large,Shelf_1,Shelf_Small1,Drawer_1,Drawer_2,Kitchen_Fridge,Kitchen_Oven,Kitchen_Sink,Kitchen_Cabinet1,Kitchen_2Drawers,Fireplace,Bathroom_Toilet,Bathroom_Sink,Bathroom_WashingMachine,NightStand_1,Chair_1').split(',');
await page.evaluate(async (names) => {
  const g = window.__game, A = window.__assets, T = window.__THREE;
  await A.loadPack('interior');
  g.hud.show(false); g.touch.show(false); g.engine.paused = true;
  const grp = new T.Group(); g.scene.add(grp);
  const base = g.player.pos.clone().add(new T.Vector3(0, 30, 0));
  const lightA = new T.DirectionalLight(0xffffff, 3); lightA.position.set(0, 5, 10); grp.add(lightA); grp.add(lightA.target);
  const amb = new T.AmbientLight(0xffffff, 1.5); grp.add(amb);
  names.forEach((n, i) => {
    const pg = A.prop('interior', n); if (!pg) return;
    const m = new T.Mesh(pg.geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    m.position.copy(base).add(new T.Vector3((i % 10) * 2.6 - 11.7, Math.floor(i / 10) * -2.8, 0));
    grp.add(m);
  });
  g.rig.cinematic = { pos: base.clone().add(new T.Vector3(0, 0.2, 16)), look: base.clone().add(new T.Vector3(0, -1.0, 0)), w: 1 };
  g.scene.fog = null;
  g.rig.update(0.016, g.player.pos, 0, false); g.engine.render(0.016);
}, names);
await page.waitForTimeout(500);
await page.evaluate(() => { const g = window.__game; g.rig.update(0.016, g.player.pos, 0, false); g.engine.render(0.016); });
await page.screenshot({ path: `${OUT}/props-front.png` });
console.log(names.map((n, i) => `${i}:${n}`).join('  '));
await b.close(); srv.close();
