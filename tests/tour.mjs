// Whole-game tour: every area is walked through (BFS over the nav grid with all
// doors open, a stop every few metres, the camera looking along the route) with
// the weapons in hand. Reports per area:
//   - shader programs compiled after loading (each one is a hitch on a phone)
//   - textures / geometries first uploaded after loading (upload hitches)
//   - draw calls and triangles (max over the route)
//   - JS time of the game update per frame and the JS heap allocation rate
//   - enemies seen in a T-pose (arms horizontal with no animation playing)
//   - doors that still block their opening once open
//   node tests/tour.mjs [areas]   (Q=quality, STEP=tiles between stops, SHOTS=1 screenshots)
import { chromium } from './pw.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(process.env.DIST || 'dist'); const OUT = path.resolve('tests/out'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await b.newPage({ viewport: { width: 640, height: 400 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: q, language: 'tr', dynamicResolution: false })), process.env.Q || 'medium');
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 180000 });
await page.evaluate(() => window.__game.newGame());
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__game; window.__frames = 0;
  g.engine.onUpdate(() => { window.__frames++; });
  // time the game's own update (first updater) per frame
  const ups = g.engine.updaters; const f0 = ups[0]; window.__upd = [];
  ups[0] = (dt, t) => { const s = performance.now(); f0(dt, t); window.__upd.push(performance.now() - s); };
});
const AREAS = { forest: 'start', town: 'from_forest', clinic: 'from_town', mine: 'from_clinic', facility: 'from_mine', choir: 'from_facility' };
const pick = (process.argv[2] || Object.keys(AREAS).join(',')).split(',');
const STEP = +(process.env.STEP || 3);
const report = [];
const frames = (n) => page.evaluate((n) => new Promise((res) => { const f0 = window.__frames; const iv = setInterval(() => { if (window.__frames >= f0 + n) { clearInterval(iv); res(); } }, 20); }), n);

for (const area of pick) {
  await page.evaluate(([a, s]) => window.__game.loadArea(a, s), [area, AREAS[area]]);
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 180000 });
  await frames(3);
  const stops = await page.evaluate((STEP) => {
    const g = window.__game, p = g.player, L = g.level, G = L.grid;
    for (const id of ['pistol', 'shotgun', 'pipe']) g.debugGive(id);
    p.equip('shotgun');
    for (const d of L.doors) { d.locked = false; L.openDoor(d, p.pos.clone().add({ x: 0.3, y: 0, z: 0.3 })); }
    const T = L.T, sx = Math.floor(p.pos.x / T), sy = Math.floor(p.pos.z / T);
    const seen = new Uint8Array(G.w * G.h), q = [[sx, sy]]; seen[sy * G.w + sx] = 1; const order = [];
    while (q.length) { const [x, y] = q.shift(); order.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!G.inside(nx, ny) || seen[ny * G.w + nx] || !G.walkable(nx, ny)) continue; seen[ny * G.w + nx] = 1; q.push([nx, ny]); } }
    const chosen = [];
    for (const c of order) if (chosen.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) >= STEP)) chosen.push(c);
    // nearest-neighbour route from the spawn
    const route = [chosen.shift()]; const left = chosen.slice();
    while (left.length) { const l = route[route.length - 1]; let bi = 0, bd = 1e9; left.forEach((c, i) => { const d = Math.hypot(c[0] - l[0], c[1] - l[1]); if (d < bd) { bd = d; bi = i; } }); route.push(left.splice(bi, 1)[0]); }
    window.__base = (() => { const r = g.engine.renderer; return { progs: r.info.programs.length, tex: r.info.memory.textures, geo: r.info.memory.geometries }; })();
    window.__upd.length = 0;
    return route;
  }, STEP);
  const st = { area, stops: stops.length, maxCalls: 0, maxTris: 0, newProgs: [], newTex: 0, newGeo: 0, tpose: new Map(), alloc: 0, gcs: 0, t: 0 };
  let heap0 = null, tStart = Date.now();
  for (let i = 0; i < stops.length; i++) {
    const [x, y] = stops[i], nx = stops[Math.min(i + 1, stops.length - 1)];
    const yaw = i + 1 < stops.length ? Math.atan2(-(nx[0] - x), -(nx[1] - y)) * 180 / Math.PI : 0;
    const r = await page.evaluate(([x, y, yaw]) => {
      const g = window.__game, p = g.player; if (g.state !== 'play') return { skip: g.state };
      p.invulnerable = 999; p.hp = 100;
      g.debugTeleport(x + 0.5, y + 0.5, yaw, -0.08);
      return { ok: 1 };
    }, [x, y, yaw]);
    if (r.skip) { st.aborted = r.skip; break; }
    await frames(3);
    const s = await page.evaluate(() => {
      const g = window.__game, r = g.engine.renderer, V = g.player.pos.constructor;
      const out = { calls: r.info.render.calls, tris: r.info.render.triangles, progs: r.info.programs.length, tex: r.info.memory.textures, geo: r.info.memory.geometries, heap: performance.memory?.usedJSHeapSize || 0, area: g.areaId, tpose: [] };
      for (const e of g.enemies.list) {
        if (!e.root.visible || e.state === 'dead' || !e.ready) continue;
        const ua = e.anim.bone('upperarm_l'), la = e.anim.bone('lowerarm_l'); if (!ua || !la) continue;
        e.root.updateMatrixWorld(true);
        const d = la.getWorldPosition(new V()).sub(ua.getWorldPosition(new V())).normalize();
        const running = e.anim.mixer._actions.filter((a) => a.enabled && a.getEffectiveWeight() > 0.01).length;
        if (Math.abs(d.y) < 0.25 || running === 0) out.tpose.push(`${e.id}:${e.state}:${e.anim.lower.name}/${e.anim.upper.name}:w${running}:armY${d.y.toFixed(2)}`);
      }
      return out;
    });
    if (s.area !== area) { st.aborted = 'left to ' + s.area; break; }
    st.maxCalls = Math.max(st.maxCalls, s.calls); st.maxTris = Math.max(st.maxTris, s.tris);
    const base = await page.evaluate(() => window.__base);
    if (s.progs > base.progs) { st.newProgs.push(`stop ${i} (${x},${y}): +${s.progs - base.progs}`); await page.evaluate((n) => { window.__base.progs = n; }, s.progs); }
    st.newTex = Math.max(st.newTex, s.tex - base.tex); st.newGeo = Math.max(st.newGeo, s.geo - base.geo);
    if (heap0 !== null) { if (s.heap >= heap0) st.alloc += s.heap - heap0; else st.gcs++; }
    heap0 = s.heap;
    for (const t of s.tpose) st.tpose.set(t.split(':')[0], t);
    if (process.env.SHOTS && i % 4 === 0) await page.screenshot({ path: `${OUT}/tour-${area}-${String(i).padStart(2, '0')}.png` });
  }
  st.t = (Date.now() - tStart) / 1000;
  const upd = await page.evaluate(() => { const a = window.__upd.slice().sort((x, y) => x - y); const n = a.length; return { n, avg: +(a.reduce((s, v) => s + v, 0) / (n || 1)).toFixed(2), p95: +(a[Math.floor(n * 0.95)] || 0).toFixed(2), max: +(a[n - 1] || 0).toFixed(2) }; });
  // doors: once open, the panel must clear the middle of the opening
  const doors = await page.evaluate(() => {
    const g = window.__game, L = g.level, T = L.T, B = g.player.pos.constructor; const bad = [];
    for (const d of L.doors) {
      if (!d.open) continue; d.angle = d.target; d.update(0); d.pivot.updateMatrixWorld(true);
      const panel = d.pivot.children[0]; if (!panel) continue;
      const box = new (window.__THREE.Box3)().setFromObject(panel);
      const c = new B((d.cell[0] + 0.5) * T, 1, (d.cell[1] + 0.5) * T);
      const probe = new (window.__THREE.Box3)(c.clone().add(new B(-0.22, -0.5, -0.22)), c.clone().add(new B(0.22, 0.5, 0.22)));
      if (box.intersectsBox(probe)) bad.push(`${d.id} cell ${d.cell} axisX=${d.axisX} angle=${d.angle.toFixed(2)}`);
    }
    return { n: L.doors.length, bad };
  });
  report.push({ ...st, tpose: [...st.tpose.values()], allocMBperMin: +(st.alloc / 1048576 / (st.t / 60)).toFixed(1), upd, doors });
  console.log(JSON.stringify(report[report.length - 1]));
}
fs.writeFileSync(`${OUT}/tour.json`, JSON.stringify(report, null, 1));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close(); srv.close();
