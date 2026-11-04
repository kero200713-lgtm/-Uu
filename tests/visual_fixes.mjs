// Screenshots for the iPad playtest fixes: chest lamp, forest map edge at the
// north gate, the "is someone there?" apparition pose, blood pools on concrete.
//   node tests/visual_fixes.mjs   (Q=low|medium|high, DIST=<dir>) -> tests/out/vf-*.png
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: q, language: 'tr' })), process.env.Q || 'medium');
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.touch.show(false); });
const G = (fn, a) => page.evaluate(fn, a);
const shot = async (name, wait = 1500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/vf-${name}.png` }); console.log('shot', name); };

// 1) chest lamp: side and front close-ups
await G(() => window.__game.debugTeleport(12.5, 30, 180, 0));
await page.waitForTimeout(1500);
for (const [n, a, h, d] of [['lamp-side', 270, -0.25, 0.75], ['lamp-front', 205, -0.2, 0.8], ['lamp-back', 0, 0.3, 2.2]]) {
  await G(([a, h, d]) => window.__game.debugCloseUp(a, h, d), [a, h, d]);
  await shot(n);
}
await G(() => { window.__game.rig.cinematic = null; });

// 2) forest north edge: looking out through the gate, and from higher up
await G(() => window.__game.debugTeleport(12.5, 3.5, 0, 0.05));
await shot('edge-gate', 2500);
await G(() => window.__game.debugTeleport(5.5, 3.5, 30, 0.1));
await shot('edge-trees', 2000);
await G(() => { const g = window.__game; const gate = g.level.w(12.5, 0.5, 0); g.engine.grade.exposure = 3; g.rig.cinematic = { pos: gate.clone().add({ x: 0, y: 24, z: 14 }), look: gate.clone().add({ x: 0, y: 0, z: -8 }), w: 1 }; });
await shot('edge-high', 2500);
await G(() => { window.__game.rig.cinematic = null; window.__game.engine.grade.exposure = 1; });

// 3) apparition pose
await G(() => window.__game.debugTeleport(12.5, 40, 0, 0.02));
await shot('apparition', 1800);

// 4) blood pools on the bus-stop concrete, two camera angles
await G(() => window.__game.debugTeleport(17.5, 14.5, 20, -0.35));
await shot('blood-a', 2000);
await G(() => window.__game.debugTeleport(14.5, 14.8, -40, -0.2));
await shot('blood-b', 2000);
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
