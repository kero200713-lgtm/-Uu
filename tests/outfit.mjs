// Ela's clothes: full-body views from four sides plus a gameplay-distance shot,
// and the triangle cost of body + garments.  node tests/outfit.mjs -> tests/out/outfit.png
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: +(process.env.W || 480), height: +(process.env.H || 620) } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: q, language: 'tr' })), process.env.Q || 'medium');
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
const stats = await page.evaluate(() => {
  const g = window.__game, p = g.player; g.hud.show(false); g.touch.show(false); g.debugTeleport(12.5, 30, 180, 0); g.engine.grade.exposure = 2.6;
  const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  return p.human.meshes.map((m) => `${m.name || 'mesh'}:${tri(m)}`).join(' ');
});
console.log('meshes', stats);
await page.waitForTimeout(1200);
const files = [];
const VIEWS = process.env.CLOSE ? [['cfront', 25, 0.25, 1.25], ['cback', 160, 0.3, 1.25]] : [['front', 0, 0.0, 2.6], ['side', 90, 0.0, 2.6], ['back', 180, 0.1, 2.6], ['q', 40, 0.4, 2.0], ['game', 180, 0.9, 3.4]];
for (const [n, ang, h, d] of VIEWS) {
  await page.evaluate(([ang, h, d]) => { const g = window.__game, p = g.player, V = p.pos.constructor; const fw = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), rt = new V(-fw.z, 0, fw.x); const r = ang * Math.PI / 180;
    const dir = fw.clone().multiplyScalar(Math.cos(r)).addScaledVector(rt, Math.sin(r)); const c = p.pos.clone().add(new V(0, 0.95, 0));
    g.rig.cinematic = { pos: c.clone().addScaledVector(dir, d).add(new V(0, h, 0)), look: c, w: 1 }; }, [ang, h, d]);
  await page.waitForTimeout(1400);
  const f = `${OUT}/_o_${n}.png`; await page.screenshot({ path: f }); files.push(f);
}
const OUTF = process.env.CLOSE ? 'outfit-close.png' : 'outfit.png';
execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
fs = sys.argv[1:-1]; ims = [Image.open(f).convert('RGB') for f in fs]; W, H = ims[0].size; k = min(1.0, 1500 / (W * len(ims))); ims = [im.resize((int(W * k), int(H * k))) for im in ims]
s = Image.new('RGB', (ims[0].width * len(ims), ims[0].height))
for i, im in enumerate(ims): s.paste(im, (i * ims[0].width, 0))
s.save(sys.argv[-1])`, ...files, `${OUT}/${OUTF}`]);
for (const f of files) fs.unlinkSync(f);
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
