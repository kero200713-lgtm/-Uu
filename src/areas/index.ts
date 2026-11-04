import type { AreaDef } from '../world/types';
import { forest } from './forest';
import { town } from './town';
import { clinic } from './clinic';
import { mine } from './mine';
import { facility } from './facility';
import { choir } from './choir';

export const AREAS: Record<string, AreaDef> = { forest, town, clinic, mine, facility, choir };
