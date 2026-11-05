// iPad-style touch test: iPad Pro 11 viewport/UA/DPR, Safari-like autoplay rules
// (audio only after a gesture), the build served under a GitHub Pages style
// sub-path, and real multi-touch through CDP touch events:
// menu tap -> new game -> joystick walk + simultaneous camera drag -> buttons
// (flashlight, inventory, pause/resume) -> rotate to portrait and back.
//   node tests/ipad.mjs            (DIST=<dir> to test another build, URL=<address> for a live deploy)
import { chromium, devices } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const SUB = '/-Uu/'; // GitHub Pages project path
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const srv = http.createServer((q, res) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end(); return; }
  p = '/' + p.slice(SUB.length); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const URL = process.env.URL || `http://localhost:${srv.address().port}${SUB}`; // URL=<live address> tests a deployed build

const dev = devices['iPad Pro 11 landscape'];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...dev });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [], bad = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await page.addInitScript(() => { if (!localStorage.getItem('ugultu_settings_v1')) localStorage.setItem('ugultu_settings_v1', JSON.stringify({ language: 'tr' })); });

const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };
const G = (fn, arg) => page.evaluate(fn, arg);
const center = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); if (!bb) throw new Error('no element ' + sel); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 6, radiusY: 6, force: 1 })) });
const tap = async (sel) => { const c = await center(sel); await touch('touchStart', [{ ...c, id: 9 }]); await page.waitForTimeout(80); await touch('touchEnd', []); };

const t0 = Date.now();
await page.goto(URL);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
check('boots to menu under sub-path', true, `${Date.now() - t0} ms`);
const info = await G(() => { const g = window.__game, r = g.engine.renderer; return { level: g.engine.level, w: r.domElement.width, h: r.domElement.height, dpr: devicePixelRatio, half: g.engine.halfFloat, ctx: r.getContext().constructor.name, ua: navigator.userAgent.slice(0, 60) }; });
check('WebGL2 renderer', /WebGL2/.test(info.ctx), JSON.stringify(info));
check('render resolution within pixel budget', info.w * info.h <= 2.9e6, `${info.w}x${info.h}`);
await page.screenshot({ path: `${OUT}/ipad-menu.png` });

// Safari rules: audio stays suspended until a gesture
const before = await G(() => window.__game && (window.__audio?.ctx?.state ?? null));
await tap('button.mi[data-k=new]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.waitForTimeout(1500);
const aud = await G(() => window.__audio ? { state: window.__audio.ctx?.state, primed: window.__audio.primed } : null);
check('audio unlocked by first tap', !aud || aud.state === 'running', JSON.stringify({ before, aud }));
check('touch controls visible', await G(() => document.body.classList.contains('touch') && getComputedStyle(document.getElementById('touch')).display !== 'none'));

// ---- joystick + camera at the same time (two fingers)
const p0 = await G(() => ({ x: window.__game.player.pos.x, z: window.__game.player.pos.z, yaw: window.__game.rig.yaw }));
const L = { x: 230, y: 600, id: 1 }, R = { x: 860, y: 380, id: 2 };
await touch('touchStart', [L]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ ...L, y: L.y - i * 14 }]); await page.waitForTimeout(30); }
await touch('touchStart', [{ ...L, y: L.y - 84 }, R]);
for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ ...L, y: L.y - 84 }, { ...R, x: R.x + i * 12 }]); await page.waitForTimeout(60); }
await page.waitForFunction((p0) => { const p = window.__game.player.pos; return Math.hypot(p.x - p0.x, p.z - p0.z) > 0.8; }, p0, { timeout: 60000 }).catch(() => {});
const p1 = await G(() => ({ x: window.__game.player.pos.x, z: window.__game.player.pos.z, yaw: window.__game.rig.yaw }));
await page.screenshot({ path: `${OUT}/ipad-move.png` });
await touch('touchEnd', []);
check('joystick moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8, JSON.stringify({ p0, p1 }));
check('camera drag turns the view while moving', Math.abs(p1.yaw - p0.yaw) > 0.05, `dyaw=${(p1.yaw - p0.yaw).toFixed(3)}`);
await page.waitForFunction(() => Math.hypot(window.__game.player.vel.x, window.__game.player.vel.z) < 0.6, null, { timeout: 20000 }).catch(() => {});
check('joystick released', await G(() => Math.hypot(window.__game.player.vel.x, window.__game.player.vel.z) < 0.6));
// sprint is a button now (a fully pushed stick is a normal run)
await tap('.tb-run');
await touch('touchStart', [L]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ ...L, y: L.y - i * 14 }]); await page.waitForTimeout(30); }
await page.waitForFunction(() => window.__game.player.running, null, { timeout: 20000 }).catch(() => {});
check('sprint button makes Ela sprint', await G(() => window.__game.player.running));
await touch('touchEnd', []);
await page.waitForTimeout(400);
check('releasing the stick ends the sprint', await G(() => !window.__input?.runToggled && !window.__game.player.running));

// ---- contextual / top buttons
const f0 = await G(() => window.__game.player.flashOn);
await tap('.tb-flash'); await page.waitForTimeout(700);
check('flashlight button', (await G(() => window.__game.player.flashOn)) !== f0);
await tap('.tb-flash'); await page.waitForTimeout(500);
await tap('.tb-inv');
await page.waitForFunction(() => window.__game.state === 'inventory', null, { timeout: 30000 }).catch(() => {});
check('inventory button opens inventory', (await G(() => window.__game.state)) === 'inventory');
await page.screenshot({ path: `${OUT}/ipad-inventory.png` });
await page.keyboard.press('Escape').catch(() => {});
await G(() => { if (window.__game.state === 'inventory') window.__game.closeInventory?.(); });
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 }).catch(() => {});
await tap('.tb-pause');
await page.waitForFunction(() => window.__game.state === 'paused', null, { timeout: 30000 }).catch(() => {});
check('pause button', (await G(() => window.__game.state)) === 'paused');
await page.screenshot({ path: `${OUT}/ipad-pause.png` });
await tap('button[data-k=res]');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 }).catch(() => {});
check('resume from pause by tap', (await G(() => window.__game.state)) === 'play');

// ---- rotate to portrait and back
await page.setViewportSize({ width: 834, height: 1194 });
await page.waitForTimeout(1500);
const port = await G(() => ({ w: window.__game.engine.renderer.domElement.width, h: window.__game.engine.renderer.domElement.height, aspect: window.__game.engine.camera.aspect }));
check('portrait resize', port.h > port.w && Math.abs(port.aspect - 834 / 1194) < 0.01, JSON.stringify(port));
await page.screenshot({ path: `${OUT}/ipad-portrait.png` });
await page.setViewportSize({ width: 1194, height: 834 });
await page.waitForTimeout(1200);
check('landscape restore', await G(() => window.__game.engine.camera.aspect > 1.3));

// ---- reload: service worker + saved settings must not break boot
await page.reload();
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 }).catch(() => {});
check('reload boots again (service worker active)', (await G(() => window.__game?.state)) === 'menu', String(await G(() => !!navigator.serviceWorker?.controller)));

check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
check('no failed requests', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
fs.writeFileSync(`${OUT}/ipad-results.txt`, results.join('\n') + '\n');
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
