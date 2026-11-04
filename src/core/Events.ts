type Handler = (...args: any[]) => void;

/** Minimal event bus used to decouple systems (UI <-> gameplay <-> audio). */
export class Events {
  private map = new Map<string, Set<Handler>>();
  on(name: string, fn: Handler): () => void {
    let s = this.map.get(name);
    if (!s) this.map.set(name, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  }
  emit(name: string, ...args: any[]) {
    const s = this.map.get(name);
    if (s) for (const fn of [...s]) fn(...args);
  }
  clear() { this.map.clear(); }
}

export const bus = new Events();
