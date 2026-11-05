// Weapon holds and melee defence poses as the game plays them, two angles each:
// pistol idle / aim, pipe idle / walk / block / mid-swing (heavy + light), bare-hand
// block, mid-roll.   node tests/hold.mjs -> tests/out/hold.png   (ONLY=a,b to pick)
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { execFileSync } from 'child_process';
const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 360, height: 420 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr', dynamicResolution: false })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.touch.show(false); g.debugGive('pipe'); g.debugGive('pistol'); g.debugTeleport(12.5, 30, 180, 0); g.engine.grade.exposure = 3.0; g.engine.grade.vignette = 0; g.engine.paused = true; });
await page.waitForTimeout(800);
// pose: [weapon|'' , setup js, frames to step, extra per-frame js]
const POSES = {
  pistol_idle: ['pistol', '', 20],
  pistol_walk: ['pistol', '', 14, 'p.vel.set(-Math.sin(p.yaw) * 1.4, 0, -Math.cos(p.yaw) * 1.4)'],
  pistol_aim: ['pistol', "Object.defineProperty(p, 'aiming', { configurable: true, get: () => true })", 20],
  pipe_idle: ['pipe', '', 20],
  pipe_walk: ['pipe', '', 14, 'p.vel.set(-Math.sin(p.yaw) * 1.4, 0, -Math.cos(p.yaw) * 1.4)'],
  pipe_block: ['pipe', '', 14, "window.__input.held.add('guard')"],
  pipe_heavy: ['pipe', 'p.startMelee()', 8],
  pipe_light: ['pipe', 'p.startMelee(); for (let i = 0; i < 18; i++) p.update(1 / 30, g.rig, false); p.startMelee(true)', 5],
  fist_block: ['', '', 14, "window.__input.held.add('guard')"],
  roll: ['pipe', "p.startDodge(g.rig)", 7],
};
const only = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(POSES);
const files = [];
for (const name of only) {
  const [w, setup, n, per] = POSES[name];
  for (const ang of (process.env.ANGS || '35,110').split(',').map(Number)) {
    await page.evaluate(([w, setup, n, per, ang, close]) => {
      const g = window.__game, p = g.player;
      delete p.aiming; window.__input.held.clear();
      if (w) p.equip(w); else { p.inv.equipped = ''; p.updateWeaponVisual(); }
      g.rig.cinematic = null; p.state = 'normal'; p.fireCd = 0; p.invulnerable = 0; p.dodgeCd = 0; p.stamina = 100; p.guarding = false; p.vel.set(0, 0, 0); p.yaw = 0; p.root.rotation.y = 0;
      for (let i = 0; i < 30; i++) p.update(1 / 30, g.rig, true);
      new Function('g', 'p', setup)(g, p);
      for (let i = 0; i < n; i++) { if (per) new Function('g', 'p', per)(g, p); p.update(1 / 30, g.rig, true); }
      // camera relative to her facing: ang 0 = straight in front, 90 = her right side
      const V = p.pos.constructor, fw = new V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), rt = new V(-fw.z, 0, fw.x), r = ang * Math.PI / 180;
      const dir = fw.clone().multiplyScalar(Math.cos(r)).addScaledVector(rt, Math.sin(r)), c = p.pos.clone().add(new V(0, p.state === 'dodge' ? 0.6 : 1.2, 0));
      if (close) { p.root.updateMatrixWorld(true); c.copy(p.anim.bone('hand_r').getWorldPosition(new V())); }
      g.rig.cinematic = { pos: c.clone().addScaledVector(dir, close ? 0.55 : 1.7).add(new V(0, close ? 0.12 : 0.15, 0)), look: c, w: 1 };
      g.rig.update(0.016, p.pos, 0, false); g.engine.render(0.016);
      window.__input.held.clear();
    }, [w, setup, n, per || '', ang, !!process.env.CLOSE]);
    const f = `${OUT}/_h_${name}_${ang}.png`; await page.screenshot({ path: f }); files.push(f);
  }
}
execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
fs = sys.argv[1:-1]; ims = [Image.open(f).convert('RGB') for f in fs]; W, H = ims[0].size; cols = 6; k = 0.6
ims = [im.resize((int(W * k), int(H * k))) for im in ims]; w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (w * cols, h * rows))
for i, im in enumerate(ims):
  d = ImageDraw.Draw(im); d.text((4, 4), fs[i].split('_h_')[1][:-4], fill=(255, 255, 0)); s.paste(im, ((i % cols) * w, (i // cols) * h))
s.save(sys.argv[-1])`, ...files, `${OUT}/${process.env.CLOSE ? 'hold-close' : 'hold'}.png`]);
for (const f of files) fs.unlinkSync(f);
console.log('errors', JSON.stringify(errors));
await b.close(); srv.close();
