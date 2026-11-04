export type XY = [number, number];
export type Loc = { tr: string; en: string };

export interface LightDef {
  type: 'light'; at: XY; h?: number; color?: number; intensity?: number; range?: number;
  flicker?: 'none' | 'flicker' | 'pulse' | 'broken' | 'strobe'; model?: string | null; cone?: boolean; bake?: number; id?: string; off?: boolean;
}
export interface PropDef { type: 'prop'; pack: string; name: string; at: XY; rot?: number; scale?: number; h?: number; solid?: boolean; sight?: boolean; tilt?: number }
export interface ScatterDef { type: 'scatter'; pack: string; names: string[]; rect: [number, number, number, number]; count: number; on?: string; scale?: [number, number]; solid?: boolean; seed?: number; tint?: boolean }
export interface ItemDef { type: 'item'; id: string; item: string; count?: number; at: XY; h?: number; rot?: number }
export interface DocDef { type: 'doc'; id: string; doc: string; at: XY; h?: number; rot?: number }
export interface DoorDef { type: 'door'; at: XY; lock?: string; kind?: 'wood' | 'metal' | 'gate'; id?: string; msg?: Loc; open?: boolean; consume?: boolean; jammed?: Loc }
export interface ExitDef { type: 'exit'; at: XY; to: string; spawn: string; lock?: string; kind?: 'door' | 'gate' | 'path' | 'elevator' | 'ladder'; prompt?: Loc; flag?: string; needFlag?: string; needMsg?: Loc; consume?: boolean; dir?: number }
export interface SpawnDef { type: 'spawn'; id: string; at: XY; dir?: number }
export interface EnemyDef {
  type: 'enemy'; id: string; kind: 'hollow' | 'lurker' | 'husk' | 'listener'; at: XY; dir?: number; patrol?: XY[];
  variant?: string; pose?: 'lying' | 'sitting' | 'standing' | 'eating' | 'wall'; needFlag?: string; dormant?: boolean;
}
export interface SaveDef { type: 'save'; at: XY; dir?: number; id: string }
export interface TriggerDef { type: 'trigger'; id: string; rect: [number, number, number, number]; script: string; once?: boolean; needFlag?: string }
export interface InteractDef { type: 'interact'; id: string; at: XY; prompt: Loc; script: string; model?: { pack: string; name: string; rot?: number; scale?: number; h?: number; solid?: boolean }; radius?: number; needFlag?: string; hideFlag?: string; hold?: number }
export interface SoundDef { type: 'sound'; at: XY; name: string; volume?: number; radius?: number; h?: number; procedural?: string }

export type EntityDef = LightDef | PropDef | ScatterDef | ItemDef | DocDef | DoorDef | ExitDef | SpawnDef | EnemyDef | SaveDef | TriggerDef | InteractDef | SoundDef;

export interface AreaEnv {
  fog: number; fogDensity: number; ambient: number; hemiSky: number; hemiGround: number; hemiIntensity: number;
  moon?: { color: number; intensity: number; dir: [number, number, number] };
  rain?: number; wind?: number; dust?: number; ambience: string[]; outdoor: boolean;
  exposure?: number; sat?: number; tint?: [number, number, number]; music?: string | null;
  sky?: number; lightning?: boolean; humLevel?: number;
}

export interface AreaDef {
  id: string;
  name: Loc;
  subtitle?: Loc;
  grid: string[];
  tile?: number;
  wallHeight?: number;
  ceiling?: number;
  defaultWall?: string;
  voidFill?: 'trees' | 'rock' | 'none';
  env: AreaEnv;
  entities: EntityDef[];
  onEnter?: string;
}
