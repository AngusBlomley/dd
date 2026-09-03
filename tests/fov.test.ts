import { describe, expect, it } from 'vitest';
import { bresenhamLine, cellKey, computeVisibility, isOpaque } from '../src/engine/fov';
import { cellAt, createGrid, newCell } from '../src/engine/grid';

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

describe('bresenhamLine', () => {
  it('includes both endpoints and steps one cell at a time', () => {
    const pts = bresenhamLine(0, 0, 3, 1);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([3, 1]);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeVisibility', () => {
  it('sees only its own cell with radius 0', () => {
    const grid = createGrid(5, 5, 'stone');
    expect([...computeVisibility(grid, 2, 2, 0)]).toEqual([cellKey(2, 2)]);
  });

  it('sees everything in an open room within radius', () => {
    const grid = createGrid(9, 9, 'stone');
    const vis = computeVisibility(grid, 4, 4, 3);
    expect(vis.has(cellKey(4, 1))).toBe(true);
    expect(vis.has(cellKey(7, 4))).toBe(true);
    expect(vis.has(cellKey(4, 8))).toBe(false); // 4 away, beyond radius 3
  });

  it('is blocked by a wall but still sees the wall itself', () => {
    const grid = createGrid(9, 3, 'stone');
    cellAt(grid, 4, 1)!.w = true;
    const vis = computeVisibility(grid, 1, 1, 8);
    expect(vis.has(cellKey(4, 1))).toBe(true);  // the wall
    expect(vis.has(cellKey(5, 1))).toBe(false); // behind it
    expect(vis.has(cellKey(7, 1))).toBe(false);
  });

  it('sees through an open door but not a closed one', () => {
    const grid = createGrid(9, 3, 'stone');
    const door = cellAt(grid, 4, 1)!;
    door.d = true; door.doOpen = false;
    expect(computeVisibility(grid, 1, 1, 8).has(cellKey(6, 1))).toBe(false);
    door.doOpen = true;
    expect(computeVisibility(grid, 1, 1, 8).has(cellKey(6, 1))).toBe(true);
  });
});
