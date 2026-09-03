import { describe, expect, it } from 'vitest';
import { createGrid, cellAt } from '../src/engine/grid';
import {
  isCampaignFile, parseCampaign, parseMap, serializeCampaign, serializeMap, type Campaign, type MapRecord,
} from '../src/store/json';

function sampleMap(): MapRecord {
  const grid = createGrid(6, 4, 'stone');
  cellAt(grid, 2, 2)!.w = true;
  cellAt(grid, 3, 2)!.p = 'torch';
  const sd = cellAt(grid, 4, 2)!; sd.d = true; sd.secret = true;
  return {
    id: 'm1', name: 'Goblin Warren', nextMapId: 'm2', grid,
    tokens: [{
      id: 1, name: 'Spider', type: 'monster' as const, x: 1, y: 1, color: '#a13a2d', size: 1,
      vision: { radius: 12, darkvision: 12 }, light: null, hidden: true,
    }, {
      id: 2, name: 'Old Brannoc', type: 'npc' as const, x: 2, y: 1, color: '#3f6fae', size: 1,
      vision: { radius: 12, darkvision: 0 }, light: null, role: 'Innkeeper', trade: 'Rooms 5 sp.',
    }],
    nextTokenId: 3,
  };
}

describe('map JSON round trip', () => {
  it('serialises and parses back to the same map', () => {
    const m = sampleMap();
    const parsed = parseMap(JSON.parse(JSON.stringify(serializeMap(m))));
    expect(parsed.id).toBe('m1');
    expect(parsed.name).toBe('Goblin Warren');
    expect(parsed.nextMapId).toBe('m2');
    expect(parsed.grid.w).toBe(6);
    expect(cellAt(parsed.grid, 2, 2)!.w).toBe(true);
    expect(cellAt(parsed.grid, 3, 2)!.p).toBe('torch');
    expect(cellAt(parsed.grid, 4, 2)!.secret).toBe(true);
    expect(parsed.tokens).toEqual(m.tokens);
    expect(parsed.nextTokenId).toBe(3);
  });

  it('migrates a prototype-1 export, including its token shape and explored flag', () => {
    const legacy = {
      gridW: 2, gridH: 1,
      cells: [{ t: 'stone' } as any, { t: 'void', w: 1, ex: true } as any],
      tokens: [
        { id: 1, name: 'Aldric', type: 'pc', x: 0, y: 0, color: '#4f8a79', size: 1, vision: 6, darkvision: false, hasLight: true, lightRadius: 4 },
        { id: 2, name: 'Drow', type: 'npc', x: 1, y: 0, color: '#3f6fae', size: 1, vision: 8, darkvision: true, hasLight: false, lightRadius: 4 },
      ] as any,
    };
    const parsed = parseMap(legacy, 'Old map');
    expect(parsed.name).toBe('Old map');
    expect(parsed.id).toBeTruthy();
    expect(parsed.grid.cells[0]).toEqual({ t: 'stone', w: false, d: false, doOpen: false, secret: false, p: null, mem: null });
    expect(parsed.grid.cells[1].mem).toEqual({ t: 'void', w: true, d: false, doOpen: false, p: null, secret: false });
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

describe('campaign JSON round trip', () => {
  it('serialises and parses a campaign with several maps', () => {
    const m1 = sampleMap();
    const m2 = { ...sampleMap(), id: 'm2', name: 'Level 2' };
    const c: Campaign = { id: 'c1', name: 'Out of the Abyss', createdAt: 1, updatedAt: 2, activeMapId: 'm2', maps: [m1, m2] };
    const file = JSON.parse(JSON.stringify(serializeCampaign(c)));
    expect(isCampaignFile(file)).toBe(true);
    expect(isCampaignFile(JSON.parse(JSON.stringify(serializeMap(m1))))).toBe(false);
    const parsed = parseCampaign(file);
    expect(parsed.name).toBe('Out of the Abyss');
    expect(parsed.maps.map(m => m.name)).toEqual(['Goblin Warren', 'Level 2']);
    expect(parsed.activeMapId).toBe('m2');
  });

  it('falls back to the first map when the active map id is missing', () => {
    const c: Campaign = { id: 'c1', name: 'X', createdAt: 1, updatedAt: 2, activeMapId: 'nope', maps: [sampleMap()] };
    expect(parseCampaign(JSON.parse(JSON.stringify(serializeCampaign(c)))).activeMapId).toBe('m1');
  });
});
