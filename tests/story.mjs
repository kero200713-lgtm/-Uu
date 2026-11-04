// End-to-end progression test: walks the critical path through all six areas
// using the real interaction system (teleporting between interaction points).
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 440 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/sw\.js|404/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'low', language: 'tr' })));
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };
const G = (fn, arg) => page.evaluate(fn, arg);
const waitPlay = () => page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
/** find an interactable by id/kind/item/doc/target, stand ~1 m from it facing it, and use it. */
async function use(match, waitAfter = 900) {
  const f = await G((m) => {
    const g = window.__game;
    g.enemies.list.forEach((e) => { if (e.state !== 'dead' && e.state !== 'dormant') { e.set('idle'); e.alert = 0; e.hasLastKnown = false; } });
    const it = g.level.interactables.find((i) => i.active && (i.id === m || i.id.includes(m) || (i.def && (i.def.item === m || i.def.doc === m || i.def.to === m))));
    if (!it) return 'not found';
    for (const rr of [1.05, 1.4]) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const p = it.pos.clone(); p.x += dx * rr; p.z += dz * rr; p.y = 0;
      const [cx, cy] = g.level.grid.cellOf(p.x, p.z);
      if (!g.level.grid.walkable(cx, cy)) continue;
      const q = p.clone(); g.level.grid.collide(q, 0.3); if (q.distanceTo(p) > 0.05) continue;
      const yaw = Math.atan2(-(it.pos.x - p.x), -(it.pos.z - p.z));
      g.player.spawn(p, yaw); g.rig.yaw = yaw;
      g.interact(it);
      return it.id + '/' + it.kind;
    }
    return 'no spot';
  }, match);
  await page.waitForTimeout(waitAfter);
  if (!/\//.test(String(f))) console.log('  use(' + match + ') ->', f);
  return f;
}
const pick = async (item) => { const f = await use(item); const ok = await G((i) => window.__game.player.inv.keys.includes(i) || window.__game.player.inv.weapons.includes(i) || window.__game.player.inv.count(i) > 0, item); check(`pick ${item}`, ok, String(f)); };

await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
await G(() => window.__game.newGame());
await waitPlay();
await G(() => { const g = window.__game; g.debugGive('pistol'); g.debugGive('ammo_9mm', 30); g.player.invulnerable = 9999; });

// ---------------- town
await G(() => window.__game.loadArea('town', 'from_forest')); await waitPlay();
await pick('boltcutter');
await use('clinic', 400);
await page.waitForFunction(() => window.__game.areaId === 'clinic' && window.__game.state === 'play', null, { timeout: 120000 }).catch(() => {});
check('town → clinic via bolt cutters', await G(() => window.__game.areaId === 'clinic'));
// ---------------- clinic
await G(() => window.__game.player.invulnerable = 9999);
await use('mine', 400);
check('clinic back door locked without power', await G(() => window.__game.areaId === 'clinic'));
await pick('fuse');
await use('fusebox', 1500);
check('fusebox restores power', await G(() => window.__game.flags.has('clinic_power')));
await page.screenshot({ path: `${OUT}/story-clinic-power.png` });
await use('mine', 400);
await page.waitForFunction(() => window.__game.areaId === 'mine' && window.__game.state === 'play', null, { timeout: 120000 }).catch(() => {});
check('clinic → mine', await G(() => window.__game.areaId === 'mine'));
// ---------------- mine
await G(() => window.__game.player.invulnerable = 9999);
await pick('fuel');
await use('generator', 4000);
check('generator started', await G(() => window.__game.flags.has('generator_on')));
await page.screenshot({ path: `${OUT}/story-mine-generator.png` });
await use('facility', 400);
await page.waitForFunction(() => window.__game.areaId === 'facility' && window.__game.state === 'play', null, { timeout: 120000 }).catch(() => {});
check('mine → facility (lift)', await G(() => window.__game.areaId === 'facility'));
// ---------------- facility
await G(() => { const g = window.__game; g.player.invulnerable = 9999; g.player.inv.add('card_meridyen'); });
await use('keypad', 800);
check('keypad opened', await G(() => !!document.querySelector('.keypad')));
for (const k of ['1', '7', '0', '4', 'OK']) { await page.locator(`.kp[data-k="${k}"]`).click(); await page.waitForTimeout(120); }
await page.waitForTimeout(1200);
check('keypad code 1704 unlocks lab', await G(() => window.__game.flags.has('unlock:fac_kemal')));
await use('fac_kemal', 1500);
await pick('tape_inverse');
check('has_tape flag', await G(() => window.__game.flags.has('has_tape')));
await use('choir', 400);
await page.waitForFunction(() => window.__game.areaId === 'choir' && window.__game.state !== 'loading', null, { timeout: 120000 }).catch(() => {});
check('facility → choir (shaft)', await G(() => window.__game.areaId === 'choir'));
// ---------------- choir
await G(() => { const g = window.__game; g.player.invulnerable = 9999; g.debugTeleport(16, 27, 0); });
await page.waitForFunction(() => !!window.__game.choir, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(6000);
check('boss encounter started', await G(() => !!window.__game.choir && !!window.__game.bossHook));
await page.screenshot({ path: `${OUT}/story-choir-boss.png` });
const res = [[7.5, 15.0, 0], [25, 15.0, 0], [16.5, 22.8, 0]];
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 90000 }).catch(() => {});
  await use('res' + (i + 1), 200);
  await G(() => { window.__game.player.invulnerable = 9999; });
  await page.waitForFunction((k) => window.__game.flags.has('res_off:res' + k), i + 1, { timeout: 90000 }).catch(() => {});
}
check('3 resonators shut down', await G(() => ['res1', 'res2', 'res3'].every((r) => window.__game.flags.has('res_off:' + r))));
await page.screenshot({ path: `${OUT}/story-choir-res.png` });
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 90000 }).catch(() => {});
await use('console', 200);
await page.waitForFunction(() => window.__game.flags.has('choir_done') && !!window.__game.collapse && window.__game.state === 'play', null, { timeout: 180000 }).catch(() => {});
check('choir destroyed + escape started', await G(() => window.__game.flags.has('choir_done') && !!window.__game.collapse));
await page.screenshot({ path: `${OUT}/story-choir-escape.png` });
await use('facility', 400);
await page.waitForFunction(() => window.__game.state === 'ending', null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(8000);
check('ending sequence', await G(() => window.__game.state === 'ending' || window.__game.ending));
await page.screenshot({ path: `${OUT}/story-ending.png` });
await page.waitForFunction(() => !!document.querySelector('.credits.ending'), null, { timeout: 120000 }).catch(() => {});
check('credits shown', await G(() => !!document.querySelector('.credits.ending')));
await page.screenshot({ path: `${OUT}/story-credits.png` });

console.log('page errors:', errors.length, errors.slice(0, 8));
fs.writeFileSync(`${OUT}/story-results.txt`, results.join('\n') + '\n' + errors.join('\n'));
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
