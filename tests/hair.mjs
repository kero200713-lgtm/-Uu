// Close-up head renders of the player for hair checks: node tests/hair.mjs buns,long
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(process.env.DIST || 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 480, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'high', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await page.evaluate(() => window.__game.loadArea('town', 'from_forest'));
await page.evaluate(() => { const g = window.__game; g.debugTeleport(5.5, 31.2, 0, -0.05); g.hud.show(false); g.touch.show(false); });
const hairs = (process.argv[2] || 'buns').split(',');
const OUT = process.argv[3] || 'tests/out'; fs.mkdirSync(OUT, { recursive: true });
for (const h of hairs) {
  await page.evaluate((h) => window.__game.debugHair(h === 'none' ? null : h), h);
  let i = 0;
  for (const [ang, ht, d] of [[180, 0.1, 0.9], [0, 0.25, 0.9], [90, 0.2, 0.9], [20, -0.35, 1.5], [150, 0.7, 0.45]]) {
    await page.evaluate(([a, ht, d]) => window.__game.debugCloseUp(a, ht, d), [ang, ht, d]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/hair_${h}_${i++}.png` });
  }
}
await b.close(); srv.close();
