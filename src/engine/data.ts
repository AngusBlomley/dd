/* Static content definitions: terrains, props, token types. No DOM. */

export interface Terrain { id: string; name: string; color: string; group: 'built' | 'natural' | 'underdark' | 'liquid' | 'other' }
export interface LightSpec { bright: number; dim: number } // radii in cells

export type PropCategory = 'light' | 'blocking' | 'furniture' | 'underdark' | 'dungeon' | 'marker';

export interface Prop {
  id: string; name: string; icon: string;
  cat: PropCategory;
  light: LightSpec | null;
  blocksLOS: boolean; blocksMove: boolean;
}

export const TERRAINS: Terrain[] = [
  { id: 'stone',   name: 'Stone Floor',   color: '#8a8378', group: 'built' },
  { id: 'wood',    name: 'Wood Floor',    color: '#a2794f', group: 'built' },
  { id: 'tile',    name: 'Tiled Floor',   color: '#9a9184', group: 'built' },
  { id: 'cave',    name: 'Cave Floor',    color: '#5b5648', group: 'natural' },
  { id: 'rough',   name: 'Rough Cave',    color: '#4a4540', group: 'natural' },
  { id: 'dirt',    name: 'Dirt',          color: '#77593a', group: 'natural' },
  { id: 'grass',   name: 'Grass',         color: '#57813f', group: 'natural' },
  { id: 'sand',    name: 'Sand',          color: '#d3bd85', group: 'natural' },
  { id: 'mud',     name: 'Mud',           color: '#5a4a32', group: 'natural' },
  { id: 'fungus',  name: 'Fungus Floor',  color: '#5f6b4a', group: 'underdark' },
  { id: 'moss',    name: 'Moss',          color: '#3e5e3c', group: 'underdark' },
  { id: 'crystal', name: 'Crystal Floor', color: '#6f6aa6', group: 'underdark' },
  { id: 'faerzress', name: 'Faerzress',   color: '#7a4f9c', group: 'underdark' },
  { id: 'ice',     name: 'Ice',           color: '#a9c8d6', group: 'natural' },
  { id: 'shallow', name: 'Shallow Water', color: '#3f7a95', group: 'liquid' },
  { id: 'water',   name: 'Deep Water',    color: '#1f4a6b', group: 'liquid' },
  { id: 'lava',    name: 'Lava',          color: '#c1441c', group: 'liquid' },
  { id: 'chasm',   name: 'Chasm',         color: '#141216', group: 'other' },
  { id: 'void',    name: 'Void',          color: '#0c0a08', group: 'other' },
];
export const TERRAIN_MAP: Record<string, Terrain> = Object.fromEntries(TERRAINS.map(t => [t.id, t]));

const P = (id: string, name: string, icon: string, cat: PropCategory, opts: Partial<Prop> = {}): Prop => ({
  id, name, icon, cat, light: null, blocksLOS: false, blocksMove: false, ...opts,
});

export const PROPS: Prop[] = [
  // Light sources (5e radii in cells: torch 20/40 ft, lantern 30/60, candle 5/10)
  P('torch',      'Torch',            '\u{1F525}', 'light', { light: { bright: 4, dim: 8 } }),
  P('lantern',    'Lantern',          '\u{1F3EE}', 'light', { light: { bright: 6, dim: 12 } }),
  P('brazier',    'Brazier',          '\u{2668}\u{FE0F}', 'light', { light: { bright: 4, dim: 8 } }),
  P('campfire',   'Campfire',         '\u{1F3D5}\u{FE0F}', 'light', { light: { bright: 4, dim: 8 } }),
  P('candle',     'Candle',           '\u{1F56F}\u{FE0F}', 'light', { light: { bright: 1, dim: 2 } }),
  P('glowcrystal','Glowing Crystal',  '\u{1F48E}', 'light', { light: { bright: 2, dim: 4 } }),
  P('glowshroom', 'Glowing Fungi',    '\u{2728}', 'light', { light: { bright: 1, dim: 3 } }),
  // Blocks sight and movement
  P('pillar',     'Pillar',           '\u{1F532}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('statue',     'Statue',           '\u{1F5FF}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('boulder',    'Boulder',          '\u{1FAA8}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('stalagmite', 'Stalagmite',       '\u{1F5FB}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('bigshroom',  'Giant Mushroom',   '\u{1F344}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('bookshelf',  'Bookshelf',        '\u{1F4DA}', 'blocking', { blocksLOS: true, blocksMove: true }),
  P('tent',       'Tent',             '\u{26FA}', 'blocking', { blocksLOS: true, blocksMove: false }),
  // Furniture and loot
  P('chest',      'Chest',            '\u{1F4E6}', 'furniture'),
  P('crate',      'Crate',            '\u{1F5C3}\u{FE0F}', 'furniture'),
  P('table',      'Table',            '\u{25AC}', 'furniture'),
  P('bed',        'Bed',              '\u{1F6CF}\u{FE0F}', 'furniture'),
  P('barrel',     'Barrel',           '\u{1F6E2}\u{FE0F}', 'furniture'),
  P('cauldron',   'Cauldron',         '\u{1F372}', 'furniture'),
  P('anvil',      'Anvil / Forge',    '\u{2692}\u{FE0F}', 'furniture'),
  P('treasure',   'Treasure',         '\u{1F4B0}', 'furniture'),
  P('altar',      'Altar',            '\u{271D}\u{FE0F}', 'furniture'),
  P('cage',       'Cage',             '\u{26D3}\u{FE0F}', 'furniture'),
  // Underdark and caves
  P('rubble',     'Rubble',           '\u{26F0}\u{FE0F}', 'underdark'),
  P('bones',      'Bones',            '\u{2620}\u{FE0F}', 'underdark'),
  P('web',        'Web',              '\u{1F578}\u{FE0F}', 'underdark'),
  P('shroom',     'Mushrooms',        '\u{1F344}', 'underdark'),
  P('crystals',   'Crystals',         '\u{1F52E}', 'underdark'),
  P('pool',       'Pool',             '\u{1F4A7}', 'underdark'),
  P('boat',       'Boat',             '\u{1F6F6}', 'underdark'),
  P('bridge',     'Bridge',           '\u{1F309}', 'underdark'),
  P('rope',       'Rope',             '\u{1FAA2}', 'underdark'),
  P('cart',       'Cart',             '\u{1F6D2}', 'underdark'),
  // Dungeon features
  P('stairs_up',  'Stairs Up',        '\u{25B2}', 'dungeon'),
  P('stairs_down','Stairs Down',      '\u{25BC}', 'dungeon'),
  P('ladder',     'Ladder',           '\u{1FA9C}', 'dungeon'),
  P('trapdoor',   'Trapdoor',         '\u{25A3}', 'dungeon'),
  P('well',       'Well',             '\u{26F2}', 'dungeon'),
  P('lever',      'Lever',            '\u{1F39A}\u{FE0F}', 'dungeon'),
  P('trap',       'Trap',             '\u{26A0}\u{FE0F}', 'dungeon'),
  P('exit',       'Exit (to another map)', '\u{29C9}', 'dungeon'),
  P('entry',      'Entry (arrival point)', '\u{29C8}', 'dungeon'),
  // Markers
  P('marker_a',   'Marker A',         '\u{24B6}', 'marker'),
  P('marker_b',   'Marker B',         '\u{24B7}', 'marker'),
  P('marker_c',   'Marker C',         '\u{24B8}', 'marker'),
  P('question',   'Point of Interest','\u{2753}', 'marker'),
];
export const PROP_MAP: Record<string, Prop> = Object.fromEntries(PROPS.map(p => [p.id, p]));

export const PROP_CATEGORY_LABELS: Record<PropCategory, string> = {
  light: 'Light sources', blocking: 'Blocks sight', furniture: 'Furniture & loot',
  underdark: 'Caves & Underdark', dungeon: 'Dungeon features', marker: 'Markers',
};

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
  vision: { radius: number; darkvision: number }; // cells; darkvision 0 = none
  light: LightSpec | null;                        // carried light, if any
  hidden?: boolean;                               // DM-only, never shown to players
  role?: string;                                  // NPCs: what they are (innkeeper, guard captain…)
  trade?: string;                                 // NPCs: what they offer, shown to players
}

/** Props that can carry a description and be picked up by players. */
export const LOOT_PROPS = new Set(['chest', 'treasure', 'crate', 'barrel']);

/** 5e defaults in cells (5 ft each). */
export const DEFAULT_VISION_RADIUS = 12;   // 60 ft
export const DARKVISION_OPTIONS = [0, 6, 12, 24]; // none, 30, 60, 120 ft
export const DEFAULT_TOKEN_LIGHT: LightSpec = { bright: 4, dim: 8 }; // torch
