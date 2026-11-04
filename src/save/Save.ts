import { persist, forget } from '../platform/Native';
export interface SaveData {
  v: number;
  kind: 'manual' | 'auto';
  time: number;
  area: string;
  spawn: string | null;
  pos: [number, number] | null;
  yaw: number;
  hp: number;
  inv: any;
  flags: string[];
  killed: string[];
  docs: string[];
  objective: string;
  playtime: number;
  checksum?: number;
}

const KEYS = { manual: 'ugultu_save_manual_v1', auto: 'ugultu_save_auto_v1' };
const VERSION = 1;

function checksum(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * localStorage saves: a manual slot (radios) and an auto slot (area entry,
 * periodic checkpoints and app suspension). Corrupt/foreign data is rejected.
 */
export const Save = {
  write(d: Omit<SaveData, 'v' | 'time' | 'checksum'>) {
    const data: SaveData = { ...d, v: VERSION, time: Date.now() };
    const body = JSON.stringify(data);
    const wrapped = JSON.stringify({ ...data, checksum: checksum(body) });
    return persist(KEYS[d.kind], wrapped);
  },
  read(kind: 'manual' | 'auto'): SaveData | null {
    try {
      const raw = localStorage.getItem(KEYS[kind]);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      const { checksum: c, ...rest } = d;
      if (d.v !== VERSION || checksum(JSON.stringify(rest)) !== c) return null;
      return d;
    } catch { return null; }
  },
  latest(): SaveData | null {
    const a = this.read('manual'), b = this.read('auto');
    if (a && b) return a.time >= b.time ? a : b;
    return a || b;
  },
  clear() { forget(KEYS.manual); forget(KEYS.auto); },
};
