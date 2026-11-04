import * as THREE from 'three';
import { t, L } from '../core/i18n';
import { ITEMS } from '../items/ItemDefs';
import type { Inventory } from '../items/Inventory';
import { icon } from './Icons';
import { el } from './Screens';
import { assets } from '../core/Assets';
import { dynamicPropMaterial } from '../world/Materials';
import { audio } from '../audio/AudioEngine';

const MODEL: Record<string, [string, number]> = {
  ammo_9mm: ['Can_Closed', 2.2], ammo_shell: ['Can_Red', 2.2], bandage: ['Bandages', 3], medkit: ['FirstAidKit', 2], adrenaline: ['WaterBottle_1', 1.6],
  battery: ['Battery_Big', 4], knife: ['Knife', 2.5], flare: ['FlareGun', 2], pistol: ['W_Pistol', 2.6], shotgun: ['Shotgun_1', 0.8], backpack: ['Backpack', 1.4],
  fuel: ['GasCan', 1.2], tape_inverse: ['Radio', 1.4], boltcutter: ['Axe_Small', 1.4], fuse: ['Battery_Small', 4], card_meridyen: ['Phone', 3],
};

/**
 * Touch-first inventory: large slots, clear icons, a separate key-item tab,
 * and a rotatable 3D inspect view rendered by the main renderer while the
 * game world is paused (no second WebGL context).
 */
export class InventoryUI {
  root: HTMLElement;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  private holder = new THREE.Group();
  private sel: string | null = null;
  private tab: 'items' | 'keys' = 'items';
  private drag: { x: number; y: number } | null = null;
  private rotY = 0; private rotX = 0.3;
  open = false;

  constructor(parent: HTMLElement, private inv: Inventory, private actions: { use: (id: string) => void; equip: (id: string) => void; discard: (id: string) => void; close: () => void; hp: () => [number, number] }) {
    this.root = el(`<div id="inventory" class="off">
      <div class="inv-left">
        <div class="inv-head"><h2>${t('inventory')}</h2><div class="inv-tabs"><button data-t="items" class="on">${t('inventory')}</button><button data-t="keys">${t('keyItems')}</button></div></div>
        <div class="inv-weapons"></div>
        <div class="inv-grid"></div>
        <div class="inv-status"><div class="st-hp"><span>${t('health')}</span><div class="bar"><i></i></div></div><div class="st-bat"><span>${t('battery')}</span><div class="bar"><i></i></div></div></div>
      </div>
      <div class="inv-right">
        <div class="inspect"></div>
        <div class="desc"><h3></h3><p></p></div>
        <div class="acts"></div>
      </div>
      <button class="inv-close">${icon('pause', 1)}✕</button>
    </div>`);
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('.inv-tabs button').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.t as any; this.sel = null; this.refresh();
      this.root.querySelectorAll('.inv-tabs button').forEach((x) => x.classList.toggle('on', x === b)); audio.proc?.click(1100, 0.08);
    }));
    (this.root.querySelector('.inv-close') as HTMLElement).addEventListener('click', () => this.actions.close());
    const insp = this.root.querySelector('.inspect') as HTMLElement;
    insp.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; insp.setPointerCapture(e.pointerId); });
    insp.addEventListener('pointermove', (e) => { if (!this.drag) return; this.rotY += (e.clientX - this.drag.x) * 0.012; this.rotX += (e.clientY - this.drag.y) * 0.008; this.drag = { x: e.clientX, y: e.clientY }; });
    insp.addEventListener('pointerup', () => (this.drag = null));
    // inspect stage lighting
    this.scene.background = new THREE.Color(0x07090b);
    const key = new THREE.DirectionalLight(0xfff0dd, 2.4); key.position.set(1.5, 2, 2);
    const rim = new THREE.DirectionalLight(0x6fd8c8, 1.2); rim.position.set(-2, 1, -1.5);
    this.scene.add(key, rim, new THREE.HemisphereLight(0x9aa6b8, 0x101010, 0.6), this.holder);
    this.cam.position.set(0, 0.05, 1.6); this.cam.lookAt(0, 0, 0);
  }

  show(v: boolean) {
    this.open = v;
    this.root.classList.toggle('off', !v);
    if (v) { this.sel = null; this.refresh(); }
  }

  refresh() {
    const inv = this.inv;
    const wEl = this.root.querySelector('.inv-weapons') as HTMLElement;
    wEl.innerHTML = inv.weapons.map((w) => {
      const d = ITEMS[w]; const m = d.weapon!.mag > 0 ? `${inv.mags[w] ?? 0}/${inv.reserveAmmo(w)}` : '∞';
      return `<button class="wslot ${inv.equipped === w ? 'eq' : ''} ${this.sel === w ? 'sel' : ''}" data-id="${w}">${icon(d.icon, 30)}<span>${L(d.name)}</span><b>${m}</b></button>`;
    }).join('');
    const grid = this.root.querySelector('.inv-grid') as HTMLElement;
    if (this.tab === 'items') {
      const cells: string[] = [];
      for (let i = 0; i < inv.capacity; i++) {
        const s = inv.slots[i];
        if (!s) { cells.push('<div class="slot empty"></div>'); continue; }
        const d = ITEMS[s.id];
        cells.push(`<button class="slot ${this.sel === 'slot:' + i ? 'sel' : ''} k-${d.kind}" data-slot="${i}">${icon(d.icon, 34)}<b>${s.count > 1 ? '×' + s.count : ''}</b></button>`);
      }
      grid.innerHTML = cells.join('');
      grid.className = 'inv-grid';
    } else {
      grid.innerHTML = inv.keys.length ? inv.keys.map((k) => `<button class="slot key ${this.sel === 'key:' + k ? 'sel' : ''}" data-key="${k}">${icon(ITEMS[k]?.icon || 'key', 34)}</button>`).join('') : `<p class="muted">—</p>`;
      grid.className = 'inv-grid keys';
    }
    wEl.querySelectorAll<HTMLElement>('.wslot').forEach((b) => b.addEventListener('click', () => this.select(b.dataset.id!, b.dataset.id!)));
    grid.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.slot!; this.select('slot:' + i, inv.slots[i].id); }));
    grid.querySelectorAll<HTMLElement>('[data-key]').forEach((b) => b.addEventListener('click', () => this.select('key:' + b.dataset.key!, b.dataset.key!)));
    const [hp, max] = this.actions.hp();
    (this.root.querySelector('.st-hp i') as HTMLElement).style.transform = `scaleX(${hp / max})`;
    (this.root.querySelector('.st-hp') as HTMLElement).dataset.c = hp / max > 0.6 ? 'fine' : hp / max > 0.3 ? 'caution' : 'danger';
    (this.root.querySelector('.st-bat i') as HTMLElement).style.transform = `scaleX(${inv.battery})`;
    if (!this.sel) this.describe(null);
  }

  private select(key: string, id: string) {
    this.sel = key; audio.proc?.click(1500, 0.06, 0.03);
    this.refresh();
    this.describe(id);
  }

  private describe(id: string | null) {
    const h3 = this.root.querySelector('.desc h3') as HTMLElement, p = this.root.querySelector('.desc p') as HTMLElement;
    const acts = this.root.querySelector('.acts') as HTMLElement;
    this.holder.clear();
    if (!id) { h3.textContent = ''; p.textContent = ''; acts.innerHTML = ''; return; }
    const d = ITEMS[id];
    h3.textContent = L(d.name); p.textContent = L(d.desc);
    const btns: string[] = [];
    if (d.kind === 'weapon' && this.inv.equipped !== id) btns.push(`<button class="mi small primary" data-a="equip">${t('equip')}</button>`);
    if (d.kind === 'health' || d.kind === 'battery' || id === 'flare') btns.push(`<button class="mi small primary" data-a="use">${t('use')}</button>`);
    if (['ammo', 'health', 'defense', 'battery'].includes(d.kind)) btns.push(`<button class="mi small" data-a="drop">${t('drop')}</button>`);
    acts.innerHTML = btns.join('');
    acts.querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'equip') this.actions.equip(id);
      if (a === 'use') this.actions.use(id);
      if (a === 'drop') this.actions.discard(id);
      this.sel = null; this.refresh();
    }));
    // 3D model
    const m = MODEL[id] || [id === 'pipe' ? '' : 'Matchbox', 3];
    let obj: THREE.Object3D;
    if (id === 'pipe') obj = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x5a5148, metalness: 0.8, roughness: 0.45 }));
    else {
      const pg = assets.prop('items', m[0]);
      obj = new THREE.Mesh(pg ? pg.geometry : new THREE.BoxGeometry(0.2, 0.1, 0.1), dynamicPropMaterial());
      if (pg) { const c = pg.min.clone().add(pg.max).multiplyScalar(0.5); (obj as THREE.Mesh).geometry = (obj as THREE.Mesh).geometry.clone().translate(-c.x, -c.y, -c.z); }
    }
    const box = new THREE.Box3().setFromObject(obj); const sz = box.getSize(new THREE.Vector3()).length();
    obj.scale.setScalar(0.75 / Math.max(sz, 0.01));
    this.holder.add(obj);
    this.rotY = 0.6; this.rotX = 0.3;
  }

  /** Called by the game's render override while open. */
  render(r: THREE.WebGLRenderer, dt: number) {
    const insp = this.root.querySelector('.inspect') as HTMLElement;
    const rect = insp.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.setClearColor(0x050607, 1); r.clear();
    if (!this.drag) this.rotY += dt * 0.5;
    this.holder.rotation.set(this.rotX, this.rotY, 0);
    if (rect.width > 10 && this.holder.children.length) {
      this.cam.aspect = rect.width / rect.height; this.cam.updateProjectionMatrix();
      const y = H - rect.bottom;
      r.setViewport(rect.left, y, rect.width, rect.height);
      r.setScissor(rect.left, y, rect.width, rect.height); r.setScissorTest(true);
      r.render(this.scene, this.cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    }
  }
}
