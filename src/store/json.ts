/* Map serialisation. The JSON shape matches prototype 1 exports so old files import. */

import type { Token } from '../engine/data';
import type { Cell, Grid } from '../engine/grid';

export interface MapFile {
  gridW: number;
  gridH: number;
  cells: Cell[];
  tokens: Token[];
  nextTokenId: number;
  savedAt: number;
}

export function serializeMap(grid: Grid, tokens: Token[], nextTokenId: number): MapFile {
  return { gridW: grid.w, gridH: grid.h, cells: grid.cells, tokens, nextTokenId, savedAt: Date.now() };
}

export interface ParsedMap { grid: Grid; tokens: Token[]; nextTokenId: number }

export function parseMap(data: Partial<MapFile>): ParsedMap {
  if (!data || typeof data.gridW !== 'number' || typeof data.gridH !== 'number' || !Array.isArray(data.cells)) {
    throw new Error('Not a map file');
  }
  const cells: Cell[] = data.cells.map(c => ({
    t: c.t, w: !!c.w, d: !!c.d, doOpen: !!c.doOpen, p: c.p || null, ex: !!c.ex,
  }));
  const tokens: Token[] = (data.tokens || []).map(t => ({ ...t }));
  return {
    grid: { w: data.gridW, h: data.gridH, cells },
    tokens,
    nextTokenId: data.nextTokenId || (tokens.length + 1),
  };
}
