// Combat performance probe: compares frame cost while idle and during a fight
// (shots, melee, blood, decals, grab) and reports shader programs compiled
// mid-fight (each one is a visible hitch on mobile GPUs).
//   node tests/perf_combat.mjs   (Q=low|medium|high, DIST=<dir>)
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 960, height: 440 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: q, language: 'tr', dynamicResolution: false })), process.env.Q || 'medium');
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.waitForTimeout(3000);
// per-frame CPU cost of update+render, measured inside the page
await page.evaluate(() => {
  const g = window.__game, e = g.engine, r = e.renderer;
  window.__perf = { samples: [], progs: () => r.info.programs.length, names: () => r.info.programs.map((p) => p.name + ':' + p.id + ':' + p.cacheKey.slice(0, 160)) };
  const orig = e.render.bind(e);
  e.render = (dt) => { const t = performance.now(); orig(dt); const d = performance.now() - t; window.__perf.samples.push(d); if (d > 100) (window.__perf.spikes ||= []).push((window.__phase || '?') + ':' + Math.round(d)); };
  const ups = e.updaters; e.updaters = ups.map((f, i) => (dt, t) => { const s0 = performance.now(); f(dt, t); const d = performance.now() - s0; if (d > 60) (window.__perf.uspikes ||= []).push((window.__phase || '?') + ':u' + i + ':' + Math.round(d)); });
});
const measure = async (ms) => { await page.evaluate(() => (window.__perf.samples = [])); await page.waitForTimeout(ms); return page.evaluate(() => { const s = window.__perf.samples.slice().sort((a, b) => a - b); const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length); return { n: s.length, avg: +avg.toFixed(1), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(1) }; }); };

await page.evaluate(() => window.__game.debugTeleport(16.6, 17.2, 0, -0.1));
await page.waitForTimeout(2500);
const progs0 = await page.evaluate(() => window.__perf.progs());
const names0 = await page.evaluate(() => window.__perf.names());
const idle = await measure(6000);
console.log('idle   ', JSON.stringify(idle), 'programs', progs0);

// fight: pistol + melee on the eater, blood + decals, a grab by the patrol hollow
await page.evaluate(() => { const g = window.__game; g.debugGive('pistol'); g.debugGive('ammo_9mm', 40); g.debugGive('pipe'); });
const fight = page.evaluate(async () => {
  const g = window.__game, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const e = g.enemies.byId('e_forest_eater');
  for (let i = 0; i < 6; i++) {
    window.__phase = 'shot' + i;
    const dir = new (g.player.pos.constructor)().subVectors(e.pos, g.player.pos).normalize();
    e.damage(8, dir, i % 3 ? 'body' : 'head', 0.3, 0, e.pos.clone().setY(1.3));
    g.fx.muzzleFlash(g.player.pos.clone().setY(1.4));
    await sleep(350);
  }
  window.__phase = 'grab';
  const p = g.enemies.byId('e_forest_patrol');
  if (p) { p.pos.copy(g.player.pos).add(new (p.pos.constructor)(0.7, 0, 0)); p.root.position.copy(p.pos); p.state = 'chase'; g.player.startGrab(p); p.set('grab'); }
  await sleep(2500);
  window.__phase = 'die';
  if (p) p.die();
  e.die();
  await sleep(50); window.__phase = 'after';
  await sleep(1500);
});
const during = await measure(6500);
await fight;
const progs1 = await page.evaluate(() => window.__perf.progs());
const names1 = await page.evaluate(() => window.__perf.names());
console.log('combat ', JSON.stringify(during), 'programs', progs1);
const ids0 = new Set(names0.map((n) => n.split(':')[1]));
console.log('new programs during combat:', JSON.stringify(names1.filter((n) => !ids0.has(n.split(':')[1])), null, 1));
const after = await page.evaluate(() => ({ grabbed: !!window.__game.player.grabbedBy, state: window.__game.player.state, hudGrab: !!document.querySelector('.struggle.on, #struggle.on') }));
console.log('spikes', JSON.stringify(await page.evaluate(() => [window.__perf.spikes, window.__perf.uspikes])));
console.log('after combat:', JSON.stringify(after));
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
