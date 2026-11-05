// Interior shots of the town buildings (room dressing, ceilings/roofs) plus a
// fence close-up: node tests/town_rooms.mjs -> tests/out/room-*.png
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => window.__game.loadArea('town', 'from_forest'));
await page.waitForFunction(() => window.__game.state === 'play' && window.__game.areaId === 'town', null, { timeout: 180000 });
await page.evaluate((bright) => { const g = window.__game, T = window.__THREE; g.hud.show(false); g.touch.show(false); g.engine.grade.exposure = 2.4; if (bright) { g.scene.add(new T.AmbientLight(0xffffff, 2.2)); g.engine.grade.exposure = 1.3; } }, !!process.env.BRIGHT);
// [name, camera cell x, y, height, look cell x, y]
const shots = [
  ['nw-house', 3.3, 4.3, 2.4, 9, 10], ['store', 3.3, 15.3, 2.4, 9.5, 21.5], ['sw-living', 3.3, 29.3, 2.4, 11, 31.5],
  ['sw-rooms', 3.3, 36.6, 2.4, 9.5, 33.5], ['ne-office', 28.4, 4.4, 2.4, 31.5, 11], ['se-office', 28.3, 29.3, 2.4, 37, 31.5],
  ['roof-top', 8, 8, 16, 8, 9], ['fence', 25, 18.5, 1.6, 26, 15],
];
for (const [n, cx, cy, h, lx, ly] of shots) {
  await page.evaluate(([cx, cy, h, lx, ly]) => { const g = window.__game, T = window.__THREE;
    g.debugTeleport(lx, ly, 0, 0);
    g.rig.cinematic = { pos: new T.Vector3(cx * 2, h, cy * 2), look: new T.Vector3(lx * 2, 0.9, ly * 2), w: 1 }; }, [cx, cy, h, lx, ly]);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/room-${n}.png` });
  console.log('shot', n);
}
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
