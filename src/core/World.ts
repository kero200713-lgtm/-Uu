import type * as THREE from 'three';
import type { Level } from '../world/Level';
import type { FX } from '../combat/FX';

/** The slice of game state other systems may use (avoids import cycles). */
export interface PlayerLike {
  pos: THREE.Vector3;
  yaw: number;
  crouching: boolean;
  running: boolean;
  dead: boolean;
  hp: number;
  flashOn: boolean;
  grabbedBy: any;
  invulnerable: number;
  damage(amount: number, from: THREE.Vector3, opts?: { knock?: boolean; kind?: string }): void;
  startGrab(enemy: any): boolean;
  litLevel(): number;
}

export interface World {
  level: Level;
  player: PlayerLike;
  fx: FX;
  camPos: THREE.Vector3;
  time: number;
  flags: Set<string>;
  onEnemyKilled(id: string): void;
  hudMessage(text: string): void;
}
