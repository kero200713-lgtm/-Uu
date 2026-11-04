/**
 * Procedural sound: infinite, non-repeating ambience beds and UI sounds
 * synthesised at runtime (zero download, no license concerns).
 */
export class Procedural {
  private noise: AudioBuffer;
  private beds = new Map<string, { nodes: AudioNode[]; gain: GainNode; stop: () => void }>();
  heart: { gain: GainNode; timer: number; rate: number } | null = null;

  constructor(private ctx: AudioContext, private amb: GainNode, private ui: GainNode) {
    const n = ctx.sampleRate * 4;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3.5; }
  }

  private noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); return s; }

  /** Starts (or retargets) a named ambience bed. level 0..1 */
  bed(name: 'wind' | 'room' | 'drone' | 'cave' | 'machine' | 'static', level: number, fade = 2) {
    const c = this.ctx, t = c.currentTime;
    let b = this.beds.get(name);
    if (!b) {
      if (level <= 0) return;
      const gain = c.createGain(); gain.gain.value = 0; gain.connect(this.amb);
      const nodes: AudioNode[] = [];
      const stops: (() => void)[] = [];
      if (name === 'wind' || name === 'room' || name === 'cave' || name === 'static') {
        const src = this.noiseSrc();
        const f = c.createBiquadFilter();
        f.type = name === 'wind' ? 'bandpass' : 'lowpass';
        f.frequency.value = name === 'wind' ? 420 : name === 'room' ? 180 : name === 'static' ? 3200 : 110;
        f.Q.value = name === 'wind' ? 0.6 : 0.4;
        if (name === 'static') f.type = 'bandpass';
        const lfo = c.createOscillator(); const lg = c.createGain();
        lfo.frequency.value = name === 'wind' ? 0.09 : 0.03; lg.gain.value = name === 'wind' ? 260 : 40;
        lfo.connect(lg).connect(f.frequency);
        const lfo2 = c.createOscillator(); const lg2 = c.createGain(); const vg = c.createGain(); vg.gain.value = 0.6;
        lfo2.frequency.value = name === 'wind' ? 0.13 : 0.05; lg2.gain.value = name === 'wind' ? 0.4 : 0.15;
        lfo2.connect(lg2).connect(vg.gain);
        src.connect(f).connect(vg).connect(gain);
        src.start(); lfo.start(); lfo2.start();
        nodes.push(src, f, lfo, lfo2, vg);
        stops.push(() => { src.stop(); lfo.stop(); lfo2.stop(); });
      }
      if (name === 'drone' || name === 'cave' || name === 'machine') {
        const freqs = name === 'machine' ? [50, 100, 150.5] : name === 'cave' ? [41.2, 61.7, 82.6] : [55, 82.4, 110.3, 164.6];
        for (const fr of freqs) {
          const o = c.createOscillator(); o.type = name === 'machine' ? 'sawtooth' : 'sine';
          o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.004);
          const og = c.createGain(); og.gain.value = name === 'machine' ? 0.05 : 0.12 / freqs.length * 3;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = name === 'machine' ? 300 : 600;
          const lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = 0.05 + Math.random() * 0.1; lg.gain.value = og.gain.value * 0.6;
          lfo.connect(lg).connect(og.gain);
          o.connect(lp).connect(og).connect(gain); o.start(); lfo.start();
          nodes.push(o, og, lp, lfo);
          stops.push(() => { o.stop(); lfo.stop(); });
        }
      }
      b = { nodes, gain, stop: () => stops.forEach((s) => s()) };
      this.beds.set(name, b);
    }
    const lv = name === 'static' ? level * 0.15 : name === 'room' ? level * 0.5 : name === 'machine' ? level * 0.6 : level;
    b.gain.gain.cancelScheduledValues(t);
    b.gain.gain.setValueAtTime(b.gain.gain.value, t);
    b.gain.gain.linearRampToValueAtTime(lv, t + fade);
    if (level <= 0) {
      const bb = b;
      setTimeout(() => { if (bb.gain.gain.value < 0.001) { bb.stop(); bb.gain.disconnect(); this.beds.delete(name); } }, fade * 1000 + 200);
    }
  }

  stopAllBeds(fade = 1.5) { for (const k of [...this.beds.keys()]) this.bed(k as any, 0, fade); }

  /** Heartbeat that speeds up with danger; volume 0 disables. */
  heartbeat(dt: number, intensity: number) {
    const c = this.ctx;
    if (!this.heart) { const g = c.createGain(); g.connect(this.amb); this.heart = { gain: g, timer: 0, rate: 1 }; }
    const h = this.heart;
    h.gain.gain.value = intensity * 0.9;
    if (intensity < 0.05) return;
    h.timer -= dt;
    if (h.timer <= 0) {
      const bpm = 62 + intensity * 70;
      h.timer = 60 / bpm;
      const t = c.currentTime;
      for (const [off, amp] of [[0, 1], [0.16, 0.6]] as [number, number][]) {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(62, t + off); o.frequency.exponentialRampToValueAtTime(38, t + off + 0.14);
        const g = c.createGain(); g.gain.setValueAtTime(0, t + off); g.gain.linearRampToValueAtTime(amp * 0.6, t + off + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.18);
        o.connect(g).connect(h.gain); o.start(t + off); o.stop(t + off + 0.22);
      }
    }
  }

  click(freq = 1400, vol = 0.12, dur = 0.04) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.ui); o.start(t); o.stop(t + dur + 0.02);
  }

  rustle(vol = 0.25, dur = 0.35) {
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 5; i++) { const tt = t + (i / 5) * dur; g.gain.linearRampToValueAtTime(vol * (0.4 + Math.random() * 0.6), tt + 0.01); g.gain.linearRampToValueAtTime(vol * 0.1, tt + dur / 5); }
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    s.connect(f).connect(g).connect(this.ui); s.start(t); s.stop(t + dur + 0.1);
  }

  /** Short radio-noise burst used for tapes and the save radio. */
  staticBurst(vol = 0.2, dur = 0.6) {
    const c = this.ctx, t = c.currentTime;
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f).connect(g).connect(this.ui); s.start(t); s.stop(t + dur + 0.05);
  }
}
