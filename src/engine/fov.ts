/* Field of view by symmetric shadowcasting (Albert Ford's algorithm).
   Symmetric: if a floor cell A can see floor cell B, then B can see A.
   One extra rule for square-cell walls: sight does not squeeze diagonally
   between two wall cells that touch only at a corner. */

import { PROP_MAP } from './data';
import { cellAt, type Cell, type Grid } from './grid';

export function isOpaque(cell: Cell | null): boolean {
  if (!cell) return true;
  if (cell.w) return true;
  if (cell.d && !cell.doOpen) return true;
  if (cell.p && PROP_MAP[cell.p] && PROP_MAP[cell.p].blocksLOS) return true;
  return false;
}

/** A visibility mask: one byte per cell, 1 = visible. */
export type Mask = Uint8Array;

export function emptyMask(grid: Grid): Mask {
  return new Uint8Array(grid.w * grid.h);
}

// Quadrant transforms from (depth, col) in quadrant space to grid coordinates.
const QUADRANTS: ((ox: number, oy: number, depth: number, col: number) => [number, number])[] = [
  (ox, oy, d, c) => [ox + c, oy - d], // north
  (ox, oy, d, c) => [ox + c, oy + d], // south
  (ox, oy, d, c) => [ox + d, oy + c], // east
  (ox, oy, d, c) => [ox - d, oy + c], // west
];

/**
 * Marks every cell visible from (ox, oy) within `radius` cells into `out`
 * (allocating a new mask when none is given). Opaque cells that are in view
 * are marked too: you can see the wall you are looking at.
 */
export function computeFov(grid: Grid, ox: number, oy: number, radius: number, out?: Mask): Mask {
  const mask = out ?? emptyMask(grid);
  const w = grid.w;
  const r2 = (radius + 0.5) * (radius + 0.5);
  const blockedAt = (x: number, y: number) => isOpaque(cellAt(grid, x, y));

  if (ox < 0 || oy < 0 || ox >= grid.w || oy >= grid.h) return mask;
  mask[oy * w + ox] = 1;
  if (radius <= 0) return mask;

  for (const transform of QUADRANTS) {
    const inRadius = (d: number, c: number) => d * d + c * c <= r2;
    const wallAt = (d: number, c: number) => {
      const [x, y] = transform(ox, oy, d, c);
      return blockedAt(x, y);
    };
    // Corner rule: the extreme diagonal tile of a row is treated as blocked
    // when both cells that share its inner corner are walls.
    const cornerBlocked = (d: number, c: number) => {
      if (Math.abs(c) !== d || d === 0) return false;
      const inner = c > 0 ? c - 1 : c + 1;
      return wallAt(d - 1, c) && wallAt(d, inner);
    };
    const isWall = (d: number, c: number) => wallAt(d, c) || cornerBlocked(d, c);
    const reveal = (d: number, c: number) => {
      if (!inRadius(d, c) || cornerBlocked(d, c)) return;
      const [x, y] = transform(ox, oy, d, c);
      if (x >= 0 && y >= 0 && x < grid.w && y < grid.h) mask[y * w + x] = 1;
    };

    // Slopes are rationals n/2 (Ford's "Fraction(2*col-1, 2*depth)" scaled by depth is
    // handled by comparing col*den against depth*num). Store as [num, den].
    const scan = (depth: number, startN: number, startD: number, endN: number, endD: number): void => {
      if (depth > radius) return;
      // min_col = round_ties_up(depth * start), max_col = round_ties_down(depth * end)
      const minCol = Math.floor((2 * depth * startN + startD) / (2 * startD));
      const maxCol = Math.ceil((2 * depth * endN - endD) / (2 * endD));
      let prevWall: boolean | null = null;
      let curStartN = startN, curStartD = startD;
      for (let col = minCol; col <= maxCol; col++) {
        const wall = isWall(depth, col);
        // symmetric check: start <= col/depth <= end
        const symmetric = col * curStartD >= depth * curStartN && col * endD <= depth * endN;
        if (wall || symmetric) reveal(depth, col);
        if (prevWall === true && !wall) {
          // slope of this tile: (2*col - 1) / (2*depth)
          curStartN = 2 * col - 1; curStartD = 2 * depth;
        }
        if (prevWall === false && wall) {
          scan(depth + 1, curStartN, curStartD, 2 * col - 1, 2 * depth);
        }
        prevWall = wall;
      }
      if (prevWall === false) scan(depth + 1, curStartN, curStartD, endN, endD);
    };
    scan(1, -1, 1, 1, 1);
  }
  return mask;
}
