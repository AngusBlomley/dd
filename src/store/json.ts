/* Map serialisation. Reads prototype-1 exports (v1 token shape) and the current shape. */

import type { Token } from '../engine/data';
import type { Cell, CellMemory, Grid } from '../engine/grid';

export const MAP_FORMAT = 3;

export interface MapFile {
  format: number;
  gridW: number;
  gridH: number;
  cells: Cell[];
  tokens: Token[];
  nextTokenId: number;
  savedAt: number;
}

export function serializeMap(grid: Grid, tokens: Token[], nextTokenId: number): MapFile {
  return { format: MAP_FORMAT, gridW: grid.w, gridH: grid.h, cells: grid.cells, tokens, nextTokenId, savedAt: Date.now() };
}

export interface ParsedMap { grid: Grid; tokens: Token[]; nextTokenId: number }

/** Prototype 1 cell: explored was a flag, so memory is reconstructed from the cell itself. */
interface LegacyCell { t: string; w?: boolean; d?: boolean; doOpen?: boolean; p?: string | null; ex?: boolean; mem?: CellMemory | null }

function migrateCell(c: LegacyCell): Cell {
  const cell: Cell = { t: c.t, w: !!c.w, d: !!c.d, doOpen: !!c.doOpen, p: c.p || null, mem: null };
  if (c.mem) cell.mem = { t: c.mem.t, w: !!c.mem.w, d: !!c.mem.d, doOpen: !!c.mem.doOpen, p: c.mem.p || null };
  else if (c.ex) cell.mem = { t: cell.t, w: cell.w, d: cell.d, doOpen: cell.doOpen, p: cell.p };
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
  };
}

export function parseMap(data: Partial<MapFile>): ParsedMap {
  if (!data || typeof data.gridW !== 'number' || typeof data.gridH !== 'number' || !Array.isArray(data.cells)) {
    throw new Error('Not a map file');
  }
  const cells: Cell[] = data.cells.map(c => migrateCell(c as LegacyCell));
  const tokens: Token[] = (data.tokens || []).map(t => migrateToken(t as Token | LegacyToken));
  return {
    grid: { w: data.gridW, h: data.gridH, cells },
    tokens,
    nextTokenId: data.nextTokenId || (tokens.length + 1),
  };
}
