import { ITEMS } from './ItemDefs';
import { bus } from '../core/Events';

export interface Slot { id: string; count: number }

/**
 * Survival-horror inventory: a small number of stack slots for consumables
 * and ammo, a separate unlimited key-item pouch, and owned weapons with their
 * loaded magazines. Serialisable for saves.
 */
export class Inventory {
  slots: Slot[] = [];
  capacity = 8;
  keys: string[] = [];
  weapons: string[] = [];
  mags: Record<string, number> = {};
  equipped = '';
  battery = 1; // flashlight charge 0..1

  hasKey(id: string) { return this.keys.includes(id); }
  count(id: string) { return this.slots.filter((s) => s.id === id).reduce((a, s) => a + s.count, 0); }

  /** Returns how many could NOT be added. */
  add(id: string, n = 1): number {
    const def = ITEMS[id];
    if (!def) return n;
    if (def.kind === 'key' || def.kind === 'quest') { if (!this.keys.includes(id)) this.keys.push(id); bus.emit('inv'); return 0; }
    if (def.kind === 'weapon') {
      if (!this.weapons.includes(id)) { this.weapons.push(id); this.mags[id] = def.weapon!.mag > 0 ? Math.ceil(def.weapon!.mag * 0.6) : 0; }
      if (!this.equipped || this.equipped === 'pipe') this.equipped = id;
      bus.emit('inv'); return 0;
    }
    if (def.kind === 'upgrade') { if (id === 'backpack') this.capacity += 4; bus.emit('inv'); return 0; }
    let left = n;
    for (const s of this.slots) if (s.id === id && s.count < def.stack) { const k = Math.min(def.stack - s.count, left); s.count += k; left -= k; if (!left) break; }
    while (left > 0 && this.slots.length < this.capacity) { const k = Math.min(def.stack, left); this.slots.push({ id, count: k }); left -= k; }
    bus.emit('inv');
    return left;
  }

  remove(id: string, n = 1): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s.id !== id) continue;
      const k = Math.min(s.count, n); s.count -= k; n -= k;
      if (s.count <= 0) this.slots.splice(i, 1);
    }
    bus.emit('inv');
    return true;
  }

  removeKey(id: string) { this.keys = this.keys.filter((k) => k !== id); bus.emit('inv'); }

  canFit(id: string, n = 1) {
    const def = ITEMS[id];
    if (!def) return false;
    if (def.kind !== 'ammo' && def.kind !== 'health' && def.kind !== 'defense' && def.kind !== 'battery') return true;
    let room = 0;
    for (const s of this.slots) if (s.id === id) room += def.stack - s.count;
    room += (this.capacity - this.slots.length) * def.stack;
    return room >= n;
  }

  reserveAmmo(weapon: string) { const a = ITEMS[weapon]?.weapon?.ammo; return a ? this.count(a) : 0; }

  serialize() { return { slots: this.slots.map((s) => ({ ...s })), capacity: this.capacity, keys: [...this.keys], weapons: [...this.weapons], mags: { ...this.mags }, equipped: this.equipped, battery: this.battery }; }
  load(d: any) {
    this.slots = (d.slots || []).filter((s: Slot) => ITEMS[s.id]); this.capacity = d.capacity || 8; this.keys = d.keys || [];
    this.weapons = d.weapons || []; this.mags = d.mags || {}; this.equipped = d.equipped || ''; this.battery = d.battery ?? 1;
    bus.emit('inv');
  }
}
