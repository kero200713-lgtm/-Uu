// Film strips of player actions as the game really plays them (state machine,
// both animation layers, procedural parts), stepped at a fixed rate:
//   node tests/anim_strips.mjs [melee,melee2,reload,heal,pickup,throw,hurt]
//   -> tests/out/anim-<action>.png   (FR=frames, SC=thumbnail scale, ANG=camera angle)
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 420, height: 460 } });
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'medium', language: 'tr', dynamicResolution: false })));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.touch.show(false); g.debugGive('pipe'); g.debugGive('pistol'); g.debugGive('bandage', 2); g.debugTeleport(12.5, 30, 180, 0); g.engine.grade.exposure = 3.2; g.engine.grade.vignette = 0; });
await page.waitForTimeout(1500);

const FR = +(process.env.FR || 10), SC = process.env.SC || '0.45', STEP = 1 / 15;
const actions = {
  melee: { weapon: 'pipe', run: 'p.startMelee()', time: 1.45 },
  melee2: { weapon: 'pipe', run: 'p.startMelee()', time: 1.45, again: 0.8 },
  reload: { weapon: 'pistol', run: "p.inv.mags.pistol = 2; p.inv.add('ammo_9mm', 10); p.startReload?.()", time: 1.5 },
  heal: { weapon: 'pipe', run: "p.hp = 50; p.heal('bandage')", time: 1.1 },
  pickup: { weapon: 'pipe', run: "p.playInteract?.('low')", time: 1.0 },
  throw: { weapon: 'pipe', run: "p.inv.add('flare', 1); p.throwFlare()", time: 1.1 },
  shoot: { weapon: 'pistol', run: "p.inv.mags.pistol = 5; p.state = 'normal'; window.__game.player.fireCd = 0; p.tryFire?.()", time: 0.6 },
  hurt: { weapon: 'pipe', run: 'p.damage(5, p.pos.clone().add({x:0,y:0,z:-1}))', time: 0.6 },
  // heavy swing, fire pressed again at 0.3 s and 0.9 s: chains into the light return swing and back
  combo: { weapon: 'pipe', run: 'p.startMelee()', time: 1.9, queue: [0.3, 0.9], ctl: true },
  roll: { weapon: 'pipe', run: 'p.startDodge(window.__game.rig)', time: 0.8, ctl: true },
  block: { weapon: 'pipe', run: "window.__input.held.add('guard')", time: 0.5, ctl: true },
};
for (const name of (process.argv[2] || 'melee').split(',')) {
  const a = actions[name]; if (!a) { console.log('unknown', name); continue; }
  const files = [];
  await page.evaluate(([w, ang]) => {
    const g = window.__game, p = g.player; g.engine.paused = true;
    p.equip(w); p.state = 'normal'; p.fireCd = 0; p.invulnerable = 0;
    for (let i = 0; i < 20; i++) p.update(1 / 30, g.rig, false);
    g.debugCloseUp(+ang, -0.55, 2.2);
  }, [a.weapon, process.env.ANG || 250]);
  await page.evaluate((code) => { const g = window.__game, p = g.player; (0, eval)('(p)=>{' + code + '}')(p); }, a.run);
  const per = Math.max(1, Math.round(a.time / STEP / (FR - 1)));
  let t = 0;
  for (let i = 0; i < FR; i++) {
    const state = await page.evaluate(([n, again, t, queue, ctl]) => {
      const g = window.__game, p = g.player;
      for (let k = 0; k < n; k++) {
        const tt = t + (k + 1) / 15;
        if (queue.some((q) => Math.abs(tt - q) < 1 / 30)) p.meleeQueued = true;
        p.update(1 / 15, g.rig, ctl); if (again && Math.abs(tt - again) < 1 / 30) { p.fireCd = 0; p.startMelee(); }
      }
      g.rig.update(0.016, p.pos, 0, false); g.engine.render(0.016);
      return p.state + (p.state === 'melee' ? (p.meleeLight ? ' L' : ' H') : '');
    }, [i === 0 ? 0 : per, a.again || 0, t, a.queue || [], !!a.ctl]);
    t += i === 0 ? 0 : per * STEP;
    const f = `${OUT}/_f${i}.png`; await page.screenshot({ path: f }); files.push(f + '|' + t.toFixed(2) + 's ' + state);
  }
  fs.writeFileSync(`${OUT}/_list.txt`, files.join('\n'));
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
rows = [l.split('|') for l in open(sys.argv[1]).read().split('\\n') if l]
ims = [Image.open(f).convert('RGB') for f, _ in rows]
w, h = ims[0].size; s = float(sys.argv[4]); W, H = int(w*s), int(h*s)
sheet = Image.new('RGB', (W*len(ims), H+18), (0,0,0)); d = ImageDraw.Draw(sheet)
for i, (im, (_, lab)) in enumerate(zip(ims, rows)):
    sheet.paste(im.resize((W, H)), (i*W, 18)); d.text((i*W+4, 3), lab, fill=(255,255,255))
d.text((4, H+2), sys.argv[2], fill=(255,200,0)); sheet.save(sys.argv[3])
`, `${OUT}/_list.txt`, name, `${OUT}/anim-${name}.png`, SC]);
  console.log('strip', name);
  await page.evaluate(() => { window.__game.engine.paused = false; });
}
for (const f of fs.readdirSync(OUT)) if (/^_f\d+\.png$|^_list\.txt$/.test(f)) fs.unlinkSync(path.join(OUT, f));
await b.close(); srv.close();
