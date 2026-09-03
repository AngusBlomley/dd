/* Static content definitions: terrains, props, token types. No DOM. */

export interface Terrain { id: string; name: string; color: string }
export interface Prop {
  id: string; name: string; icon: string;
  light: boolean; radius?: number;
  blocksLOS: boolean; blocksMove: boolean;
}

export const TERRAINS: Terrain[] = [
  { id: 'stone', name: 'Stone Floor', color: '#8a8378' },
  { id: 'wood',  name: 'Wood Floor',  color: '#a2794f' },
  { id: 'grass', name: 'Grass',       color: '#57813f' },
  { id: 'dirt',  name: 'Dirt',        color: '#77593a' },
  { id: 'sand',  name: 'Sand',        color: '#d3bd85' },
  { id: 'water', name: 'Water',       color: '#356e9c' },
  { id: 'lava',  name: 'Lava',        color: '#c1441c' },
  { id: 'cave',  name: 'Cave Floor',  color: '#5b5648' },
  { id: 'void',  name: 'Void',        color: '#0c0a08' },
];
export const TERRAIN_MAP: Record<string, Terrain> = Object.fromEntries(TERRAINS.map(t => [t.id, t]));

export const PROPS: Prop[] = [
  { id: 'torch',       name: 'Torch',       icon: '\u{1F525}', light: true, radius: 4, blocksLOS: false, blocksMove: false },
  { id: 'pillar',      name: 'Pillar',      icon: '\u{1F532}', light: false, blocksLOS: true,  blocksMove: true },
  { id: 'statue',      name: 'Statue',      icon: '\u{1F5FF}', light: false, blocksLOS: true,  blocksMove: true },
  { id: 'chest',       name: 'Chest',       icon: '\u{1F4E6}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'table',       name: 'Table',       icon: '▬',    light: false, blocksLOS: false, blocksMove: false },
  { id: 'barrel',      name: 'Barrel',      icon: '\u{1F6E2}\u{FE0F}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'stairs_up',   name: 'Stairs Up',   icon: '▲',    light: false, blocksLOS: false, blocksMove: false },
  { id: 'stairs_down', name: 'Stairs Down', icon: '▼',    light: false, blocksLOS: false, blocksMove: false },
  { id: 'treasure',    name: 'Treasure',    icon: '\u{1F4B0}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'rubble',      name: 'Rubble',      icon: '⛰\u{FE0F}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'altar',       name: 'Altar',       icon: '✝\u{FE0F}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'bones',       name: 'Bones',       icon: '☠\u{FE0F}', light: false, blocksLOS: false, blocksMove: false },
  { id: 'web',         name: 'Web',         icon: '\u{1F578}\u{FE0F}', light: false, blocksLOS: false, blocksMove: false },
];
export const PROP_MAP: Record<string, Prop> = Object.fromEntries(PROPS.map(p => [p.id, p]));

export type TokenType = 'pc' | 'npc' | 'monster' | 'object';
export const TOKEN_TYPE_COLORS: Record<TokenType, string> = {
  pc: '#4f8a79', npc: '#3f6fae', monster: '#a13a2d', object: '#8a7a4a',
};

export interface Token {
  id: number;
  name: string;
  type: TokenType;
  x: number;
  y: number;
  color: string;
  size: number;
  vision: number;
  darkvision: boolean;
  hasLight: boolean;
  lightRadius: number;
}
