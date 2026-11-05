import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve('dist');
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 520, height: 420 } });
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr' })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.touch.show(false); g.debugGive('shotgun'); g.debugGive('pistol'); g.debugTeleport(12.5, 30, 180, 0); g.engine.grade.exposure = 3; });
await page.waitForTimeout(800);
const views = [];
for (const [aim, wpn] of [[true, 'shotgun'], [false, 'shotgun'], [true, 'pistol'], [false, 'pistol']]) {
  const info = await page.evaluate(([aim, wpn]) => {
    const g = window.__game, p = g.player, V = p.pos.constructor; g.engine.paused = true; p.equip(wpn);
    Object.defineProperty(p, 'aiming', { configurable: true, get: () => aim });
    for (let i = 0; i < 15; i++) { p.aimTarget = p.pos.clone().add(new V(0, 1.5, 0)).addScaledVector(g.rig.forward(new V()), 20); p.update(1 / 20, g.rig, false); }
    p.root.updateMatrixWorld(true);
    const gun = p.weapons.get(wpn).children[0].getWorldPosition(new V()).sub(p.pos);
    return { gun: gun.toArray().map((v) => +v.toFixed(2)), yaw: p.yaw };
  }, [aim, wpn]);
  for (const [n, ang] of [['side', 90], ['front', 30]]) {
    await page.evaluate(([ang]) => { const g = window.__game, p = g.player, V = p.pos.constructor; const fw = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), rt = new V(-fw.z, 0, fw.x); const r = ang * Math.PI / 180; const dir = fw.clone().multiplyScalar(Math.cos(r)).addScaledVector(rt, Math.sin(r));
      const c = p.pos.clone().add(new V(0, 1.25, 0)); g.rig.cinematic = { pos: c.clone().addScaledVector(dir, 1.5).add(new V(0, 0.3, 0)), look: c.clone().add(new V(0, 0.1, 0)), w: 1 }; g.rig.update(0.016, p.pos, 0, false); g.engine.render(0.016); }, [ang]);
    await page.waitForTimeout(150);
    const f = `tests/out/sg-${wpn}-${aim ? 'aim' : 'low'}-${n}.png`; await page.screenshot({ path: f }); views.push(f);
  }
  console.log(wpn, aim, JSON.stringify(info));
}
await b.close(); srv.close();
