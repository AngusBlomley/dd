import { describe, expect, it } from 'vitest';
import { computeFov, isOpaque } from '../src/engine/fov';
import { cellAt, createGrid, newCell, type Grid } from '../src/engine/grid';

const sees = (grid: Grid, ox: number, oy: number, r: number, x: number, y: number) =>
  computeFov(grid, ox, oy, r)[y * grid.w + x] === 1;

describe('isOpaque', () => {
  it('treats out-of-bounds, walls, closed doors and sight-blocking props as opaque', () => {
    expect(isOpaque(null)).toBe(true);
    expect(isOpaque({ ...newCell('stone'), w: true })).toBe(true);
    expect(isOpaque({ ...newCell('stone'), d: true, doOpen: false })).toBe(true);
    expect(isOpaque({ ...newCell('stone'), d: true, doOpen: true })).toBe(false);
    expect(isOpaque({ ...newCell('stone'), p: 'pillar' })).toBe(true);
    expect(isOpaque({ ...newCell('stone'), p: 'torch' })).toBe(false);
    expect(isOpaque(newCell('stone'))).toBe(false);
  });
});

describe('computeFov (symmetric shadowcasting)', () => {
  it('sees only its own cell with radius 0', () => {
    const grid = createGrid(5, 5, 'stone');
    const m = computeFov(grid, 2, 2, 0);
    expect(Array.from(m).filter(Boolean).length).toBe(1);
    expect(m[2 * 5 + 2]).toBe(1);
  });

  it('sees a full circle in an open room and nothing beyond the radius', () => {
    const grid = createGrid(21, 21, 'stone');
    const m = computeFov(grid, 10, 10, 5);
    expect(m[10 * 21 + 15]).toBe(1); // 5 east
    expect(m[10 * 21 + 16]).toBe(0); // 6 east
    expect(m[5 * 21 + 10]).toBe(1);  // 5 north
    expect(m[13 * 21 + 13]).toBe(1); // (3,3) diag: dist 4.24
    expect(m[14 * 21 + 14]).toBe(0); // (4,4) diag: dist 5.66
  });

  it('is blocked by a wall but still sees the wall itself', () => {
    const grid = createGrid(9, 3, 'stone');
    cellAt(grid, 4, 1)!.w = true;
    expect(sees(grid, 1, 1, 8, 4, 1)).toBe(true);
    expect(sees(grid, 1, 1, 8, 5, 1)).toBe(false);
    expect(sees(grid, 1, 1, 8, 7, 1)).toBe(false);
  });

  it('sees through an open door but not a closed one', () => {
    const grid = createGrid(9, 3, 'stone');
    const door = cellAt(grid, 4, 1)!;
    door.d = true; door.doOpen = false;
    expect(sees(grid, 1, 1, 8, 6, 1)).toBe(false);
    door.doOpen = true;
    expect(sees(grid, 1, 1, 8, 6, 1)).toBe(true);
  });

  it('a pillar blocks sight behind it but not beside it', () => {
    const grid = createGrid(9, 5, 'stone');
    cellAt(grid, 4, 2)!.p = 'pillar';
    expect(sees(grid, 1, 2, 8, 7, 2)).toBe(false);
    expect(sees(grid, 1, 2, 8, 7, 0)).toBe(true);
  });

  // Spec acceptance test 3
  it('does not leak sight diagonally between two walls that touch at a corner', () => {
    const grid = createGrid(7, 7, 'stone');
    // viewer at (1,1); walls at (2,1) and (1,2) share the corner with (2,2)
    cellAt(grid, 2, 1)!.w = true;
    cellAt(grid, 1, 2)!.w = true;
    expect(sees(grid, 1, 1, 6, 2, 2)).toBe(false);
    expect(sees(grid, 1, 1, 6, 3, 3)).toBe(false);
    expect(sees(grid, 1, 1, 6, 3, 2)).toBe(false);
    // and the other way round
    expect(sees(grid, 2, 2, 6, 1, 1)).toBe(false);
  });

  it('does see diagonally when only one of the corner cells is a wall', () => {
    const grid = createGrid(7, 7, 'stone');
    cellAt(grid, 2, 1)!.w = true;
    expect(sees(grid, 1, 1, 6, 2, 2)).toBe(true);
  });

  // Spec acceptance test 4
  it('is symmetric: if A sees floor cell B then B sees A', () => {
    const grid = createGrid(16, 12, 'stone');
    // a few rooms and pillars
    for (let x = 0; x < 16; x++) { cellAt(grid, x, 0)!.w = true; cellAt(grid, x, 11)!.w = true; }
    for (let y = 0; y < 12; y++) { cellAt(grid, 0, y)!.w = true; cellAt(grid, 15, y)!.w = true; }
    for (let y = 1; y < 8; y++) cellAt(grid, 7, y)!.w = true;
    for (let x = 3; x < 12; x++) if (x !== 5) cellAt(grid, x, 6)!.w = true;
    cellAt(grid, 11, 9)!.p = 'pillar';
    cellAt(grid, 3, 3)!.p = 'statue';
    const R = 9;
    const floors: [number, number][] = [];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) if (!isOpaque(cellAt(grid, x, y))) floors.push([x, y]);
    let checked = 0;
    for (const [ax, ay] of floors) {
      const m = computeFov(grid, ax, ay, R);
      for (const [bx, by] of floors) {
        const ab = m[by * 16 + bx] === 1;
        const ba = sees(grid, bx, by, R, ax, ay);
        expect(ab, `(${ax},${ay})->(${bx},${by}) ${ab} vs reverse ${ba}`).toBe(ba);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
