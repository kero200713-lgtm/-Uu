// Pipe melee with the touch fire button: swing animation runs, the player turns
// toward a zombie standing off to the side, hits land on the contact frame and a
// Hollow (80 HP) goes down in three pipe hits (30 each). Then the defence: a second
// tap chains a combo swing, the shield button blocks (a fraction gets through), a
// block raised just in time parries (no damage, attacker staggers), a roll dodges.
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

// ---- combo: tapping fire again during a swing chains the next one (no dead time)
await page.waitForFunction(() => window.__game.player.state === 'normal', null, { timeout: 30000 }).catch(() => {});
await G(() => { const p = window.__game.player, o = p.startMelee.bind(p); window.__sw = []; p.fireCd = 0; p.stamina = 100;
  p.startMelee = (c) => { window.__sw.push({ chain: !!c, t: +p.stateT.toFixed(2), st: p.state }); o(c); }; });
await tapEl('.tb-fire'); await page.waitForTimeout(250); await tapEl('.tb-fire');
await page.waitForFunction(() => window.__sw.some((s) => s.chain), null, { timeout: 30000 }).catch(() => {});
const sw = await G(() => window.__sw);
const ch = sw.find((s) => s.chain);
check('second tap chains a swing before the first fully recovers', !!ch && ch.st === 'melee' && ch.t < 1.0, JSON.stringify(sw));
check('swings cost stamina', (await G(() => window.__game.player.stamina)) < 100);
await page.waitForFunction(() => window.__game.player.state === 'normal', null, { timeout: 30000 }).catch(() => {});

// ---- a live Hollow right in front of her, attacking on demand
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 6, radiusY: 6, force: 1 })) });
const center = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); return bb && { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const setup = () => G(() => {
  const g = window.__game, p = g.player, V = p.pos.constructor;
  const e = window.__foe = window.__foe && window.__foe.state !== 'dead' ? window.__foe : g.enemies.list.find((x) => x.state !== 'dead' && x.kind === 'hollow' && x.id !== 'e_forest_eater');
  if (!e) return false;
  e.hp = 80; e.root.visible = true; if (e.state === 'dormant') e.set('idle');
  p.hp = 100; p.stamina = 100; p.invulnerable = 0; p.state = 'normal'; p.vel.set(0, 0, 0);
  const fw = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  e.pos.copy(p.pos).addScaledVector(fw, 1.0); e.root.position.copy(e.pos); e.yaw = Math.atan2(fw.x, fw.z); e.root.rotation.y = e.yaw;
  e.attackCd = 0; e.set('chase'); return true;
});
const attack = () => G(() => { const e = window.__foe; e.attackCd = 0; e.set('attack'); window.__hp = window.__game.player.hp; });
const attackOver = () => page.waitForFunction(() => window.__foe.attackDone && window.__foe.state !== 'attack' || window.__foe.state === 'stagger' || window.__game.player.hp < window.__hp, null, { timeout: 30000 }).catch(() => {});
check('a Hollow to block against', await setup());
await page.waitForFunction(() => !document.querySelector('.tb-dodge').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
check('dodge button shows up next to an enemy', await G(() => !document.querySelector('.tb-dodge').classList.contains('hidden')), await G(() => window.__game.enemies.nearestThreat(window.__game.player.pos).toFixed(2) + ' ' + window.__foe.state));
check('block button replaces aim with the pipe', await G(() => !document.querySelector('.tb-guard').classList.contains('hidden') && document.querySelector('.tb-aim').classList.contains('hidden')));

// plain block: guard held (touch on the shield button) well before the blow
const gb = await center('.tb-guard');
await touch('touchStart', [{ ...gb, id: 5 }]);
await page.waitForFunction(() => window.__game.player.guarding && window.__game.player.guardT > 0.4, null, { timeout: 30000 }).catch(() => {});
check('holding the shield button raises the block', await G(() => window.__game.player.guarding));
await attack(); await attackOver(); await page.waitForTimeout(300);
const blk = await G(() => ({ lost: window.__hp - window.__game.player.hp, st: window.__game.player.stamina, state: window.__game.player.state }));
check('blocked hit: only a fraction gets through, stamina pays', blk.lost > 0 && blk.lost <= 5 && blk.st < 100, JSON.stringify(blk));
await touch('touchEnd', []);

// parry: block raised just before the blow lands
await setup();
await G(() => { const g = window.__game, inp = window.__input; window.__parried = false;
  window.__unhook = g.engine.onUpdate(() => { const e = window.__foe, a = e.anim.upper.current; if (e.state === 'attack' && a && a.time / a.getClip().duration > e.t.attackHit - 0.12) inp.held.add('guard'); }); });
await attack(); await attackOver(); await page.waitForTimeout(200);
const par = await G(() => ({ lost: window.__hp - window.__game.player.hp, foe: window.__foe.state }));
check('parry: no damage and the attacker reels', par.lost === 0 && par.foe === 'stagger', JSON.stringify(par));
await G(() => { window.__unhook(); window.__input.held.delete('guard'); });

// dodge: roll away as the blow starts
await page.waitForTimeout(400);
await setup();
await G(() => { const g = window.__game, inp = window.__input; window.__rolled = null;
  window.__unhook = g.engine.onUpdate(() => { const e = window.__foe, a = e.anim.upper.current, p = g.player;
    if (!window.__rolled && e.state === 'attack' && a && a.time / a.getClip().duration > 0.15) { window.__rolled = p.pos.clone(); inp.press('dodge'); } }); });
await attack(); await attackOver();
await page.waitForFunction(() => window.__game.player.state === 'normal', null, { timeout: 30000 }).catch(() => {});
const dg = await G(() => ({ lost: window.__hp - window.__game.player.hp, moved: window.__rolled ? +window.__game.player.pos.distanceTo(window.__rolled).toFixed(2) : -1 }));
check('dodge roll: moves away and the blow misses', dg.lost === 0 && dg.moved > 1, JSON.stringify(dg));
await G(() => window.__unhook());
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
