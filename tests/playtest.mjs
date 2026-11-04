// Automated play test: serves dist/, drives the game with emulated touch input,
// captures screenshots + console errors + per-frame render stats.
// usage: Q=medium S=forest node tests/playtest.mjs
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist');
const OUT = path.resolve('tests/out');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const srv = http.createServer((q, res) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const port = srv.address().port;
const quality = process.env.Q || 'medium';
const scenario = process.env.S || 'forest';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 440 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/parallel_shader_compile|sw\.js/.test(t)) errors.push(`[${m.type()}] ${t}`); if (process.env.V) console.log('  console:', t.slice(0, 200)); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (/ERR_ABORTED/.test(f) && /\.mp3$/.test(r.url())) return; errors.push('[reqfail] ' + r.url() + ' ' + f); }); // aborted music streams on track switch are expected
page.on('response', (r) => { if (r.status() >= 400 && !/sw\.js/.test(r.url())) errors.push('[http ' + r.status() + '] ' + r.url()); });
await page.addInitScript((q) => { if (!localStorage.getItem('ugultu_settings_v1')) localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: q, language: 'tr', dynamicResolution: false, showFps: true })); }, quality);
const t0 = Date.now();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
console.log('menu ready in', Date.now() - t0, 'ms');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${scenario}-00-menu.png` });
const tap = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
await tap('button.mi[data-k=new]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
console.log('play ready in', Date.now() - t0, 'ms');
await page.waitForTimeout(2000);

const shots = {
  forest: [[11.2, 47.6, 0, -0.1], [11.2, 47.6, 160, -0.15], [9.5, 43, 20, -0.12], [6.5, 35, 90, -0.1], [3, 35.3, 30, -0.2], [12.2, 31, 0, -0.05], [13, 16, 30, -0.1], [12.5, 6, 0, 0]],
};
const AREA_SHOTS = {
  town: [['from_forest', 19.5, 36, 0], [null, 19.5, 24, 0], [null, 6, 30.5, 90], [null, 31, 31, 180], [null, 35, 8, 270]],
  clinic: [['from_town', 14.5, 22, 0], [null, 14.5, 12.8, 90], [null, 9.3, 8.5, 0], [null, 24.5, 17, 180]],
  mine: [['from_clinic', 4, 34, 20], [null, 18, 22, 60], [null, 8, 16.5, 90], [null, 34, 30, 270]],
  facility: [['from_mine', 4.5, 23.5, 0], [null, 11, 12, 0], [null, 17, 9, 90], [null, 26.5, 17, 0]],
  choir: [['from_facility', 15.6, 30, 0], [null, 16, 24, 0]],
};
if (scenario === 'areas') {
  for (const [area, views] of Object.entries(AREA_SHOTS)) {
    const tA = Date.now();
    await page.evaluate(([a, s]) => window.__game.loadArea(a, s), [area, views[0][0]]);
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
    console.log(`area ${area} loaded in ${Date.now() - tA} ms`);
    let k = 0;
    for (const [, x, y, yaw] of views) {
      await page.evaluate(([x, y, yaw]) => window.__game.debugTeleport(x, y, yaw, -0.12), [x, y, yaw]);
      await page.waitForTimeout(1400);
      const st = await page.evaluate(() => window.__game.frameStats());
      console.log(`  ${area} view ${k}:`, JSON.stringify(st));
      await page.screenshot({ path: `${OUT}/area-${area}-${k}.png` });
      k++;
    }
  }
}
if (scenario === 'ui') {
  await page.evaluate(() => { const g = window.__game; g.debugGive('pistol'); g.debugGive('ammo_9mm', 24); g.debugGive('bandage', 2); g.debugGive('medkit'); g.debugGive('flare', 2); g.debugGive('battery'); g.player.inv.add('key_police'); g.player.inv.add('boltcutter'); });
  await page.evaluate(() => window.__game.openInventory());
  await page.waitForTimeout(600);
  const slot = page.locator('#inventory .slot:not(.empty)').nth(1);
  await slot.click(); await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/ui-inventory.png` });
  await page.evaluate(() => window.__game.closeInventory());
  await page.evaluate(() => window.__game.pause()); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ui-pause.png` });
  await page.evaluate(() => window.__game.openSettings('controls')); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ui-settings.png` });
  await page.locator('.tab[data-t=language]').click(); await page.waitForTimeout(300);
  await page.locator('.ch[data-v=en]').click(); await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/ui-settings-en.png` });
  await page.evaluate(() => window.__game.resume()); await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__game; g.player.hp = 22; g.engine.fx.low = 0.8; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/ui-lowhp-en.png` });
}
const list = shots[scenario] || [];
let i = 1;
for (const [x, y, yaw, pitch] of list) {
  await page.evaluate(([x, y, yaw, pitch]) => window.__game.debugTeleport(x, y, yaw, pitch), [x, y, yaw, pitch]);
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => window.__game.frameStats());
  console.log(`shot ${i} @${x},${y} yaw ${yaw}:`, JSON.stringify(st));
  await page.screenshot({ path: `${OUT}/${scenario}-${String(i).padStart(2, '0')}.png` });
  i++;
}
// touch joystick test: drag on left side and verify the player moved
const before = await page.evaluate(() => { const p = window.__game.player.pos; return [p.x, p.z]; });
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await touch('touchStart', 150, 300);
for (let k = 0; k < 10; k++) { await touch('touchMove', 150, 300 - k * 8); await page.waitForTimeout(40); }
await page.waitForTimeout(1500);
await touch('touchEnd', 0, 0);
const after = await page.evaluate(() => { const p = window.__game.player.pos; return [p.x, p.z]; });
console.log('joystick moved player:', Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(2), 'm');
fs.writeFileSync(`${OUT}/${scenario}-errors.txt`, errors.join('\n'));
console.log('errors:', errors.length); for (const e of errors.slice(0, 25)) console.log(' ', e.slice(0, 300));
await b.close(); srv.close();
