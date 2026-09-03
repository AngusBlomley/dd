/* Line of sight. Phase 0 keeps prototype 1's Bresenham approach unchanged.
   Phase 1 replaces this with symmetric shadowcasting (spec B2). */

import { PROP_MAP } from './data';
import { cellAt, type Cell, type Grid } from './grid';

export function isOpaque(cell: Cell | null): boolean {
  if (!cell) return true;
  if (cell.w) return true;
  if (cell.d && !cell.doOpen) return true;
  if (cell.p && PROP_MAP[cell.p] && PROP_MAP[cell.p].blocksLOS) return true;
  return false;
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
}

export function cellKey(x: number, y: number): string {
  return x + ',' + y;
}

/** Set of "x,y" keys visible from (ox,oy) within radius cells, respecting opaque cells. */
export function computeVisibility(grid: Grid, ox: number, oy: number, radius: number): Set<string> {
  const visible = new Set<string>();
  if (radius <= 0) { visible.add(cellKey(ox, oy)); return visible; }
  const r2 = (radius + 0.4) * (radius + 0.4);
  const minX = Math.max(0, ox - radius), maxX = Math.min(grid.w - 1, ox + radius);
  const minY = Math.max(0, oy - radius), maxY = Math.min(grid.h - 1, oy + radius);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const dx = tx - ox, dy = ty - oy;
      if (dx * dx + dy * dy > r2) continue;
      const line = bresenhamLine(ox, oy, tx, ty);
      let blocked = false;
      for (let i = 1; i < line.length - 1; i++) {
        if (isOpaque(cellAt(grid, line[i][0], line[i][1]))) { blocked = true; break; }
      }
      if (!blocked) visible.add(cellKey(tx, ty));
    }
  }
  return visible;
}
