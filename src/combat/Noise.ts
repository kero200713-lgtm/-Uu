import * as THREE from 'three';

export interface NoiseEvent { pos: THREE.Vector3; radius: number; kind: string; t: number; fromPlayer: boolean }

/**
 * Sound propagation for AI. Gameplay emits events (footsteps, shots, doors,
 * flares); enemies poll the recent ones within their hearing range.
 * Radii are attenuated by walls when heard (see Enemy.hear()).
 */
class NoiseSystem {
  events: NoiseEvent[] = [];
  time = 0;
  emit(pos: THREE.Vector3, radius: number, kind: string, fromPlayer = true) {
    this.events.push({ pos: pos.clone(), radius, kind, t: this.time, fromPlayer });
    if (this.events.length > 48) this.events.shift();
  }
  update(dt: number) {
    this.time += dt;
    this.events = this.events.filter((e) => this.time - e.t < 0.6);
  }
  clear() { this.events = []; }
}

export const noise = new NoiseSystem();
