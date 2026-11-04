import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(process.env.DIST || 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 960, height: 440 } });
page.on('pageerror', (e) => console.log('pageerror', e.message, e.stack?.split('\n').slice(0,3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 300)); });
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'high', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
const shots = [['clinic', 'e_cl_lurk_a', 0.0, 'lurk'], ['mine', 'e_mn_husk', 3.2, 'husk'], ['facility', 'e_fc_listener', 3.4, 'listener'], ['clinic', 'e_cl_nurse1', 3.0, 'nurse']];
for (const [area, id, dist, name] of shots) {
  await page.evaluate((a) => window.__game.loadArea(a, a === 'clinic' ? 'from_town' : a === 'mine' ? 'from_clinic' : 'from_mine'), area);
  await page.evaluate(([id, dist]) => {
    const g = window.__game; g.player.invulnerable = 9999;
    const e = g.enemies.byId(id); e.think = () => {}; e.attackCd = 999;
    if (e.state !== 'ambush') { e.set('idle'); }
    // stand in front of it, facing it
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const d = dist || 4.2;
    const p = e.pos.clone(); p.x += fx * d; p.z += fz * d;
    g.level.grid.collide(p, 0.3);
    const yaw = Math.atan2(-(e.pos.x - p.x), -(e.pos.z - p.z));
    g.player.spawn(p, yaw); g.rig.yaw = yaw; g.rig.pitch = -0.08;
  }, [id, dist]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: '/tmp/claude-0/enemy_' + name + '.png' });
}
const r = { ok: 1 };
console.log(JSON.stringify(r, null, 1));
await b.close(); srv.close();
