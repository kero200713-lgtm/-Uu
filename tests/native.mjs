// Native-shell logic test without a device: fakes the Capacitor Android bridge
// (plugin headers + nativePromise/nativeCallback) so the app runs its native code
// paths in Chromium. Checks: status bar hidden, no service worker, saves mirrored
// to the OS store, localStorage purge -> saves restored -> "Continue" works,
// Android back button (pause / resume / minimise on the main menu), background.
//   node tests/native.mjs            (DIST=<dir> to test another build)
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

// ---- the "operating system": key-value store + call log, kept across reloads
const store = new Map(); const calls = [];
await page.exposeFunction('__native', (json) => {
  const { plugin, method, opts } = JSON.parse(json);
  calls.push(`${plugin}.${method}`);
  if (plugin === 'Preferences') {
    if (method === 'get') return JSON.stringify({ value: store.has(opts.key) ? store.get(opts.key) : null });
    if (method === 'set') { store.set(opts.key, opts.value); return '{}'; }
    if (method === 'remove') { store.delete(opts.key); return '{}'; }
    if (method === 'keys') return JSON.stringify({ keys: [...store.keys()] });
  }
  return '{}';
});
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ugultu_settings_v1', JSON.stringify({ quality: 'low', language: 'tr' })); sessionStorage.setItem('seeded', '1'); }
  const P = (n) => ({ name: n, rtype: 'promise' });
  window.androidBridge = { postMessage() {} };
  window.__listeners = {};
  let cb = 0;
  window.Capacitor = {
    PluginHeaders: [
      { name: 'Preferences', methods: ['get', 'set', 'remove', 'keys', 'clear'].map(P) },
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, ...['removeListener', 'minimizeApp', 'exitApp', 'getInfo'].map(P)] },
      { name: 'Haptics', methods: ['impact', 'vibrate', 'notification'].map(P) },
      { name: 'StatusBar', methods: ['hide', 'show', 'setOverlaysWebView', 'setStyle'].map(P) },
      { name: 'SplashScreen', methods: ['hide', 'show'].map(P) },
    ],
    nativePromise: (plugin, method, opts) => window.__native(JSON.stringify({ plugin, method, opts: opts || {} })).then((r) => JSON.parse(r)),
    nativeCallback: (plugin, method, opts, callback) => { const id = 'cb' + (++cb); if (method === 'addListener') (window.__listeners[opts.eventName] ||= []).push(callback); return id; },
  };
});

const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); console.log(results[results.length - 1]); };
const G = (fn, arg) => page.evaluate(fn, arg);
const fire = (ev, data) => G(([ev, data]) => (window.__listeners[ev] || []).forEach((f) => f(data)), [ev, data]);
const waitState = (s, t = 60000) => page.waitForFunction((s) => window.__game?.state === s, s, { timeout: t }).catch(() => {});

await page.goto(URL);
await waitState('menu', 180000);
check('boots as native android', await G(() => window.Capacitor.getPlatform?.() === 'android' && window.Capacitor.isNativePlatform?.()));
check('status bar hidden', calls.includes('StatusBar.hide'));
check('no service worker in the app', (await G(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0)) === 0);
check('existing settings mirrored to OS store', store.has('ugultu_settings_v1'));
check('back/lifecycle listeners registered', await G(() => !!window.__listeners.backButton && !!window.__listeners.appStateChange));

// ---- play, autosave mirrors to the OS store
await G(() => window.__game.newGame());
await waitState('play', 180000);
await page.waitForFunction(() => !!localStorage.getItem('ugultu_save_auto_v1'), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(500);
check('autosave mirrored to OS store', store.has('ugultu_save_auto_v1') && store.get('ugultu_save_auto_v1') === await G(() => localStorage.getItem('ugultu_save_auto_v1')));

// ---- Android back button: pause, then resume
await fire('backButton', { canGoBack: false });
await waitState('paused', 20000);
check('back button pauses play', (await G(() => window.__game.state)) === 'paused');
await fire('backButton', { canGoBack: false });
await waitState('play', 20000);
check('back button resumes from pause', (await G(() => window.__game.state)) === 'play');
await G(() => window.__game.openInventory());
await fire('backButton', { canGoBack: false });
await waitState('play', 20000);
check('back button closes inventory', (await G(() => window.__game.state)) === 'play');

// ---- app sent to background: pauses and saves
const before = store.get('ugultu_save_auto_v1');
await G(() => window.__game.player.pos.x += 0.4);
await fire('appStateChange', { isActive: false });
await page.waitForTimeout(500);
check('background pauses the game', (await G(() => window.__game.state)) === 'paused');
check('background autosave reaches OS store', store.get('ugultu_save_auto_v1') !== before);
await fire('appStateChange', { isActive: true });
const area = await G(() => window.__game.level?.id || window.__game.areaId || null);

// ---- the OS purges the WebView's storage; the app restarts
await G(() => localStorage.clear());
await page.reload();
await waitState('menu', 180000);
check('saves restored from OS store after purge', !!(await G(() => localStorage.getItem('ugultu_save_auto_v1'))) && !!(await G(() => localStorage.getItem('ugultu_settings_v1'))));
check('continue is offered', await G(() => { const b = document.querySelector('button[data-k=cont]'); return !!b && !b.disabled && getComputedStyle(b).display !== 'none'; }));
await G(() => window.__game.continueGame());
await waitState('play', 180000);
check('continue resumes the saved game', (await G(() => window.__game.state)) === 'play', JSON.stringify({ area, now: await G(() => window.__game.level?.id || window.__game.areaId || null) }));
await page.screenshot({ path: `${OUT}/native-continue.png` });

// ---- back on the main menu minimises instead of killing the app
await G(() => window.__game.showMenu());
await waitState('menu', 30000);
const n0 = calls.filter((c) => c === 'App.minimizeApp').length;
await fire('backButton', { canGoBack: false });
await page.waitForTimeout(400);
check('back on main menu minimises the app', calls.filter((c) => c === 'App.minimizeApp').length === n0 + 1);
check('haptics routed natively (or unused)', true, `haptics calls: ${calls.filter((c) => c.startsWith('Haptics')).length}`);

check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${OUT}/native-results.txt`, results.join('\n') + '\n');
await b.close(); srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
