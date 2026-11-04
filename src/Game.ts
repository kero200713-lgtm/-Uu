import * as THREE from 'three';
import { Engine } from './core/Engine';
import { input } from './core/Input';
import { settings } from './core/Settings';
import { bus } from './core/Events';
import { assets } from './core/Assets';
import { t, L } from './core/i18n';
import type { World } from './core/World';
import { Level, Interactable } from './world/Level';
import { LightPool } from './world/Lights';
import { Atmosphere } from './world/Atmosphere';
import { shared } from './world/Materials';
import { BLOCK_SIGHT } from './world/Grid';
import { Player } from './player/Player';
import { CameraRig } from './player/CameraRig';
import { preloadHumans } from './player/CharacterFactory';
import { EnemyManager } from './enemies/Types';
import { FX } from './combat/FX';
import { noise } from './combat/Noise';
import { fireWeapon, meleeSwing, aimAssist, CombatCtx } from './combat/Combat';
import { audio, Voice } from './audio/AudioEngine';
import { HUD } from './ui/HUD';
import { TouchControls } from './ui/TouchControls';
import { Screens, mainMenu, pauseMenu, settingsPanel, creditsPanel, deathScreen, dialog, loadingScreen, documentView, filesList } from './ui/Screens';
import { InventoryUI } from './ui/InventoryUI';
import { ITEMS } from './items/ItemDefs';
import { Save, SaveData } from './save/Save';
import { AREAS } from './areas';
import { SCRIPTS, onAreaEnter, runEnding } from './story/Scripts';
import type { ChoirBoss } from './enemies/Choir';
import { OBJECTIVES } from './story/Objectives';
import type { AreaDef, ExitDef, DoorDef, InteractDef } from './world/types';

type GState = 'boot' | 'menu' | 'loading' | 'play' | 'paused' | 'inventory' | 'doc' | 'dialog' | 'dead' | 'cutscene' | 'ending';

export class Game implements World {
  engine: Engine;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  rig: CameraRig;
  player!: Player;
  level!: Level;
  enemies!: EnemyManager;
  fx: FX;
  atmo: Atmosphere;
  pool!: LightPool;
  hemi = new THREE.HemisphereLight(0x223040, 0x0a0806, 0.3);
  moon = new THREE.DirectionalLight(0x8fa6c8, 0);
  hud: HUD; touch: TouchControls; screens: Screens; invUI!: InventoryUI;
  state: GState = 'boot';
  flags = new Set<string>(); killed = new Set<string>(); docsRead: string[] = [];
  objective = 'obj_reach_town'; objectiveArg = '';
  areaId = ''; playtime = 0; time = 0;
  camPos = new THREE.Vector3();
  q: any;
  focus: Interactable | null = null;
  private ambVoices: Voice[] = [];
  private ambT = 10;
  private chaseHold = 0;
  private musicWanted: string | null = null;
  private hold: { it: Interactable; t: number; dur: number } | null = null;
  private triggered = new Set<string>();
  cine: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; done?: () => void } | null = null;
  private suspendT = 0;
  private autoT = 0;
  private menuBg = false;
  private spotted = new Set<string>();
  bossHook: ((dt: number) => void) | null = null;
  ending = false;
  choir: ChoirBoss | null = null;
  collapse: { t: number; rockT: number } | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new Engine(canvas);
    this.scene = this.engine.scene;
    this.cam = this.engine.camera;
    this.q = this.engine.q;
    this.rig = new CameraRig(this.cam);
    this.fx = new FX(this.scene);
    this.atmo = new Atmosphere(this.scene);
    this.scene.add(this.hemi, this.moon, this.moon.target);
    this.hud = new HUD(uiRoot);
    this.touch = new TouchControls(uiRoot);
    this.screens = new Screens(uiRoot);
    input.attachKeyboardMouse(canvas);
    (window as any).__game = this;
  }

  // -------------------------------------------------------------- boot ---
  async boot(progress: (p: number, msg: string) => void) {
    assets.onProgress = (p) => progress(p * 0.9, '');
    audio.occluder = (a, b) => !!this.level && !this.level.grid.lineOfSight(a, b, false);
    await Promise.all([preloadHumans(), assets.loadPack('items'), audio.init().catch(() => {})]);
    this.pool = new LightPool(this.scene, this.engine.q.lights);
    this.player = new Player(this.engine.q);
    await this.player.init(this.scene);
    this.player.onFire = (w, m) => fireWeapon(this.combatCtx(), w, m);
    this.player.onMelee = (w) => meleeSwing(this.combatCtx(), w, this.player.yaw);
    this.player.onFlare = () => {
      const f = this.rig.forward(new THREE.Vector3()); f.y = Math.max(f.y, 0.1);
      this.fx.throwFlare(this.player.pos.clone().setY(1.5), f.normalize());
      audio.play('flare', { pos: this.player.pos.clone().setY(1.2), volume: 0.9 });
    };
    this.invUI = new InventoryUI(document.getElementById('ui')!, this.player.inv, {
      use: (id) => this.useItem(id), equip: (id) => { this.player.equip(id); this.invUI.refresh(); },
      discard: (id) => { this.player.inv.remove(id, this.player.inv.count(id)); }, close: () => this.closeInventory(), hp: () => [this.player.hp, this.player.maxHp],
    });
    this.atmo.onThunder = (d) => audio.play('thunder', { volume: 0.9, delay: d, vary: 0.15 });
    this.wireEvents();
    progress(1, '');
    this.engine.onUpdate((dt) => this.update(dt));
    this.engine.start();
    await this.showMenu(true);
  }

  private wireEvents() {
    bus.on('player:dead', () => {
      setTimeout(() => {
        if (!this.player.dead) return;
        this.state = 'dead';
        this.touch.show(false);
        this.screens.show('death', deathScreen(() => this.continueGame(), () => this.showMenu()));
      }, 2600);
    });
    bus.on('hp', (hp: number, kind: string, amt: number) => {
      if (kind === 'hit') { this.engine.fx.damage = Math.min(1, this.engine.fx.damage + amt / 40); this.rig.shake(0.25); }
    });
    bus.on('grab', (on: boolean, knife: boolean) => this.hud.struggle(on, 1, knife));
    bus.on('struggle', (v: number) => this.hud.struggle(true, v));
    bus.on('input:pause', () => { if (this.state === 'play') this.pause(); else if (this.state === 'paused') this.resume(); });
    bus.on('input:inventory', () => { if (this.state === 'play') this.openInventory(); else if (this.state === 'inventory') this.closeInventory(); });
    bus.on('touch:fire', () => {
      // quick shot: raise the weapon and snap toward a nearby target
      if (this.state === 'play' && this.player.firearm && !input.aimToggled) { input.aimToggled = true; aimAssist(this.combatCtx(), 0.016, true); }
    });
    bus.on('language', () => { if (this.state === 'menu') this.showMenu(); else this.openSettings('language'); this.hud.objective(this.objectiveText(), false); });
    bus.on('quality', (q) => { this.q = q; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'play') { this.pause(); }
        if (this.canAutosave()) this.autosave(true);
        audio.suspend(true);
      } else audio.suspend(false);
    });
    window.addEventListener('pagehide', () => { if (this.canAutosave()) this.autosave(true); });
  }

  combatCtx(): CombatCtx {
    return { level: this.level, enemies: this.enemies.list, fx: this.fx, rig: this.rig, cam: this.cam, playerPos: this.player.pos, spread: this.player.spread + (this.player.moveAmount > 0.3 ? 0.012 : 0) };
  }

  // -------------------------------------------------------------- menus --
  async showMenu(first = false) {
    this.state = 'menu';
    this.touch.show(false); this.hud.show(false); this.invUI.show(false);
    input.reset();
    this.engine.paused = false;
    if (!this.menuBg || this.areaId !== 'forest') {
      await this.loadArea('forest', 'menu', null, true);
      this.menuBg = true;
    }
    this.player.root.visible = false;
    this.state = 'menu';
    this.hud.fade(0);
    audio.playMusic('mus_menu', 3);
    this.screens.show('menu', mainMenu({
      hasSave: !!Save.latest(),
      onContinue: () => { audio.unlock(); this.continueGame(); },
      onNew: () => {
        audio.unlock();
        if (Save.latest()) this.screens.show('dialog', dialog(t('newGameQ'), () => this.newGame(), () => this.showMenu()));
        else this.newGame();
      },
      onSettings: () => this.openSettings(),
      onCredits: () => this.screens.show('credits', creditsPanel(() => this.showMenu())),
    }));
  }

  openSettings(tab = 'graphics') {
    const back = this.state === 'menu' ? () => this.showMenu() : () => this.pause();
    this.screens.show('settings', settingsPanel(back, tab));
  }

  async newGame() {
    Save.clear();
    this.flags.clear(); this.killed.clear(); this.docsRead = []; this.triggered.clear(); this.spotted.clear();
    this.player.inv.load({ slots: [{ id: 'flare', count: 1 }], capacity: 8, keys: [], weapons: [], mags: {}, equipped: '', battery: 0.85 });
    this.player.revive(); this.player.hp = 100;
    this.setObjective('obj_reach_town', false);
    this.playtime = 0; this.ending = false;
    await this.loadArea('forest', 'start');
  }

  async continueGame() {
    const s = Save.latest();
    if (!s) { this.newGame(); return; }
    await this.loadSave(s);
  }

  async loadSave(s: SaveData) {
    this.flags = new Set(s.flags); this.killed = new Set(s.killed); this.docsRead = [...s.docs];
    this.triggered = new Set(s.flags.filter((f) => f.startsWith('trig:')).map((f) => f.slice(5)));
    this.player.inv.load(s.inv);
    this.player.revive(); this.player.hp = s.hp;
    this.objective = s.objective; this.playtime = s.playtime; this.ending = false;
    const pos = s.pos ? new THREE.Vector3(s.pos[0], 0, s.pos[1]) : null;
    await this.loadArea(s.area, s.spawn || 'start', pos ? { pos, yaw: s.yaw } : null);
  }

  // ---------------------------------------------------------- areas ---
  async loadArea(id: string, spawn: string, at: { pos: THREE.Vector3; yaw: number } | null = null, menu = false) {
    const def: AreaDef = AREAS[id];
    if (!def) throw new Error('unknown area ' + id);
    this.state = 'loading';
    this.touch.show(false); this.hud.show(false);
    input.reset();
    const tips = settings.data.language === 'tr'
      ? ['Koşmak gürültü yapar. Onlar duyar.', 'Fener açıkken seni daha uzaktan görürler.', 'Her yaratığı öldürmek zorunda değilsin.', 'Telsizler ilerlemeni kaydeder.', 'Çakı, yakalandığında hayatını kurtarır.', 'Eğilerek yürümek neredeyse sessizdir.']
      : ['Running is loud. They can hear it.', 'With the flashlight on, they see you from further away.', "You don't have to kill everything.", 'Radios save your progress.', 'A pocket knife saves your life when grabbed.', 'Crouch-walking is almost silent.'];
    if (!menu) {
      const ls = loadingScreen(L(def.name), L(def.subtitle || { tr: '', en: '' }), tips[Math.floor(Math.random() * tips.length)]);
      this.screens.show('loading', ls);
      const bar = ls.querySelector('.bar i') as HTMLElement;
      assets.resetProgress();
      assets.onProgress = (p) => { bar.style.transform = `scaleX(${p})`; };
    }
    this.hud.fade(1);
    this.hud.clearTransient();
    await new Promise((r) => setTimeout(r, 30));
    // tear down
    audio.stopAll();
    for (const v of this.ambVoices) v.stop(0.5); this.ambVoices = [];
    audio.proc?.stopAllBeds(0.8);
    if (this.enemies) this.enemies.clear();
    if (this.level) this.level.dispose();
    this.pool.clear();
    noise.clear();
    this.bossHook = null; this.cine = null; this.hold = null; this.collapse = null;
    if (this.choir) { this.choir.dispose(); this.choir = null; }
    this.rig.cinematic = null;
    this.fx.flare = null; this.fx.flareLight.intensity = 0;
    // build
    const lvl = new Level(def);
    await lvl.build(this.engine.q, this.pool, this.flags);
    this.level = lvl;
    this.scene.add(lvl.root);
    this.areaId = id;
    this.player.setLevel(lvl);
    this.enemies = new EnemyManager(this.scene, this);
    if (!menu) await this.enemies.spawnAll(lvl.enemies, this.killed, this.flags);
    // environment
    const env = def.env;
    const fogC = new THREE.Color(env.fog);
    this.scene.fog = new THREE.FogExp2(fogC.getHex(), env.fogDensity);
    this.scene.background = new THREE.Color(env.sky ?? env.fog);
    this.hemi.color.setHex(env.hemiSky); this.hemi.groundColor.setHex(env.hemiGround); this.hemi.intensity = env.hemiIntensity;
    if (env.moon) { this.moon.color.setHex(env.moon.color); this.moon.intensity = env.moon.intensity; this.moon.position.set(-env.moon.dir[0] * 30, -env.moon.dir[1] * 30, -env.moon.dir[2] * 30); }
    else this.moon.intensity = 0;
    const g = this.engine.grade;
    g.exposure = env.exposure ?? 1; g.sat = env.sat ?? 0.82;
    if (env.tint) g.gain.setRGB(env.tint[0], env.tint[1], env.tint[2]); else g.gain.setRGB(0.98, 1, 1.02);
    const q = this.engine.q;
    this.atmo.build({ dust: Math.round(q.dust * (env.dust ?? 1)), rain: env.rain ? Math.round(q.rain * env.rain) : 0, wisps: env.outdoor ? (q.level === 'low' ? 6 : 14) : 0, outdoor: env.outdoor });
    this.rig.grid = lvl.grid;
    this.rig.ceiling = def.ceiling ?? 3;
    // player placement
    const sp0 = lvl.spawnPos(spawn);
    const sp = at || { pos: sp0.pos, yaw: sp0.dir };
    this.player.spawn(sp.pos, sp.yaw);
    this.player.root.visible = !menu;
    this.rig.yaw = sp.yaw; this.rig.pitch = -0.1; this.rig.dist = 2.4;
    if (menu) {
      const s = lvl.spawns.get('menu');
      const p = s ? lvl.w(s.at[0], s.at[1], 1.7) : sp.pos.clone().setY(1.7);
      this.cam.position.copy(p);
    }
    // release GPU memory of textures this area doesn't use (mobile memory budget)
    assets.trimGPU(this.scene, [this.invUI.scene]);
    // warm shaders to avoid hitches
    this.rig.update(0.016, this.player.pos, 0, false);
    try { await (this.engine.renderer as any).compileAsync?.(this.scene, this.cam); } catch { this.engine.renderer.compile(this.scene, this.cam); }
    this.startAmbience(env);
    this.musicWanted = env.music ?? null;
    if (!menu) {
      audio.playMusic(this.musicWanted, 3);
      this.screens.hide();
      this.state = 'play';
      this.touch.show(this.isTouch());
      this.hud.show(true);
      this.hud.areaTitle(L(def.name), L(def.subtitle || { tr: '', en: '' }));
      this.fadeIn(1.2);
      onAreaEnter(this, id);
      if (def.onEnter && SCRIPTS[def.onEnter]) SCRIPTS[def.onEnter](this);
      if (!at) this.autosave();
    }
  }

  isTouch() { return input.touchActive || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; }

  /** Switches a named area light and remembers it across saves. */
  setLight(id: string, on: boolean) {
    const a = this.pool.byId(id);
    if (a) a.on = on;
    this.flags.delete(on ? 'off:' + id : 'on:' + id);
    this.flags.add(on ? 'on:' + id : 'off:' + id);
  }

  /** Activates a dormant enemy (boss waves, scripted ambushes). */
  wakeEnemy(id: string) {
    const e = this.enemies.byId(id);
    if (!e || e.state !== 'dormant') return;
    e.root.visible = true;
    e.state = 'idle';
    e.alert = 1.2; e.lastKnown.copy(this.player.pos); e.hasLastKnown = true;
    e.set(e.kind === 'listener' ? 'investigate' : 'chase');
    this.fx.spores(e.pos.clone().setY(1), 16);
    audio.play(e.kind === 'listener' ? 'lurker_scream' : 'z_growl', { pos: e.pos.clone().setY(1.5), volume: 1 });
  }

  /** Cave collapse after the CHOIR falls: falling rock, rumble, a time limit. */
  startCollapse() {
    this.collapse = { t: 75, rockT: 1 };
    this.bossHook = null;
    audio.proc?.bed('cave', 0.8, 1);
  }
  private updateCollapse(dt: number) {
    const c = this.collapse; if (!c) return;
    c.t -= dt; c.rockT -= dt;
    if (this.choir) this.choir.update(dt);
    if (c.rockT <= 0) {
      c.rockT = 0.6 + Math.random() * 1.2;
      const p = this.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
      this.fx.dust(p.clone().setY(3), 10);
      this.fx.dust(p.clone().setY(0.4), 6);
      audio.play('impact', { pos: p.clone().setY(2), volume: 0.9, rate: 0.5 });
      this.rig.shake(0.3);
      if (p.distanceTo(this.player.pos) < 1.5) this.player.damage(14, p, { knock: false });
    }
    if (Math.random() < dt * 0.5) audio.play('thunder', { volume: 0.5, rate: 0.6 });
    if (c.t < 15 && Math.floor(c.t) !== Math.floor(c.t + dt)) this.hudMessage(`${Math.ceil(c.t)}`);
    if (c.t <= 0 && !this.player.dead) { this.player.hp = 0; this.player.die(); this.collapse = null; }
  }

  /** Test/debug hook: move the player to tile coords and face a direction. */
  debugTeleport(x: number, y: number, yawDeg = 0, pitch = -0.1) {
    const p = this.level.w(x, y, 0);
    this.player.spawn(p, (yawDeg * Math.PI) / 180);
    this.rig.yaw = (yawDeg * Math.PI) / 180; this.rig.pitch = pitch; this.rig.dist = 2.4;
  }
  findFocusPublic() { return this.findFocus(); }
  debugGive(id: string, n = 1) { this.player.inv.add(id, n); if (ITEMS[id]?.kind === 'weapon') { this.player.inv.mags[id] = ITEMS[id].weapon!.mag; this.player.equip(id); } }
  frameStats() {
    const i = this.engine.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length, fps: Math.round(this.engine.fps), heap: (performance as any).memory?.usedJSHeapSize };
  }

  private startAmbience(env: AreaDef['env']) {
    const p = audio.proc;
    for (const a of env.ambience) {
      if (a === 'rain') { const v = audio.play('amb_rain', { loop: true, bus: 'amb', volume: 0.55 * (env.rain ?? 1), vary: 0 }); if (v) this.ambVoices.push(v); }
      else if (a === 'hum') { const v = audio.play('amb_hum', { loop: true, bus: 'amb', volume: 0.5 * (env.humLevel ?? 0.6), vary: 0 }); if (v) this.ambVoices.push(v); }
      else p?.bed(a as any, a === 'wind' ? 0.35 * (env.wind ?? 1) : a === 'drone' ? 0.22 : a === 'cave' ? 0.4 : a === 'machine' ? 0.25 : 0.35, 3);
    }
    // positional emitters
    for (const s of this.level.sounds) {
      const v = audio.play(s.name, { pos: this.level.w(s.at[0], s.at[1], s.h ?? 1), loop: true, bus: 'amb', volume: s.volume ?? 0.6, ref: s.radius ?? 3, vary: 0 });
      if (v) this.ambVoices.push(v);
    }
  }

  fadeIn(dur: number) {
    const start = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - start) / (dur * 1000)); this.hud.fade(1 - k); this.engine.fx.fade = 0; if (k < 1) requestAnimationFrame(step); };
    step();
  }
  fadeOut(dur: number): Promise<void> {
    return new Promise((res) => {
      const start = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - start) / (dur * 1000)); this.hud.fade(k); if (k < 1) requestAnimationFrame(step); else res(); };
      step();
    });
  }

  // ------------------------------------------------------------ pause ---
  pause() {
    if (this.state !== 'play' && this.state !== 'dialog' && this.state !== 'doc') { if (this.state !== 'paused') return; }
    this.state = 'paused'; this.engine.paused = true;
    this.touch.show(false); input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.screens.show('pause', pauseMenu({
      objective: this.objectiveText(),
      onResume: () => this.resume(),
      onSettings: () => this.openSettings(),
      onFiles: () => this.showFiles(),
      onQuit: () => this.screens.show('dialog', dialog(t('quitConfirm'), () => this.showMenu(), () => this.pause())),
    }));
  }
  showFiles() {
    this.screens.show('files', filesList(this.docsRead, (id) => this.screens.show('doc', documentView(id, () => this.showFiles())), () => this.pause()));
  }
  resume() {
    this.screens.hide(); this.state = 'play'; this.engine.paused = false;
    this.touch.show(this.isTouch());
  }

  openInventory() {
    if (this.player.dead || this.player.grabbedBy) return;
    this.state = 'inventory'; this.engine.paused = true;
    this.touch.show(false); input.reset();
    this.hud.show(false);
    this.invUI.show(true);
    audio.proc?.rustle(0.18, 0.25);
    this.engine.renderOverride = (r) => { this.invUI.render(r, 1 / 60); return true; };
  }
  closeInventory() {
    this.invUI.show(false);
    this.engine.renderOverride = null;
    this.hud.show(true);
    this.state = 'play'; this.engine.paused = false;
    this.touch.show(this.isTouch());
    audio.proc?.rustle(0.12, 0.2);
  }

  useItem(id: string) {
    const d = ITEMS[id];
    if (d.kind === 'health') { this.closeInventory(); this.player.heal(id); }
    else if (d.kind === 'battery') {
      if (this.player.inv.battery >= 0.98) { bus.emit('toast', settings.data.language === 'tr' ? 'Fener zaten dolu' : 'Flashlight already full'); return; }
      this.player.inv.remove('battery', 1); this.player.inv.battery = Math.min(1, this.player.inv.battery + 0.5); audio.proc?.click(800, 0.12); this.invUI.refresh();
    } else if (id === 'flare') { this.closeInventory(); this.player.throwFlare(); }
  }

  // ------------------------------------------------------------ objectives --
  setObjective(key: string, announce = true, arg = '') {
    this.objective = key; this.objectiveArg = arg;
    this.hud.objective(this.objectiveText(), announce);
    if (announce) audio.proc?.click(520, 0.12, 0.12);
  }
  objectiveText() { return L(OBJECTIVES[this.objective]) + (this.objectiveArg ? ' ' + this.objectiveArg : ''); }

  say(tr: string, en: string, dur = 4) { this.hud.subtitle(settings.data.language === 'tr' ? tr : en, dur); }
  hudMessage(text: string) { bus.emit('toast', text); }

  // ------------------------------------------------------------ saves ---
  canAutosave() { return !!this.level && ['play', 'paused', 'inventory', 'doc', 'dialog'].includes(this.state) && !this.player.dead && !this.ending && !this.bossHook; }
  snapshot(kind: 'manual' | 'auto', withPos: boolean) {
    return {
      kind, area: this.areaId, spawn: null as string | null, pos: withPos ? [this.player.pos.x, this.player.pos.z] as [number, number] : null,
      yaw: this.player.yaw, hp: this.player.hp, inv: this.player.inv.serialize(), flags: [...this.flags, ...[...this.triggered].map((x) => 'trig:' + x)],
      killed: [...this.killed], docs: [...this.docsRead], objective: this.objective, playtime: this.playtime,
    };
  }
  autosave(silent = false) {
    if (!this.level) return;
    Save.write(this.snapshot('auto', true));
    if (!silent) bus.emit('toast', t('autosaved'), 'radio');
  }
  manualSave() { Save.write(this.snapshot('manual', true)); bus.emit('toast', t('saved'), 'radio'); audio.play('radio_static', { volume: 0.5 }); }

  // ------------------------------------------------------- world hooks ---
  onEnemyKilled(id: string) { this.killed.add(id); }
  onSpotted(e: any) {
    if (this.spotted.has(e.id)) return;
    this.spotted.add(e.id);
    if (Math.random() < 0.45) audio.play(Math.random() < 0.5 ? 'sting1' : 'sting2', { volume: 0.55, bus: 'music', vary: 0 });
  }
  onJumpScare() { audio.play('sting1', { volume: 0.8, bus: 'music', vary: 0 }); this.rig.shake(0.35); }
  shakeNear(p: THREE.Vector3, a: number) { const d = p.distanceTo(this.player.pos); if (d < 8) this.rig.shake(a * (1 - d / 8)); }

  // ---------------------------------------------------------- interaction --
  private findFocus(): Interactable | null {
    if (!this.level || this.player.dead || this.player.grabbedBy) return null;
    const p = this.player.pos;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    let best: Interactable | null = null, bestScore = Infinity;
    for (const it of this.level.interactables) {
      if (!it.active) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d > it.radius) continue;
      if (it.kind === 'door' && it.door!.open) continue;
      if (it.kind === 'exit' && it.door && it.door.open && (it.def as ExitDef).kind !== 'door') continue;
      const dx = (it.pos.x - p.x) / (d || 1), dz = (it.pos.z - p.z) / (d || 1);
      const facing = dx * fx + dz * fz;
      if (d > 0.9 && facing < -0.2) continue;
      if (it.def?.needFlag && !this.flags.has(it.def.needFlag) && it.kind === 'custom') continue;
      const score = d - facing * 0.6;
      if (score < bestScore) { best = it; bestScore = score; }
    }
    return best;
  }

  promptFor(it: Interactable): string {
    switch (it.kind) {
      case 'door': return t('p_open');
      case 'exit': return L((it.def as ExitDef).prompt) || t('p_go');
      case 'item': { const d = ITEMS[it.def.item]; return `${t('p_take')}: ${d ? L(d.name) : it.def.item}`; }
      case 'doc': return (it.def.doc as string).startsWith('tape') || (it.def.doc as string).startsWith('kemal_tape') ? t('p_listen') : t('p_read');
      case 'save': return t('p_save');
      case 'custom': return L((it.def as InteractDef).prompt);
    }
    return '';
  }

  async interact(it: Interactable) {
    const inv = this.player.inv;
    const tr = settings.data.language === 'tr';
    switch (it.kind) {
      case 'door': {
        const d = it.door!; const def = it.def as DoorDef;
        if (d.locked) {
          if (def.jammed) { audio.play('door_locked', { pos: it.pos, volume: 0.8 }); this.hudMessage(L(def.jammed)); return; }
          if (def.lock && inv.hasKey(def.lock)) {
            d.locked = false; this.flags.add('unlock:' + d.id);
            if (def.consume) inv.removeKey(def.lock);
            audio.play('door_unlock', { pos: it.pos, volume: 0.9 });
            this.hudMessage(`${t('unlocked')}: ${L(ITEMS[def.lock].name)}`);
            await new Promise((r) => setTimeout(r, 450));
          } else {
            audio.play('door_locked', { pos: it.pos, volume: 0.8 });
            this.hudMessage(L(def.msg) || t('locked'));
            return;
          }
        }
        this.openDoor(it);
        return;
      }
      case 'exit': {
        const x = it.def as ExitDef;
        if (x.needFlag && !this.flags.has(x.needFlag)) { audio.play('door_locked', { pos: it.pos, volume: 0.7 }); this.hudMessage(L(x.needMsg) || t('locked')); return; }
        if (this.areaId === 'choir' && this.flags.has('choir_done')) { this.collapse = null; await runEnding(this); return; }
        if (x.lock && !this.flags.has('unlock:' + it.id)) {
          if (!inv.hasKey(x.lock)) { audio.play('door_locked', { pos: it.pos, volume: 0.8 }); this.hudMessage(L(x.needMsg) || t('locked')); SCRIPTS['locked:' + x.to]?.(this); return; }
          this.flags.add('unlock:' + it.id);
          if (x.consume) inv.removeKey(x.lock);
          audio.play(x.lock === 'boltcutter' ? 'chain_gate' : 'door_unlock', { pos: it.pos, volume: 1 });
          this.hudMessage(`${t('unlocked')}: ${L(ITEMS[x.lock].name)}`);
          await new Promise((r) => setTimeout(r, 700));
        }
        if (x.flag) this.flags.add(x.flag);
        if (it.door) this.openDoor(it);
        else if (x.kind === 'elevator') audio.play('elevator', { volume: 0.9 });
        else if (x.kind === 'ladder' || x.kind === 'path') audio.proc?.rustle(0.15, 0.3);
        this.state = 'cutscene';
        await this.fadeOut(0.7);
        await this.loadArea(x.to, x.spawn);
        return;
      }
      case 'item': {
        const id = it.def.item as string, n = it.def.count ?? 1;
        const d = ITEMS[id];
        if (!inv.canFit(id, n)) { this.hudMessage(t('invFull')); audio.proc?.click(300, 0.1); return; }
        inv.add(id, n);
        this.flags.add('took:' + it.def.id);
        this.level.removeInteractable(it);
        this.player.playInteract(it.pos.y < 0.9 ? 'low' : 'mid');
        if (d.kind === 'ammo') audio.play('pickup_ammo', { volume: 0.7 }); else audio.proc?.rustle(0.22, 0.3);
        bus.emit('toast', `${t('pickedUp')}: ${L(d.name)}${n > 1 ? ' ×' + n : ''}`, d.icon);
        if (d.kind === 'weapon') { this.player.equip(id); this.onWeaponPickup(id); }
        if (SCRIPTS['pick:' + it.def.id]) SCRIPTS['pick:' + it.def.id](this, it);
        return;
      }
      case 'doc': {
        const docId = it.def.doc as string;
        if (!this.docsRead.includes(docId)) this.docsRead.push(docId);
        this.flags.add('took:' + it.def.id);
        this.flags.add('read:' + docId);
        this.level.removeInteractable(it);
        this.player.playInteract('low');
        const tape = docId.startsWith('kemal_tape');
        if (tape) { audio.play('cassette', { volume: 0.8 }); audio.proc?.staticBurst(0.15, 1.2); } else audio.proc?.rustle(0.25, 0.45);
        this.state = 'doc'; this.engine.paused = true; this.touch.show(false);
        this.screens.show('doc', documentView(docId, () => {
          this.screens.hide(); this.state = 'play'; this.engine.paused = false; this.touch.show(this.isTouch());
          if (SCRIPTS['read:' + docId]) SCRIPTS['read:' + docId](this);
        }));
        return;
      }
      case 'save': {
        audio.play('radio_static', { volume: 0.5 });
        this.state = 'dialog'; this.engine.paused = true; this.touch.show(false);
        this.screens.show('dialog', dialog(t('saveQ'), () => { this.manualSave(); this.screens.hide(); this.state = 'play'; this.engine.paused = false; this.touch.show(this.isTouch()); },
          () => { this.screens.hide(); this.state = 'play'; this.engine.paused = false; this.touch.show(this.isTouch()); }));
        return;
      }
      case 'custom': {
        const I = it.def as InteractDef;
        if (I.hold) { this.hold = { it, t: 0, dur: I.hold }; this.player.state = 'locked'; this.player.anim.full('Fixing_Kneeling', { fade: 0.3 }); return; }
        const fn = SCRIPTS[I.script];
        if (fn) await fn(this, it);
        return;
      }
    }
  }

  openDoor(it: Interactable) {
    const d = it.door!;
    this.level.openDoor(d, this.player.pos);
    this.flags.add('open:' + d.id);
    audio.play(d.kind === 'wood' ? 'door_creak' : 'door_metal', { pos: it.pos, volume: 0.9 });
    noise.emit(it.pos, 6, 'door');
    this.player.playInteract('mid');
  }

  onWeaponPickup(id: string) {
    if (id === 'pistol' || id === 'shotgun') this.hud.hint(t('hint_aim'), 6);
  }

  // ------------------------------------------------------------- update ---
  update(dt: number) {
    shared.uTime.value += dt;
    this.time += dt;
    if (!this.level || !this.player) { input.endFrame(); return; }
    input.pollGamepad();
    const playing = this.state === 'play' || this.state === 'cutscene' || this.state === 'dead';
    if (this.state === 'menu') {
      // slow drifting menu camera
      const t0 = this.time * 0.05;
      const s = this.level.spawns.get('menu');
      const base = s ? this.level.w(s.at[0], s.at[1], 1.6) : new THREE.Vector3(24, 1.6, 90);
      this.cam.position.set(base.x + Math.sin(t0) * 1.2, base.y + Math.sin(t0 * 1.7) * 0.15, base.z + Math.cos(t0 * 0.8) * 0.6);
      this.cam.lookAt(base.x + Math.sin(t0 * 0.6) * 3, 1.8, base.z - 20);
      this.pool.update(dt, this.time, this.cam);
      this.atmo.flash.on.value = 0;
      this.atmo.update(dt, this.cam, false);
      this.level.update(dt, this.time, this.cam.position);
      this.fx.update(dt, () => true);
      audio.setListener(this.cam);
      input.endFrame();
      return;
    }
    if (!playing) { input.endFrame(); return; }
    this.playtime += dt;
    noise.update(dt);
    const p = this.player;
    // camera look
    if (this.state === 'play') this.rig.addLook(input.look.x, input.look.y);
    const controls = this.state === 'play' && !this.hold;
    const wasAim = p.aiming;
    p.update(dt, this.rig, controls);
    if (p.aiming) aimAssist(this.combatCtx(), dt, !wasAim);
    if (!p.firearm && input.aimToggled) input.aimToggled = false;
    // interaction
    this.focus = this.state === 'play' ? this.findFocus() : null;
    if (this.state === 'play' && input.wasPressed('interact') && this.focus && !p.grabbedBy && !['reload', 'heal', 'melee', 'down'].includes(p.state)) this.interact(this.focus);
    // hold interactions
    if (this.hold) {
      this.hold.t += dt;
      bus.emit('toast-hold', this.hold.t / this.hold.dur);
      if (p.state !== 'locked' || p.dead) { this.hold = null; }
      else if (this.hold.t >= this.hold.dur) {
        const h = this.hold; this.hold = null; p.state = 'normal'; p.anim.full('Idle_Loop', { fade: 0.3 });
        const fn = SCRIPTS[(h.it.def as InteractDef).script]; if (fn) fn(this, h.it);
      }
      this.hud.setPrompt(null);
    }
    // camera
    this.rig.indoor = this.level.grid.indoorAt(p.pos.x, p.pos.z) || (this.level.def.ceiling !== undefined && !this.level.def.env.outdoor);
    if (this.cine) this.updateCine(dt);
    const camDist = this.rig.update(dt, p.pos, p.crouching ? 1 : 0, p.aiming);
    p.root.visible = camDist > 0.55 || this.state !== 'play';
    this.camPos.copy(this.cam.position);
    // world
    this.enemies.update(dt);
    if (this.bossHook) this.bossHook(dt);
    if (this.collapse) this.updateCollapse(dt);
    this.level.update(dt, this.time, this.cam.position);
    this.pool.update(dt, this.time, this.cam);
    this.fx.update(dt, (v) => { const [cx, cy] = this.level.grid.cellOf(v.x, v.z); return !(this.level.grid.flag(cx, cy) & BLOCK_SIGHT); });
    if (this.fx.flare && this.fx.flare.landed && Math.random() < dt * 2) noise.emit(this.fx.flare.pos, 20, 'flare', false);
    // atmosphere
    this.atmo.flash.pos.value.copy(p.flash.position);
    this.atmo.flash.dir.value.copy(p.flashTarget.position).sub(p.flash.position).normalize();
    this.atmo.flash.on.value = p.flash.intensity > 1 ? 1 : 0.2;
    const env = this.level.def.env;
    this.atmo.update(dt, this.cam, !!env.lightning && this.state === 'play');
    this.moon.intensity = (env.moon?.intensity ?? 0) + this.atmo.lightning * (env.lightning ? 2.5 : 0);
    this.engine.fx.flash = this.atmo.lightning * 0.25;
    this.triggers();
    this.ambientOneShots(dt);
    this.updateAudio(dt);
    this.updateHud(dt);
    // post fx
    const fxs = this.engine.fx;
    fxs.damage = Math.max(0, fxs.damage - dt * 1.4);
    fxs.low = THREE.MathUtils.lerp(fxs.low, p.hp < 30 && !p.dead ? 1 - p.hp / 30 : 0, dt * 2);
    const hum = (env.humLevel ?? 0) + this.listenerProximity();
    shared.uHum.value = THREE.MathUtils.lerp(shared.uHum.value, hum, dt);
    fxs.hum = THREE.MathUtils.lerp(fxs.hum, Math.min(1, hum), dt);
    // periodic checkpoint autosave (silent) every 90 s of safe play
    this.autoT += dt;
    if (this.autoT > 90 && !this.enemies.chasing && this.canAutosave()) { this.autoT = 0; this.autosave(true); }
    input.endFrame();
  }

  private listenerProximity() {
    let k = 0;
    for (const e of this.enemies.list) if (e.kind === 'listener' && e.state !== 'dormant') k = Math.max(k, 1 - e.pos.distanceTo(this.player.pos) / 14);
    return Math.max(0, k) * 0.6;
  }

  private updateCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const pos = c.from.clone().lerp(c.to, e);
    this.rig.cinematic = { pos, look: c.look, w: Math.min(1, c.t * 2, (c.dur + 0.6 - c.t) * 2) };
    if (c.t >= c.dur + 0.6) { this.rig.cinematic = null; const d = c.done; this.cine = null; d?.(); }
  }

  cinematic(from: THREE.Vector3, to: THREE.Vector3, look: THREE.Vector3, dur: number): Promise<void> {
    return new Promise((res) => { this.cine = { t: 0, dur, from, to, look, done: res }; });
  }

  private triggers() {
    if (this.state !== 'play') return;
    const T = this.level.T;
    const px = this.player.pos.x / T, py = this.player.pos.z / T;
    for (const tr of this.level.triggers) {
      if (tr.once !== false && this.triggered.has(tr.id)) continue;
      if (tr.needFlag && !this.flags.has(tr.needFlag)) continue;
      const [x0, y0, x1, y1] = tr.rect;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        this.triggered.add(tr.id);
        const fn = SCRIPTS[tr.script];
        if (fn) fn(this);
      }
    }
  }

  private ambientOneShots(dt: number) {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 14 + Math.random() * 26;
    const env = this.level.def.env;
    const pool = env.outdoor ? ['crow', 'metal_far', 'scream_far', 'house_creak'] : ['metal_far', 'house_creak', 'whispers', 'metal_far'];
    if (this.areaId === 'facility' || this.areaId === 'choir') pool.push('whispers', 'lis_click');
    const name = pool[Math.floor(Math.random() * pool.length)];
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 18;
    const pos = this.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 2 + Math.random() * 3, Math.sin(a) * r));
    audio.play(name, { pos, volume: name === 'whispers' ? 0.35 : 0.6, ref: 6, max: 60, occlude: false, vary: 0.12 });
  }

  private updateAudio(dt: number) {
    audio.setListener(this.cam);
    for (const v of this.ambVoices) if (v.pos) audio.updateVoice(v, v.pos, 0.6);
    const chasing = this.enemies.chasing;
    if (chasing) this.chaseHold = 6; else this.chaseHold -= dt;
    let want = this.musicWanted;
    if (this.bossHook) want = 'mus_boss';
    else if (this.chaseHold > 0 && !this.player.dead) want = 'mus_chase';
    else {
      const nearSave = this.level.interactables.some((i) => i.kind === 'save' && i.pos.distanceTo(this.player.pos) < 7);
      if (nearSave && this.enemies.nearestThreat(this.player.pos) > 12) want = 'mus_safe';
    }
    if (this.ending) want = 'mus_ending';
    if (want !== audio.musicName) audio.playMusic(want, want === 'mus_chase' ? 1.2 : 3);
    // heartbeat with danger and low health
    const threat = this.enemies.nearestThreat(this.player.pos);
    const danger = Math.max(threat < 10 ? 1 - threat / 10 : 0, this.player.hp < 35 ? (1 - this.player.hp / 35) * 0.8 : 0);
    audio.proc?.heartbeat(dt, this.player.dead ? 0 : danger * 0.8);
  }

  private updateHud(dt: number) {
    const p = this.player, inv = p.inv;
    this.hud.update(dt);
    this.hud.setHealth(p.hp, p.maxHp);
    this.hud.setBattery(inv.battery, p.flashOn);
    const w = inv.equipped ? ITEMS[inv.equipped] : null;
    if (w && w.weapon!.mag > 0) this.hud.setAmmo(L(w.name), inv.mags[inv.equipped] ?? 0, inv.reserveAmmo(inv.equipped));
    else this.hud.setAmmo(w ? L(w.name) : '', null, null);
    this.hud.setStamina(p.stamina, p.stamina < 99 && !p.dead);
    this.hud.setCrosshair(p.aiming, p.spread + (p.moveAmount > 0.3 ? 0.012 : 0) + (w?.weapon?.spread ?? 0));
    const touch = this.touch.visible;
    const prompt = this.focus ? this.promptFor(this.focus) : null;
    this.hud.setPrompt(!touch && this.state === 'play' ? prompt : null);
    this.hud.setFps(settings.data.showFps ? this.engine.fps : null);
    if (!this.engine.q.post) this.hud.setDamageOverlay(Math.max(this.engine.fx.damage, this.engine.fx.low * 0.6));
    else this.hud.setDamageOverlay(0);
    const healAvail = p.hp < 60 && (inv.count('bandage') + inv.count('medkit') + inv.count('adrenaline')) > 0;
    this.touch.update({
      firearm: p.firearm, aiming: p.aiming, interact: this.state === 'play' ? prompt : null,
      canReload: p.firearm && (inv.mags[inv.equipped] ?? 0) < (w?.weapon?.mag ?? 0) && inv.reserveAmmo(inv.equipped) > 0,
      crouching: p.crouching, healAvail, weaponIcon: w ? w.icon : 'hand', flashOn: p.flashOn, grabbed: !!p.grabbedBy,
    });
  }
}
