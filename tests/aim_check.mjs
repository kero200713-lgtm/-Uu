// Aiming checks: pistol / shotgun held barrel-forward in the aim pose (screenshots),
// and no torso spin while strafing with the weapon raised (chest yaw stays bounded).
//   node tests/aim_check.mjs   -> tests/out/aim-*.png
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 640, height: 520 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr', dynamicResolution: false })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.touch.show(false); g.debugGive('pistol'); g.debugGive('shotgun'); g.debugTeleport(12.5, 30, 180, 0); g.engine.grade.exposure = 2.6; });
await page.evaluate(() => { const g = window.__game; window.__tgt = () => { const p = g.player, V = p.pos.constructor; p.aimTarget = p.pos.clone().add(new V(0, 1.55, 0)).addScaledVector(g.rig.forward(new V()), 20); }; });
await page.waitForTimeout(1200);
const results = [];
const check = (n, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${info}`); console.log(results.at(-1)); };

// step the player by hand with aiming forced on
const step = (n, move) => page.evaluate(([n, move]) => {
  const g = window.__game, p = g.player, inp = window.__input || null;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (move) { p.vel.set(Math.cos(p.yaw) * move, 0, -Math.sin(p.yaw) * move); }
    window.__tgt(); p.update(1 / 20, g.rig, false);
    p.root.updateMatrixWorld(true);
    const V = p.pos.constructor, Q = g.player.root.quaternion.constructor;
    const chest = p.anim.bone('spine_03').getWorldQuaternion(new Q());
    const f = new V(0, 0, 1).applyQuaternion(chest); f.y = 0; f.normalize();
    out.push(Math.atan2(f.x, f.z));
  }
  g.rig.update(0.016, p.pos, 0, false); g.engine.render(0.016);
  return out;
}, [n, move]);

for (const w of ['pistol', 'shotgun']) {
  await page.evaluate((w) => { const g = window.__game; g.engine.paused = true; g.player.equip(w); Object.defineProperty(g.player, 'aiming', { configurable: true, get: () => true }); }, w);
  await step(10, 0);
  const barrelErr = (move) => page.evaluate(async ([w, move]) => {
    const g = window.__game, p = g.player, V = p.pos.constructor;
    for (let i = 0; i < 8; i++) { if (move) p.vel.set(Math.cos(p.yaw) * move, 0, -Math.sin(p.yaw) * move); window.__tgt(); p.update(1 / 20, g.rig, false); }
    p.root.updateMatrixWorld(true);
    const grp = p.weapons.get(w), mesh = grp.children[0];
    const axis = w === 'pistol' ? new V(0, 0, 1) : new V(1, 0, 0);
    const Q = p.root.quaternion.constructor;
    const dir = axis.applyQuaternion(mesh.getWorldQuaternion(new Q())).normalize();
    const mz = mesh.localToWorld(w === 'pistol' ? new V(0, 0.058, 0.12) : new V(0.52, 0.12, 0));
    const cam = p.aimTarget.clone().sub(mz).normalize(); // barrel must point at the crosshair point
    return +(Math.acos(Math.min(1, dir.dot(cam))) * 57.3).toFixed(1);
  }, [w, move]);
  const e0 = await barrelErr(0), e1 = await barrelErr(1.4);
  check(`${w} barrel follows the aim (standing)`, e0 < 12, `${e0} deg`);
  check(`${w} barrel follows the aim (strafing)`, e1 < 15, `${e1} deg`);
  for (const [n, a, h, d] of [['side', 90, 0.05, 0.75], ['front', 0, 0.1, 0.9], ['top', 135, 0.45, 0.7]]) {
    // close-up framed on the gun hand
    await page.evaluate(([a, h, d]) => { const g = window.__game, p = g.player, V = p.pos.constructor; p.root.updateMatrixWorld(true);
      const hand = p.anim.bone('hand_r').getWorldPosition(new V()); const fw = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); const rt = new V(-fw.z, 0, fw.x);
      const r = (a * Math.PI) / 180; const dir = fw.clone().multiplyScalar(Math.cos(r)).addScaledVector(rt, Math.sin(r));
      g.rig.cinematic = { pos: hand.clone().addScaledVector(dir, d).add(new V(0, h, 0)), look: hand.clone(), w: 1 }; }, [a, h, d]);
    await step(1, 0);
    await page.screenshot({ path: `${OUT}/aim-${w}-${n}.png` });
  }
  await page.evaluate(() => { window.__game.rig.cinematic = null; });
}
// strafe right while aiming for 4 s of game time: chest yaw must not run away
await step(12, 1.4); // settle: the body first turns to the camera
const yaws = await step(80, 1.4);
const unwrap = []; let prev = yaws[0], acc = 0;
for (const y of yaws) { let d = y - prev; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; acc += d; prev = y; unwrap.push(acc); }
const span = Math.max(...unwrap) - Math.min(...unwrap);
check('no torso spin while strafing aimed', span < 1.2, `chest yaw span ${span.toFixed(2)} rad over ${yaws.length} frames`);
if (span >= 1.2) console.log(yaws.map((y) => (y * 57.3).toFixed(0)).join(' '));
await page.evaluate(() => { window.__game.debugCloseUp(300, -0.3, 2.2); });
await step(1, 1.4);
await page.screenshot({ path: `${OUT}/aim-strafe.png` });
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
