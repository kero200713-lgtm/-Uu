// Gameplay flow test with emulated touch: combat, damage, pickups, inventory,
// documents, saving at a radio, reloading the page and continuing.
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const URL = `http://localhost:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 440 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/sw\.js|404/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => { if (!localStorage.getItem('ugultu_settings_v1')) localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr', aimAssist: true })); });
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };
const G = (fn, arg) => page.evaluate(fn, arg);
const tapEl = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); if (!bb) throw new Error('no element ' + sel); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };

await page.goto(URL);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
await tapEl('button.mi[data-k=new]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await page.waitForTimeout(1500);

// ---- pickup via touch interact button: walk to the pipe
await G(() => window.__game.debugTeleport(9.5, 42.6, 35, -0.3));
await page.waitForTimeout(800);
const prompt = await G(() => window.__game.focus && window.__game.promptFor(window.__game.focus));
check('interact prompt near pipe', !!prompt, JSON.stringify(prompt));
await tapEl('.tb-interact');
await page.waitForFunction(() => window.__game.player.inv.weapons.includes('pipe'), null, { timeout: 30000 }).catch(() => {});
check('pipe picked up via touch', await G(() => window.__game.player.inv.weapons.includes('pipe')));

// ---- combat: give pistol, approach the bus-stop eater, aim + fire with touch buttons
await G(() => { const g = window.__game; g.debugGive('pistol'); g.debugGive('ammo_9mm', 20); });
await G(() => window.__game.debugTeleport(16.6, 17.2, 0, -0.1));
await page.waitForTimeout(1200);
const e0 = await G(() => { const e = window.__game.enemies.byId('e_forest_eater'); return e ? { hp: e.hp, st: e.state } : null; });
check('eater enemy present', !!e0, JSON.stringify(e0));
await tapEl('.tb-aim');
await page.waitForTimeout(700);
check('aiming after tap', await G(() => window.__game.player.aiming));
await page.screenshot({ path: `${OUT}/flow-aim.png` });
for (let i = 0; i < 6; i++) { await tapEl('.tb-fire'); await page.waitForTimeout(450); }
const e1 = await G(() => { const e = window.__game.enemies.byId('e_forest_eater'); return { hp: e.hp, st: e.state, mag: window.__game.player.inv.mags.pistol }; });
check('shots fired and enemy damaged', e1.hp < e0.hp || e1.st === 'dead', JSON.stringify(e1));
await page.screenshot({ path: `${OUT}/flow-shoot.png` });
// keep firing until dead
for (let i = 0; i < 8 && (await G(() => window.__game.enemies.byId('e_forest_eater').state !== 'dead')); i++) { await tapEl('.tb-fire'); await page.waitForTimeout(450); }
check('enemy killed', await G(() => window.__game.enemies.byId('e_forest_eater').state === 'dead'));
await tapEl('.tb-aim');

// ---- enemy AI: patrol hollow should notice & attack when we stand in front of it lit
await G(() => { const g = window.__game; const e = g.enemies.byId('e_forest_patrol'); g.debugTeleport(e.pos.x / 2, e.pos.z / 2 + 2.2, 0, -0.1); });
const hp0 = await G(() => window.__game.player.hp);
await page.waitForTimeout(6000);
const ai = await G(() => { const g = window.__game; const e = g.enemies.byId('e_forest_patrol'); return { st: e.state, alert: e.alert, hp: g.player.hp, grabbed: !!g.player.grabbedBy }; });
check('patrol enemy detected player and attacked', ai.hp < hp0 || ai.grabbed || ['chase', 'attack', 'grab'].includes(ai.st), JSON.stringify(ai));
await page.screenshot({ path: `${OUT}/flow-attack.png` });
// break free if grabbed
for (let i = 0; i < 10; i++) { if (await G(() => !!window.__game.player.grabbedBy)) { await tapEl('.tb-interact'); await page.waitForTimeout(120); } }

// ---- inventory open/close with touch
await G(() => { const g = window.__game; g.player.hp = 100; g.enemies.list.forEach((e) => e.state !== 'dead' && e.die()); });
await tapEl('.tb-inv');
await page.waitForTimeout(700);
check('inventory opened', await G(() => window.__game.state === 'inventory'));
const slot = page.locator('#inventory .slot:not(.empty)').first();
if (await slot.count()) { const bb = await slot.boundingBox(); await page.touchscreen.tap(bb.x + 20, bb.y + 20); await page.waitForTimeout(500); }
await page.screenshot({ path: `${OUT}/flow-inventory.png` });
await tapEl('.inv-close');
await page.waitForTimeout(400);
check('inventory closed', await G(() => window.__game.state === 'play'));

// ---- document reading
await G(() => window.__game.debugTeleport(11.3, 47.8, -146, -0.4));
await page.waitForTimeout(800);
const f2 = await G(() => window.__game.focus?.kind);
if (f2 === 'doc') { await tapEl('.tb-interact'); await page.waitForTimeout(800); }
check('document view opened', await G(() => window.__game.state === 'doc'), String(f2));
await page.screenshot({ path: `${OUT}/flow-doc.png` });
if (await page.locator('.panel.doc .close').count()) await tapEl('.panel.doc .close');
await page.waitForTimeout(400);

// ---- town: save at the radio, reload page, continue
await G(() => window.__game.loadArea('town', 'from_forest'));
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 60000 });
await G(() => { const g = window.__game; g.flags.add('unlock:house_front'); const d = g.level.doors.find((x) => x.id === 'house_front'); d.locked = false; g.level.openDoor(d, g.player.pos); g.debugTeleport(9.9, 30.1, 0, -0.3); });
await page.waitForTimeout(800);
const f3 = await G(() => window.__game.focus?.kind);
check('radio in focus', f3 === 'save', String(f3));
await tapEl('.tb-interact');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/flow-save-dialog.png` });
await tapEl('.panel.dialog [data-k=yes]');
await page.waitForTimeout(500);
const saved = await G(() => JSON.parse(localStorage.getItem('ugultu_save_manual_v1') || 'null'));
check('manual save written', !!saved && saved.area === 'town', saved ? saved.area : 'none');
await page.reload();
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
await tapEl('button.mi[data-k=cont]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
const after = await G(() => ({ area: window.__game.areaId, w: window.__game.player.inv.weapons, x: window.__game.player.pos.x }));
check('continue restores area + inventory', after.area === 'town' && after.w.includes('pistol'), JSON.stringify(after));

console.log('page errors:', errors.length, errors.slice(0, 10));
fs.writeFileSync(`${OUT}/flow-results.txt`, results.join('\n') + '\n' + errors.join('\n'));
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
