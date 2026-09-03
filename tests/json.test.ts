import { describe, expect, it } from 'vitest';
import { createGrid, cellAt } from '../src/engine/grid';
import { parseMap, serializeMap } from '../src/store/json';

describe('map JSON round trip', () => {
  it('serialises and parses back to the same grid and tokens', () => {
    const grid = createGrid(6, 4, 'stone');
    cellAt(grid, 2, 2)!.w = true;
    cellAt(grid, 3, 2)!.p = 'torch';
    const tokens = [{
      id: 1, name: 'Spider', type: 'monster' as const, x: 1, y: 1, color: '#a13a2d', size: 1,
      vision: { radius: 12, darkvision: 12 }, light: null, hidden: true,
    }];
    const file = JSON.parse(JSON.stringify(serializeMap(grid, tokens, 2)));
    const parsed = parseMap(file);
    expect(parsed.grid.w).toBe(6);
    expect(parsed.grid.h).toBe(4);
    expect(cellAt(parsed.grid, 2, 2)!.w).toBe(true);
    expect(cellAt(parsed.grid, 3, 2)!.p).toBe('torch');
    expect(parsed.tokens).toEqual(tokens);
    expect(parsed.nextTokenId).toBe(2);
  });

  it('migrates a prototype-1 export, including its token shape', () => {
    const legacy = {
      gridW: 2, gridH: 1,
      cells: [{ t: 'stone' } as any, { t: 'void', w: 1, ex: true } as any],
      tokens: [
        { id: 1, name: 'Aldric', type: 'pc', x: 0, y: 0, color: '#4f8a79', size: 1, vision: 6, darkvision: false, hasLight: true, lightRadius: 4 },
        { id: 2, name: 'Drow', type: 'npc', x: 1, y: 0, color: '#3f6fae', size: 1, vision: 8, darkvision: true, hasLight: false, lightRadius: 4 },
      ] as any,
    };
    const parsed = parseMap(legacy);
    expect(parsed.grid.cells[0]).toEqual({ t: 'stone', w: false, d: false, doOpen: false, p: null, mem: null });
    expect(parsed.grid.cells[1].w).toBe(true);
    // legacy explored flag becomes a memory snapshot of the cell itself
    expect(parsed.grid.cells[1].mem).toEqual({ t: 'void', w: true, d: false, doOpen: false, p: null });
    expect(parsed.tokens[0].vision).toEqual({ radius: 6, darkvision: 0 });
    expect(parsed.tokens[0].light).toEqual({ bright: 4, dim: 8 });
    expect(parsed.tokens[1].vision).toEqual({ radius: 8, darkvision: 8 });
    expect(parsed.tokens[1].light).toBeNull();
    expect(parsed.nextTokenId).toBe(3);
  });

  it('rejects something that is not a map', () => {
    expect(() => parseMap({} as any)).toThrow();
  });
});
