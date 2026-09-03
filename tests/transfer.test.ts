// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// campaign.ts schedules autosaves with window timers; give it a stub window in node.
(globalThis as any).window = { setTimeout: () => 0, clearTimeout: () => undefined, addEventListener: () => undefined };

import { entriesOf, newCampaign, newMapRecord, transferToken } from '../src/campaign';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid } from '../src/engine/grid';
import { onChange, state } from '../src/state';

function pc(id: number, x: number, y: number): Token {
  return { id, name: 'PC ' + id, type: 'pc', x, y, color: '#4f8a79', size: 1, vision: { radius: 12, darkvision: 0 }, light: null };
}

describe('linked maps: transferToken', () => {
  beforeEach(() => {
    const a = newMapRecord('Level 1', createGrid(10, 10, 'stone'));
    const b = newMapRecord('Level 2', createGrid(8, 8, 'cave'));
    cellAt(b.grid, 3, 3)!.p = 'entry';
    cellAt(b.grid, 6, 1)!.p = 'entry';
    cellAt(a.grid, 9, 9)!.p = 'exit';
    cellAt(a.grid, 9, 9)!.link = { mapId: b.id, x: 3, y: 3 };
    a.tokens.push(pc(1, 9, 9), pc(2, 1, 1));
    a.nextTokenId = 3;
    b.tokens.push(pc(1, 0, 0));
    b.nextTokenId = 2;
    const c = newCampaign('Test', a);
    c.maps.push(b);
    state.campaign = c;
    state.mapId = a.id;
    state.grid = a.grid;
    state.tokens = a.tokens;
    state.nextTokenId = a.nextTokenId;
  });

  it('lists entry cells on a map', () => {
    const b = state.campaign!.maps[1];
    expect(entriesOf(b)).toEqual([{ x: 6, y: 1 }, { x: 3, y: 3 }]);
  });

  it('moves the token to the linked cell with a fresh id on the target map', () => {
    const [a, b] = state.campaign!.maps;
    const link = cellAt(a.grid, 9, 9)!.link!;
    const newId = transferToken(a.id, 1, link.mapId, link.x, link.y);
    expect(newId).toBe(2);                       // b.nextTokenId was 2
    expect(a.tokens.map(t => t.id)).toEqual([2]); // PC 1 left level 1
    expect(state.tokens).toBe(a.tokens);          // live state still points at the active map's tokens
    const moved = b.tokens.find(t => t.id === 2)!;
    expect(moved.name).toBe('PC 1');
    expect([moved.x, moved.y]).toEqual([3, 3]);
    expect(b.nextTokenId).toBe(3);
  });

  it('refuses bad targets and leaves everything untouched', () => {
    const [a, b] = state.campaign!.maps;
    expect(transferToken(a.id, 99, b.id, 3, 3)).toBeNull();
    expect(transferToken(a.id, 1, 'nope', 3, 3)).toBeNull();
    expect(transferToken(a.id, 1, b.id, 50, 50)).toBeNull();
    expect(a.tokens.length).toBe(2);
    expect(b.tokens.length).toBe(1);
  });

  it('keeps live state in step when the target is the active map', () => {
    const [a, b] = state.campaign!.maps;
    // make level 2 active, then pull PC 2 in from level 1
    state.mapId = b.id; state.grid = b.grid; state.tokens = b.tokens; state.nextTokenId = b.nextTokenId;
    const newId = transferToken(a.id, 2, b.id, 6, 1);
    expect(newId).toBe(2);
    expect(state.tokens).toBe(b.tokens);
    expect(state.nextTokenId).toBe(3);
    expect(state.tokens.map(t => t.name)).toEqual(['PC 1', 'PC 2']);
  });

  it('is noticed by change listeners (so the host pushes new views)', () => {
    const spy = vi.fn();
    onChange(spy);
    const [a, b] = state.campaign!.maps;
    transferToken(a.id, 1, b.id, 3, 3);
    expect(spy).toHaveBeenCalled();
  });
});
