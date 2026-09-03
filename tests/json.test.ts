import { describe, expect, it } from 'vitest';
import { createGrid, cellAt } from '../src/engine/grid';
import { parseMap, serializeMap } from '../src/store/json';

describe('map JSON round trip', () => {
  it('serialises and parses back to the same grid and tokens', () => {
    const grid = createGrid(6, 4, 'stone');
    cellAt(grid, 2, 2)!.w = true;
    cellAt(grid, 3, 2)!.p = 'torch';
    const tokens = [{ id: 1, name: 'Spider', type: 'monster' as const, x: 1, y: 1, color: '#a13a2d', size: 1, vision: 6, darkvision: true, hasLight: false, lightRadius: 4 }];
    const file = JSON.parse(JSON.stringify(serializeMap(grid, tokens, 2)));
    const parsed = parseMap(file);
    expect(parsed.grid.w).toBe(6);
    expect(parsed.grid.h).toBe(4);
    expect(cellAt(parsed.grid, 2, 2)!.w).toBe(true);
    expect(cellAt(parsed.grid, 3, 2)!.p).toBe('torch');
    expect(parsed.tokens).toEqual(tokens);
    expect(parsed.nextTokenId).toBe(2);
  });

  it('accepts a prototype-1 export with missing optional fields', () => {
    const parsed = parseMap({ gridW: 2, gridH: 1, cells: [{ t: 'stone' } as any, { t: 'void', w: 1 } as any] });
    expect(parsed.grid.cells[0]).toEqual({ t: 'stone', w: false, d: false, doOpen: false, p: null, ex: false });
    expect(parsed.grid.cells[1].w).toBe(true);
    expect(parsed.tokens).toEqual([]);
    expect(parsed.nextTokenId).toBe(1);
  });

  it('rejects something that is not a map', () => {
    expect(() => parseMap({} as any)).toThrow();
  });
});
