/* Rectangular regions of the map: move or clear everything inside them. Pure over grid + tokens. */

import type { Token } from './data';
import { cellAt, type Cell, type Grid } from './grid';

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Normalises any two corners into an inclusive rect clipped to the grid. */
export function normalizeRect(grid: Grid, ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x0: Math.max(0, Math.min(ax, bx)), y0: Math.max(0, Math.min(ay, by)),
    x1: Math.min(grid.w - 1, Math.max(ax, bx)), y1: Math.min(grid.h - 1, Math.max(ay, by)),
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function rectArea(r: Rect): number {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

export function tokensIn(tokens: Token[], r: Rect): Token[] {
  return tokens.filter(t => rectContains(r, t.x, t.y));
}

export function countProps(grid: Grid, r: Rect): number {
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (cellAt(grid, x, y)?.p) n++;
  return n;
}

export type ClearWhat = 'props' | 'tokens' | 'structure' | 'all';

/**
 * Removes things inside the rect. 'structure' = walls and doors; 'all' = props,
 * tokens, walls and doors, leaving terrain and fog memory alone.
 * Returns the surviving token list.
 */
export function clearRegion(grid: Grid, tokens: Token[], r: Rect, what: ClearWhat): Token[] {
  const props = what === 'props' || what === 'all';
  const structure = what === 'structure' || what === 'all';
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const c = cellAt(grid, x, y);
      if (!c) continue;
      if (props) { c.p = null; c.link = null; c.loot = null; c.rot = 0; }
      if (structure) { c.w = false; c.d = false; c.secret = false; c.doOpen = false; }
    }
  }
  if (what === 'tokens' || what === 'all') return tokens.filter(t => !rectContains(r, t.x, t.y));
  return tokens;
}

/**
 * Moves everything in the rect by (dx, dy): terrain, walls, doors, props and
 * tokens. Source cells keep their terrain but lose walls, doors and props;
 * destination cells are overwritten. Parts that would land off the map are
 * dropped. Returns the moved rect.
 */
export function moveRegion(grid: Grid, tokens: Token[], r: Rect, dx: number, dy: number): Rect {
  if (dx === 0 && dy === 0) return r;
  const snapshot: { x: number; y: number; cell: Cell }[] = [];
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const c = cellAt(grid, x, y)!;
      snapshot.push({ x, y, cell: { ...c, link: c.link ? { ...c.link } : null, loot: c.loot ? { ...c.loot } : null } });
      c.w = false; c.d = false; c.secret = false; c.doOpen = false; c.p = null; c.link = null; c.loot = null; c.rot = 0;
    }
  }
  for (const s of snapshot) {
    const d = cellAt(grid, s.x + dx, s.y + dy);
    if (!d) continue;
    d.t = s.cell.t; d.w = s.cell.w; d.d = s.cell.d; d.secret = s.cell.secret; d.doOpen = s.cell.doOpen;
    d.p = s.cell.p; d.link = s.cell.link; d.loot = s.cell.loot; d.rot = s.cell.rot ?? 0;
  }
  for (const t of tokens) {
    if (!rectContains(r, t.x, t.y)) continue;
    const nx = t.x + dx, ny = t.y + dy;
    if (nx >= 0 && ny >= 0 && nx < grid.w && ny < grid.h) { t.x = nx; t.y = ny; }
  }
  return normalizeRect(grid, r.x0 + dx, r.y0 + dy, r.x1 + dx, r.y1 + dy);
}
