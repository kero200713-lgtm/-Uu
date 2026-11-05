// Pipe melee with the touch fire button: swing animation runs, the player turns
// toward a zombie standing off to the side, hits land on the contact frame and a
// Hollow (80 HP) goes down in three pipe hits (30 each).
//   node tests/melee.mjs   (DIST=<dir>)
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 440 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'low', language: 'tr' })));
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };
const G = (fn, a) => page.evaluate(fn, a);
const tapEl = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };

await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await G(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.waitForTimeout(1500);
// the bus-stop eater, placed 1.3 m away at ~50 degrees to the player's right
await G(() => {
  const g = window.__game, p = g.player; g.debugGive('pipe'); p.equip('pipe');
  g.debugTeleport(16.6, 18.2, 0, -0.1);
  const e = g.enemies.byId('e_forest_eater'); const V = p.pos.constructor;
  e.pos.copy(p.pos).add(new V(Math.sin(0.9) * 1.3, 0, -Math.cos(0.9) * 1.3)); e.root.position.copy(e.pos);
  e.attackCd = 99; window.__hp0 = e.hp; window.__sawMelee = false;
  g.engine.onUpdate(() => { if (p.state === 'melee') window.__sawMelee = true; });
});
const yaw0 = await G(() => window.__game.player.yaw);
await tapEl('.tb-fire');
await page.waitForFunction(() => window.__game.enemies.byId('e_forest_eater').hp < window.__hp0 || window.__game.enemies.byId('e_forest_eater').state === 'dead', null, { timeout: 30000 }).catch(() => {});
const r1 = await G(() => { const g = window.__game, e = g.enemies.byId('e_forest_eater'); return { hp: e.hp, st: e.state, yaw: g.player.yaw, melee: window.__sawMelee }; });
check('swing animation played', r1.melee);
check('turned toward the zombie on the side', Math.abs(r1.yaw - yaw0) > 0.4, `yaw ${yaw0.toFixed(2)} -> ${r1.yaw.toFixed(2)}`);
check('first pipe hit lands (30 dmg)', r1.hp <= 50 + 0.01 && r1.hp > 0, JSON.stringify(r1));
for (let i = 0; i < 4 && (await G(() => window.__game.enemies.byId('e_forest_eater').state !== 'dead')); i++) {
  await page.waitForFunction(() => window.__game.player.fireCd <= 0 && window.__game.player.state === 'normal', null, { timeout: 30000 }).catch(() => {});
  await G(() => { const g = window.__game, e = g.enemies.byId('e_forest_eater'); if (e.state !== 'dead') { e.pos.copy(g.player.pos).add(new (e.pos.constructor)(Math.sin(g.player.yaw) * -1.2, 0, -Math.cos(g.player.yaw) * 1.2)); e.root.position.copy(e.pos); e.attackCd = 99; } });
  const hp = await G(() => window.__game.enemies.byId('e_forest_eater').hp);
  await tapEl('.tb-fire');
  await page.waitForFunction((hp) => window.__game.enemies.byId('e_forest_eater').hp < hp, hp, { timeout: 30000 }).catch(() => {});
}
const swings = await G(() => window.__game.enemies.byId('e_forest_eater').state);
check('Hollow down in three pipe hits', swings === 'dead');
await page.screenshot({ path: `${OUT}/melee.png` });
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
