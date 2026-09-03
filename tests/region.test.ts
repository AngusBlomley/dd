import { describe, expect, it } from 'vitest';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid } from '../src/engine/grid';
import { clearRegion, countProps, moveRegion, normalizeRect, rectArea, rectContains, tokensIn } from '../src/engine/region';

function pc(id: number, x: number, y: number): Token {
  return { id, name: 'T' + id, type: 'pc', x, y, color: '#fff', size: 1, vision: { radius: 12, darkvision: 0 }, light: null };
}

describe('region selection (issue #25)', () => {
  it('normalises corners in any order and clips to the map', () => {
    const g = createGrid(10, 10, 'stone');
    expect(normalizeRect(g, 7, 8, 2, 3)).toEqual({ x0: 2, y0: 3, x1: 7, y1: 8 });
    expect(normalizeRect(g, -3, 2, 40, 4)).toEqual({ x0: 0, y0: 2, x1: 9, y1: 4 });
    expect(rectArea({ x0: 2, y0: 3, x1: 7, y1: 8 })).toBe(36);
    expect(rectContains({ x0: 2, y0: 3, x1: 7, y1: 8 }, 7, 8)).toBe(true);
    expect(rectContains({ x0: 2, y0: 3, x1: 7, y1: 8 }, 8, 8)).toBe(false);
  });

  it('counts and clears props, tokens and structure separately', () => {
    const g = createGrid(10, 10, 'stone');
    cellAt(g, 2, 2)!.p = 'torch'; cellAt(g, 3, 2)!.p = 'chest'; cellAt(g, 3, 2)!.loot = { title: 'x', text: '', pickup: true };
    cellAt(g, 4, 2)!.w = true; cellAt(g, 5, 2)!.d = true;
    cellAt(g, 8, 8)!.p = 'torch';
    const tokens = [pc(1, 2, 3), pc(2, 9, 9)];
    const r = { x0: 2, y0: 2, x1: 5, y1: 3 };
    expect(countProps(g, r)).toBe(2);
    expect(tokensIn(tokens, r).map(t => t.id)).toEqual([1]);
    let left = clearRegion(g, tokens, r, 'props');
    expect(cellAt(g, 2, 2)!.p).toBeNull(); expect(cellAt(g, 3, 2)!.loot).toBeNull();
    expect(cellAt(g, 4, 2)!.w).toBe(true); expect(left.length).toBe(2); expect(cellAt(g, 8, 8)!.p).toBe('torch');
    left = clearRegion(g, left, r, 'structure');
    expect(cellAt(g, 4, 2)!.w).toBe(false); expect(cellAt(g, 5, 2)!.d).toBe(false);
    left = clearRegion(g, left, r, 'tokens');
    expect(left.map(t => t.id)).toEqual([2]);
  });

  it('moves walls, doors, props, links, loot and tokens together, clearing the source', () => {
    const g = createGrid(12, 12, 'cave');
    cellAt(g, 2, 2)!.w = true;
    const door = cellAt(g, 3, 2)!; door.d = true; door.secret = true;
    const exit = cellAt(g, 2, 3)!; exit.p = 'exit'; exit.link = { mapId: 'm2', x: 1, y: 1 }; exit.t = 'wood';
    const chest = cellAt(g, 3, 3)!; chest.p = 'chest'; chest.loot = { title: 'Gold', text: '', pickup: true };
    const tokens = [pc(1, 3, 3), pc(2, 0, 0)];
    const moved = moveRegion(g, tokens, { x0: 2, y0: 2, x1: 3, y1: 3 }, 4, 5);
    expect(moved).toEqual({ x0: 6, y0: 7, x1: 7, y1: 8 });
    expect(cellAt(g, 6, 7)!.w).toBe(true);
    expect(cellAt(g, 7, 7)!.d).toBe(true); expect(cellAt(g, 7, 7)!.secret).toBe(true);
    expect(cellAt(g, 6, 8)!.p).toBe('exit'); expect(cellAt(g, 6, 8)!.link).toEqual({ mapId: 'm2', x: 1, y: 1 }); expect(cellAt(g, 6, 8)!.t).toBe('wood');
    expect(cellAt(g, 7, 8)!.loot).toEqual({ title: 'Gold', text: '', pickup: true });
    expect(tokens[0]).toMatchObject({ x: 7, y: 8 });
    expect(tokens[1]).toMatchObject({ x: 0, y: 0 });
    // source cleared of structure and props, terrain kept
    expect(cellAt(g, 2, 2)!.w).toBe(false); expect(cellAt(g, 2, 3)!.p).toBeNull(); expect(cellAt(g, 2, 3)!.t).toBe('wood');
  });

  it('drops the part that would fall off the map and leaves tokens there in place', () => {
    const g = createGrid(6, 6, 'stone');
    cellAt(g, 4, 4)!.w = true; cellAt(g, 5, 5)!.w = true;
    const tokens = [pc(1, 5, 5)];
    const moved = moveRegion(g, tokens, { x0: 4, y0: 4, x1: 5, y1: 5 }, 1, 1);
    expect(moved).toEqual({ x0: 5, y0: 5, x1: 5, y1: 5 });
    expect(cellAt(g, 5, 5)!.w).toBe(true);   // (4,4) moved here
    expect(cellAt(g, 4, 4)!.w).toBe(false);
    expect(tokens[0]).toMatchObject({ x: 5, y: 5 }); // could not move off the map
  });
});
