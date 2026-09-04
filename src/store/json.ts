/* Map and campaign serialisation. Reads every earlier format:
   - prototype 1 (v1): no format field, explored flag, legacy token shape
   - v2: new token shape, explored flag
   - v3: memory snapshots
   - v4: secret doors, campaign files */

import type { Token } from '../engine/data';
import type { Cell, CellMemory, Grid, Loot, MapLink } from '../engine/grid';

export const MAP_FORMAT = 4;
export const CAMPAIGN_FORMAT = 1;

export interface MapFile {
  format: number;
  id?: string;
  name?: string;
  nextMapId?: string | null;
  lit?: boolean;
  gridW: number;
  gridH: number;
  cells: Cell[];
  tokens: Token[];
  nextTokenId: number;
  savedAt: number;
}

export interface MapRecord {
  id: string;
  name: string;
  nextMapId?: string | null; // where unlinked exits lead
  lit?: boolean;             // daylight: every cell counts as bright and sight is limited only by walls
  grid: Grid;
  tokens: Token[];
  nextTokenId: number;
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeMapId: string;
  maps: MapRecord[];
}

export interface CampaignFile {
  kind: 'campaign';
  format: number;
  campaign: { id: string; name: string; createdAt: number; updatedAt: number; activeMapId: string; maps: MapFile[] };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function serializeMap(map: MapRecord): MapFile {
  return {
    format: MAP_FORMAT, id: map.id, name: map.name, nextMapId: map.nextMapId ?? null, lit: !!map.lit,
    gridW: map.grid.w, gridH: map.grid.h, cells: map.grid.cells,
    tokens: map.tokens, nextTokenId: map.nextTokenId, savedAt: Date.now(),
  };
}

export function serializeCampaign(c: Campaign): CampaignFile {
  return {
    kind: 'campaign', format: CAMPAIGN_FORMAT,
    campaign: { id: c.id, name: c.name, createdAt: c.createdAt, updatedAt: c.updatedAt, activeMapId: c.activeMapId, maps: c.maps.map(serializeMap) },
  };
}

/* ---------- migration ---------- */

interface LegacyCell { t: string; w?: boolean; d?: boolean; doOpen?: boolean; secret?: boolean; p?: string | null; link?: MapLink | null; loot?: Partial<Loot> | null; rot?: number; ex?: boolean; mem?: Partial<CellMemory> | null }

function migrateCell(c: LegacyCell): Cell {
  const cell: Cell = { t: c.t || 'void', w: !!c.w, d: !!c.d, doOpen: !!c.doOpen, secret: !!c.secret, p: c.p || null, mem: null };
  if (c.link && typeof c.link.mapId === 'string') cell.link = { mapId: c.link.mapId, x: c.link.x | 0, y: c.link.y | 0 };
  if (c.loot && (c.loot.title || c.loot.text)) cell.loot = { title: String(c.loot.title || ''), text: String(c.loot.text || ''), pickup: !!c.loot.pickup };
  if (typeof c.rot === 'number' && c.rot) cell.rot = ((c.rot % 4) + 4) % 4;
  if (c.mem) cell.mem = { t: c.mem.t || cell.t, w: !!c.mem.w, d: !!c.mem.d, doOpen: !!c.mem.doOpen, p: c.mem.p || null, secret: !!c.mem.secret, rot: c.mem.rot ?? 0 };
  else if (c.ex) cell.mem = { t: cell.t, w: cell.w, d: cell.d, doOpen: cell.doOpen, p: cell.p, secret: cell.secret, rot: cell.rot ?? 0 };
  return cell;
}

/** Prototype 1 token: vision was a number, darkvision a flag, light a flag + radius. */
interface LegacyToken {
  id: number; name: string; type: Token['type']; x: number; y: number; color: string; size: number;
  vision: number; darkvision: boolean; hasLight: boolean; lightRadius: number;
}

function migrateToken(raw: Token | LegacyToken): Token {
  if (typeof raw.vision === 'number') {
    const t = raw as LegacyToken;
    return {
      id: t.id, name: t.name, type: t.type, x: t.x, y: t.y, color: t.color, size: t.size,
      vision: { radius: t.vision, darkvision: t.darkvision ? t.vision : 0 },
      light: t.hasLight ? { bright: t.lightRadius || 4, dim: (t.lightRadius || 4) * 2 } : null,
    };
  }
  const t = raw as Token;
  return {
    ...t,
    vision: { radius: t.vision?.radius ?? 12, darkvision: t.vision?.darkvision ?? 0 },
    light: t.light ? { bright: t.light.bright, dim: t.light.dim } : null,
    role: typeof t.role === 'string' ? t.role : undefined,
    trade: typeof t.trade === 'string' ? t.trade : undefined,
  };
}

export function parseMap(data: Partial<MapFile>, fallbackName = 'Untitled map'): MapRecord {
  if (!data || typeof data.gridW !== 'number' || typeof data.gridH !== 'number' || !Array.isArray(data.cells)) {
    throw new Error('Not a map file');
  }
  const cells: Cell[] = data.cells.map(c => migrateCell(c as LegacyCell));
  const tokens: Token[] = (data.tokens || []).map(t => migrateToken(t as Token | LegacyToken));
  return {
    id: data.id || newId(),
    name: data.name || fallbackName,
    nextMapId: typeof data.nextMapId === 'string' ? data.nextMapId : null,
    lit: !!data.lit,
    grid: { w: data.gridW, h: data.gridH, cells },
    tokens,
    nextTokenId: data.nextTokenId || (tokens.length + 1),
  };
}

export function isCampaignFile(data: unknown): data is CampaignFile {
  return !!data && typeof data === 'object' && (data as CampaignFile).kind === 'campaign';
}

export function parseCampaign(data: CampaignFile): Campaign {
  const c = data.campaign;
  if (!c || !Array.isArray(c.maps)) throw new Error('Not a campaign file');
  const maps = c.maps.map((m, i) => parseMap(m, 'Map ' + (i + 1)));
  if (maps.length === 0) throw new Error('Campaign has no maps');
  return {
    id: c.id || newId(),
    name: c.name || 'Imported campaign',
    createdAt: c.createdAt || Date.now(),
    updatedAt: c.updatedAt || Date.now(),
    activeMapId: maps.some(m => m.id === c.activeMapId) ? c.activeMapId : maps[0].id,
    maps,
  };
}
