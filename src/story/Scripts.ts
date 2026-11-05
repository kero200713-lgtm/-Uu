import * as THREE from 'three';
import type { Game } from '../Game';
import { t } from '../core/i18n';
import { audio } from '../audio/AudioEngine';
import { settings } from '../core/Settings';
import { bus } from '../core/Events';
import { noise } from '../combat/Noise';
import { keypad, epilogue, creditsPanel } from '../ui/Screens';
import { ChoirBoss } from '../enemies/Choir';
import type { Interactable } from '../world/Level';
import { persist } from '../platform/Native';

type Fn = (g: Game, arg?: any) => void | Promise<void>;
const tr = () => settings.data.language === 'tr';
const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const msg = (g: Game, a: string, b: string) => g.hudMessage(tr() ? a : b);

/** Story and level scripts, referenced by name from area data. */
export const SCRIPTS: Record<string, Fn> = {
  // ================================================================ forest
  forest_intro: async (g) => {
    await wait(1.5);
    g.say('Kafam... Araba bitti. Kasabaya yürümem gerek.', 'My head... The car is done. I have to walk to town.', 4.5);
    await wait(4.8);
    g.hud.hint(t('hint_move'), 6);
    await wait(6.5);
    g.hud.hint(t('hint_interact'), 6);
  },
  forest_apparition: async (g) => {
    const e = await g.enemies.spawnOne({ type: 'enemy', id: 'apparition', kind: 'hollow', variant: 'miner', at: [12.4, 29.2], dir: 0 });
    e.state = 'dormant';
    e.anim.full('Zombie_Idle_Loop', { fade: 0 });
    e.root.visible = true;
    audio.play('crow', { pos: e.pos.clone().setY(6), volume: 0.8 });
    g.say('...Biri mi var?', '...Is someone there?', 3);
    await wait(2.6);
    audio.play('whispers', { pos: e.pos.clone().setY(1.6), volume: 0.5 });
    await wait(0.8);
    e.dispose(); g.enemies.list = g.enemies.list.filter((x) => x !== e);
  },
  forest_bridge: (g) => { g.hud.hint(t('hint_run'), 6); },
  forest_busstop: async (g) => {
    g.say('Bu ses... Biri yemek mi yiyor?', 'That sound... Is someone eating?', 4);
    await wait(4.2);
    g.hud.hint(t('hint_crouch'), 6);
  },
  'pick:i_pipe': (g) => g.hud.hint(tr() ? 'Saldırı butonuyla boruyu savur.' : 'Swing the pipe with the attack button.', 5),
  'pick:i_cabin_knife': (g) => g.hud.hint(tr() ? 'Çakı, bir şey seni yakaladığında otomatik kullanılır.' : 'The knife is used automatically when something grabs you.', 6),

  // ================================================================== town
  town_enter: async (g) => {
    g.say('Karaçam. On yıl... Hiçbir şey değişmemiş. Ama hiç bu kadar sessiz olmamıştı.', 'Karaçam. Ten years... Nothing has changed. But it was never this quiet.', 5);
    await wait(5.2);
    g.setObjective('obj_find_way');
  },
  town_square: (g) => g.say('Kontrol noktası... Burada bir şey olmuş. Bir jandarma.', 'A checkpoint... Something happened here. A gendarme.', 4),
  town_house: (g) => { if (!g.flags.has('unlock:house_front')) g.say('Babamın evi. Anahtar hâlâ saksının altında mı?', "Dad's house. Is the key still under the flowerpot?", 4); },
  'locked:clinic': (g) => { if (!g.player.inv.hasKey('boltcutter')) { g.setObjective('obj_find_tool'); g.say('Zincir... Bir makas lazım. Nalbur, belki.', 'A chain... I need cutters. The hardware store, maybe.', 4); } },
  'pick:i_key_police': (g) => g.say('Astsubay Kaya. Karakolun anahtarı kemerinde.', "Sergeant Kaya. The station key was on his belt.", 4),
  'pick:i_pistol': (g) => g.say('Dolu bir şarjör... ve bir tane daha. Umarım yeter.', 'A loaded magazine... and one more. I hope it is enough.', 4),
  'pick:i_boltcutter': (g) => { g.setObjective('obj_cut_chain'); },
  'pick:i_backpack': (g) => g.hud.hint(tr() ? 'Envanter +4 yuva.' : 'Inventory +4 slots.', 4),
  'read:kemal_letter': (g) => g.say('17 Nisan... Doğum günüm. Hatırlamış.', 'April 17th... My birthday. He remembered.', 4),

  // ================================================================ clinic
  clinic_enter: (g) => {
    g.setObjective('obj_clinic');
    g.say('Antiseptik ve çürük et kokusu. Jeneratör ölü, sadece acil ışıklar yanıyor.', 'Antiseptic and rotting meat. The generator is dead; only the emergency lights work.', 5);
  },
  clinic_backdoor_hint: (g) => {
    if (g.flags.has('clinic_power')) return;
    g.setObjective('obj_clinic_power');
    g.say('Elektronik kilit. Sigorta kutusu buralarda bir yerde olmalı.', 'An electronic lock. There must be a fuse box around here.', 4);
  },
  clinic_fusebox: async (g) => {
    if (g.flags.has('clinic_power')) { msg(g, 'Sigortalar yerinde.', 'The fuses are in.'); return; }
    if (!g.player.inv.hasKey('fuse')) { audio.play('door_locked', { volume: 0.4, rate: 1.4 }); msg(g, 'Ana sigorta yuvası boş. Yedek bir sigorta bulmalıyım.', 'The main fuse slot is empty. I need a spare fuse.'); return; }
    g.player.inv.removeKey('fuse');
    g.player.playInteract('mid');
    audio.play('door_unlock', { volume: 0.9, rate: 0.7 });
    await wait(0.6);
    g.flags.add('clinic_power');
    audio.play('generator', { volume: 0.4, rate: 1.3 });
    for (const id of ['cl_lobby', 'cl_cor1', 'cl_cor2', 'cl_cor3', 'cl_hall']) g.setLight(id, true);
    noise.emit(g.player.pos, 30, 'shot', true);
    g.setObjective('obj_clinic');
    g.say('Işıklar... Ve şimdi hepsi nerede olduğumu biliyor.', 'Lights... And now all of them know where I am.', 4);
  },
  'pick:i_card': (g) => g.say('Meridyen... Babamın çalıştığı enstitü.', 'Meridian... The institute Dad worked for.', 4),

  // ================================================================== mine
  mine_enter: async (g) => {
    g.say('Maden. Babam her sabah bu kapıdan geçerdi.', 'The mine. Dad walked through this gate every morning.', 4.5);
    await wait(4.8);
    if (!g.flags.has('generator_on')) g.setObjective('obj_generator');
  },
  mine_generator: async (g, it: Interactable) => {
    if (g.flags.has('generator_on')) { msg(g, 'Jeneratör çalışıyor.', 'The generator is running.'); return; }
    if (!g.player.inv.hasKey('fuel')) { audio.play('dry_fire', { pos: it.pos, volume: 0.6, rate: 0.5 }); msg(g, 'Depo boş. Dizel lazım — garajda olabilir.', 'The tank is empty. It needs diesel — try the garage.'); return; }
    g.player.inv.removeKey('fuel');
    g.player.playInteract('low');
    audio.play('generator', { pos: it.pos, volume: 1 });
    await wait(2.5);
    g.flags.add('generator_on');
    const v = audio.play('generator', { pos: it.pos, volume: 0.7, loop: true, ref: 4 });
    if (v) (g as any).ambExtra = v;
    audio.proc?.bed('machine', 0.5, 2);
    for (const id of ['mn_flood1', 'mn_flood2', 'mn_flood3', 'mn_lift']) g.setLight(id, true);
    noise.emit(it.pos, 60, 'shot', true);
    g.setObjective('obj_lift');
    g.say('Çalıştı! Ama bu gürültü... Herkesi uyandırdım.', 'It works! But the noise... I just woke everything up.', 4);
    const def = g.level.def.entities.find((e: any) => e.type === 'enemy' && e.id === 'e_mn_h5') as any;
    if (def && !g.killed.has(def.id)) { const e = await g.enemies.spawnOne(def); e.alert = 1; e.lastKnown.copy(g.player.pos); e.hasLastKnown = true; e.set('chase'); }
  },
  mine_lift_hint: (g) => { if (!g.flags.has('generator_on')) g.say('Asansör. Ama elektrik yok.', 'The lift. But there is no power.', 3); },
  'pick:i_shotgun': (g) => g.say('Bekçinin tüfeği. Bu onları durdurur.', "The watchman's shotgun. This will stop them.", 4),
  'pick:i_fuel': (g) => g.say('Dizel. Jeneratör kuzeydeki kulübede.', 'Diesel. The generator is in the shed to the north.', 4),

  // ============================================================== facility
  facility_enter: async (g) => {
    g.say('-410. Burası bir maden değil. Burası bir laboratuvar.', '-410. This isn\'t a mine. It\'s a laboratory.', 4.5);
    await wait(4.8);
    if (!g.flags.has('has_tape')) g.setObjective('obj_lab');
  },
  facility_listener_intro: async (g) => {
    audio.play('lis_click', { volume: 0.9, pos: g.level.w(22, 2.3, 2) });
    g.say('O ses... Bir şey tıkırdıyor. Dinliyor.', 'That sound... Something is clicking. Listening.', 4);
    await wait(4.2);
    g.hud.hint(t('hint_crouch'), 6);
    await wait(6.5);
    g.hud.hint(t('hint_flare'), 6);
  },
  keypad_kemal: (g) => {
    g.state = 'dialog'; g.engine.paused = true; g.touch.show(false);
    const close = () => { g.screens.hide(); g.state = 'play'; g.engine.paused = false; g.touch.show(g.isTouch()); };
    g.screens.show('keypad', keypad((code) => {
      if (code !== '1704') return false;
      const d = g.level.doors.find((x) => x.id === 'fac_kemal');
      if (d) d.locked = false;
      g.flags.add('unlock:fac_kemal');
      audio.play('door_unlock', { volume: 1 });
      setTimeout(() => { close(); g.say('17 04. Doğum günüm. Baba...', '17 04. My birthday. Dad...', 4); }, 700);
      return true;
    }, close));
  },
  'pick:i_tape': (g) => {
    g.flags.add('has_tape');
    g.setObjective('obj_shaft');
    g.say('"Ela için. Sona sakla." Bu onun el yazısı.', '"For Ela. Save it for the end." His handwriting.', 4.5);
  },

  // ================================================================= choir
  choir_enter: async (g) => {
    if (g.flags.has('choir_done')) return;
    const c = g.level.w(16, 15, 0);
    const boss = g.choirPre ?? new ChoirBoss(g, c);
    if (g.choirPre) g.choirPre = null; else await boss.init();
    boss.setActive(true);
    g.choir = boss;
    g.bossHook = (dt) => boss.update(dt);
    const p = g.player.pos.clone();
    g.state = 'cutscene';
    g.cinematic(p.clone().add(new THREE.Vector3(-2, 2.5, 3)), p.clone().add(new THREE.Vector3(2, 4.5, -6)), c.clone().setY(4), 4.5).then(() => { g.state = 'play'; });
    boss.roar();
    await wait(1.2);
    g.say('Baba...?', 'Dad...?', 3);
    await wait(3.4);
    audio.play('whispers', { pos: c.clone().setY(3), volume: 0.7, occlude: false });
    g.say('<i>"Ela. Kapat onu."</i>', '<i>"Ela. Turn it off."</i>', 4);
    g.setObjective('obj_resonators', true, `(${countRes(g)}/3)`);
  },
  choir_resonator: async (g, it: Interactable) => {
    const id = it.def.id as string;
    if (g.flags.has('res_off:' + id)) return;
    g.flags.add('res_off:' + id);
    it.active = false;
    g.setLight('rl' + id.slice(3), false);
    audio.play('elevator', { pos: it.pos, volume: 0.6, rate: 1.4 });
    g.fx.spores(it.pos.clone().setY(2), 20);
    const n = countRes(g);
    const boss = g.choir;
    if (boss) { boss.phase = n; boss.roar(); }
    g.setObjective(n >= 3 ? 'obj_tape' : 'obj_resonators', true, n >= 3 ? '' : `(${n}/3)`);
    const wake = n === 1 ? ['e_ch_h1', 'e_ch_listener'] : n === 2 ? ['e_ch_h2', 'e_ch_h3'] : ['e_ch_h4'];
    for (const w of wake) g.wakeEnemy(w);
    if (n >= 3) g.say('Kalbi açıldı. Konsol... şimdi!', 'Its heart is open. The console... now!', 4);
  },
  choir_console: async (g) => {
    if (g.flags.has('choir_done')) return;
    if (countRes(g) < 3) { msg(g, 'Rezonatörler hâlâ çalışıyor. Önce onları kapatmalıyım.', 'The resonators are still running. I have to shut them down first.'); return; }
    if (!g.player.inv.hasKey('tape_inverse')) { msg(g, 'Kaset... Kaset bende değil.', "The tape... I don't have it."); return; }
    g.player.inv.removeKey('tape_inverse');
    g.flags.add('choir_done');
    g.state = 'cutscene';
    for (const e of g.enemies.list) if (e.state !== 'dead') e.stun(30);
    audio.play('cassette', { volume: 1 });
    await wait(1.2);
    audio.proc?.staticBurst(0.35, 2.5);
    g.say('[KASET] <i>"...Ela. Kapat onu."</i>', '[TAPE] <i>"...Ela. Turn it off."</i>', 3.5);
    playInverseTone(4.5);
    const boss = g.choir;
    if (boss) { boss.roar(); }
    const c = g.level.w(16, 15, 0);
    await g.cinematic(g.player.pos.clone().add(new THREE.Vector3(0, 3, 4)), g.player.pos.clone().add(new THREE.Vector3(0, 5, 8)), c.clone().setY(4), 4);
    if (boss) boss.shatter();
    g.engine.fx.flash = 0.8;
    g.rig.shake(1);
    audio.play('choir_roar', { volume: 1, rate: 0.7, occlude: false, priority: 9 });
    for (const e of g.enemies.list) if (e.state !== 'dead') e.die();
    await wait(1.5);
    g.state = 'play';
    g.setObjective('obj_escape');
    g.say('Sessizlik... Gerçek sessizlik. Tavan çöküyor — kuyuya!', 'Silence... Real silence. The ceiling is coming down — to the shaft!', 4);
    g.startCollapse();
  },
};

function countRes(g: Game) { return ['res1', 'res2', 'res3'].filter((r) => g.flags.has('res_off:' + r)).length; }

/** Synthesised "inverse phase" sweep — the tape's payload. */
function playInverseTone(dur: number) {
  const c = audio.ctx; if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o2.type = 'sawtooth';
  o.frequency.setValueAtTime(41, t0); o.frequency.exponentialRampToValueAtTime(820, t0 + dur);
  o2.frequency.setValueAtTime(41.3, t0); o2.frequency.exponentialRampToValueAtTime(410, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.35, t0 + 0.5); g.gain.linearRampToValueAtTime(0.0, t0 + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  o.connect(g); o2.connect(lp).connect(g); g.connect(audio.sfx);
  o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
}

/** Ending sequence after escaping the collapsing cavern. */
export async function runEnding(g: Game) {
  g.ending = true;
  g.state = 'ending';
  g.touch.show(false);
  await g.fadeOut(2);
  g.hud.show(false);
  audio.stopAll();
  audio.proc?.stopAllBeds(1);
  audio.playMusic('mus_ending', 2, false);
  persist('ugultu_completed', '1');
  const L = tr()
    ? ['Kuyudan çıktığımda şafak sökmüştü.', 'Yağmur durmuştu. Kuşlar vardı. Gerçek kuşlar.', 'Karaçam\'da ilk kez sessizlik, sadece sessizlikti.', 'Arabaya döndüğümde radyo kendi kendine açıldı.', '<b>"Ela... kapat onu."</b>', 'Bu kez ses babamın değildi.', 'Benimdi.']
    : ['When I climbed out of the shaft, dawn had broken.', 'The rain had stopped. There were birds. Real birds.', 'For the first time, silence in Karaçam was only silence.', 'When I got back to the car, the radio switched itself on.', '<b>"Ela... turn it off."</b>', 'This time the voice wasn\'t my father\'s.', 'It was mine.'];
  g.screens.show('epilogue', epilogue(L, () => {
    g.screens.show('credits', creditsPanel(() => g.showMenu(), true));
  }));
}

/** Runs every time an area is entered (after load). */
export function onAreaEnter(g: Game, id: string) {
  const f = g.flags;
  if (!f.has('visited:' + id)) {
    f.add('visited:' + id);
    const first = AREA_FIRST[id];
    if (first) first(g);
  }
}

const AREA_FIRST: Record<string, Fn> = {
  forest: (g) => { g.setObjective('obj_reach_town', false); },
};

export { bus };
