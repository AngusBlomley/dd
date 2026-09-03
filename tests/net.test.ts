import { describe, expect, it } from 'vitest';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid } from '../src/engine/grid';
import { computeScene, markExplored, SEEN_BRIGHT, UNSEEN } from '../src/engine/lighting';
import { applyPatch, diffViews, makeRoomCode, normalizeCode, type MapView } from '../src/net/protocol';
import { buildMapView, publicCell } from '../src/net/views';
import type { MapRecord } from '../src/store/json';

function token(partial: Partial<Token>): Token {
  return {
    id: 1, name: 'T', type: 'pc', x: 0, y: 0, color: '#fff', size: 1,
    vision: { radius: 12, darkvision: 0 }, light: null, ...partial,
  };
}

function corridorMap(): MapRecord {
  const grid = createGrid(30, 3, 'stone');
  for (let x = 0; x < 30; x++) { cellAt(grid, x, 0)!.w = true; cellAt(grid, x, 2)!.w = true; }
  return { id: 'm1', name: 'Corridor', grid, tokens: [], nextTokenId: 1 };
}

describe('buildMapView (what players are allowed to know)', () => {
  it('sends live cells where the party sees, memory where it has been, nothing elsewhere', () => {
    const m = corridorMap();
    const pc = token({ id: 1, x: 5, y: 1, light: { bright: 3, dim: 3 } });
    m.tokens.push(pc);
    // first look: cells 2..8 seen; then walk away so they become memory
    let view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.see[1 * 30 + 6]).toBe(SEEN_BRIGHT);
    expect(view.cells[1 * 30 + 6]).not.toBeNull();
    expect(view.cells[1 * 30 + 20]).toBeNull();
    expect(view.see[1 * 30 + 20]).toBe(UNSEEN);
    // the scene does not write memory; the host does that via markExplored. Simulate it:
    markExplored(m.grid, computeScene(m.grid, m.tokens).party);
    pc.x = 25;
    view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.see[1 * 30 + 6]).toBe(UNSEEN);
    expect(view.cells[1 * 30 + 6]).toEqual({ t: 'stone', w: false, d: false, doOpen: false, p: null }); // remembered
    expect(view.cells[1 * 30 + 15]).toBeNull(); // never seen
  });

  it('turns a closed secret door into a wall and strips its identity', () => {
    const m = corridorMap();
    const sd = cellAt(m.grid, 8, 1)!; sd.d = true; sd.secret = true;
    m.tokens.push(token({ id: 1, x: 5, y: 1, light: { bright: 6, dim: 6 } }));
    const view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.cells[1 * 30 + 8]).toEqual({ t: 'stone', w: true, d: false, doOpen: false, p: null });
    sd.doOpen = true;
    const open = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(open.cells[1 * 30 + 8]).toEqual({ t: 'stone', w: false, d: true, doOpen: true, p: null });
    expect(publicCell({ t: 'x', w: false, d: true, doOpen: false, secret: false, p: null })).toEqual({ t: 'x', w: false, d: true, doOpen: false, p: null });
  });

  it('never includes hidden tokens or unseen monsters, and sends initials not names', () => {
    const m = corridorMap();
    m.tokens.push(
      token({ id: 1, name: 'Sir Aldric', type: 'pc', x: 5, y: 1, light: { bright: 3, dim: 3 } }),
      token({ id: 2, name: 'Cave Spider', type: 'monster', x: 7, y: 1 }),      // lit: visible
      token({ id: 3, name: 'Lurker', type: 'monster', x: 20, y: 1 }),          // dark: hidden
      token({ id: 4, name: 'Secret Lever', type: 'object', x: 6, y: 1, hidden: true }),
    );
    const view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.tokens.map(t => t.id).sort()).toEqual([1, 2]);
    expect(view.tokens.find(t => t.id === 1)!.initials).toBe('SA');
    expect(JSON.stringify(view)).not.toContain('Aldric');
    expect(JSON.stringify(view)).not.toContain('Lurker');
    expect(JSON.stringify(view)).not.toContain('Lever');
    expect(view.tokens.find(t => t.id === 1)!.pc).toBe(true);
    expect(view.tokens.find(t => t.id === 2)!.pc).toBe(false);
  });
});

describe('loot in views (issue #18)', () => {
  it('sends a chest description only when the chest is seen, and diffs it', () => {
    const m = corridorMap();
    const chest = cellAt(m.grid, 8, 1)!; chest.p = 'chest'; chest.loot = { title: 'Iron chest', text: 'Locked, smells of oil.', pickup: true };
    m.tokens.push(token({ id: 1, x: 5, y: 1, light: { bright: 6, dim: 6 } }));
    const view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.cells[1 * 30 + 8]!.loot).toEqual({ title: 'Iron chest', text: 'Locked, smells of oil.', canTake: true });
    const later = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(diffViews(view, later)).toBeNull();
    chest.loot.pickup = false;
    const patch = diffViews(view, buildMapView(m, computeScene(m.grid, m.tokens)))!;
    expect(Object.keys(patch.cells!)).toEqual([String(1 * 30 + 8)]);
  });
});

describe('prop descriptions for players (issue #21)', () => {
  it('sends the DM text for any prop, but Take only for chest-type props', () => {
    const m = corridorMap();
    const statue = cellAt(m.grid, 7, 1)!; statue.p = 'statue'; statue.loot = { title: 'Matron statue', text: 'One hand raised.', pickup: true };
    m.tokens.push(token({ id: 1, x: 5, y: 1, light: { bright: 6, dim: 6 } }));
    const view = buildMapView(m, computeScene(m.grid, m.tokens));
    expect(view.cells[1 * 30 + 7]!.loot).toEqual({ title: 'Matron statue', text: 'One hand raised.', canTake: false });
  });
});

describe('view diffing', () => {
  function mk(): MapView {
    return { mapId: 'a', name: 'A', w: 3, h: 1, cells: [null, { t: 's', w: false, d: false, doOpen: false, p: null }, null], see: [0, 3, 0], intensity: [0, 255, 0], tokens: [] };
  }
  it('returns null when nothing changed', () => {
    expect(diffViews(mk(), mk())).toBeNull();
  });
  it('sends only the changed cells, and applying the patch reproduces the target', () => {
    const a = mk(), b = mk();
    b.cells[2] = { t: 's', w: true, d: false, doOpen: false, p: null };
    b.see[2] = 2; b.intensity[2] = 90;
    b.tokens = [{ id: 1, initials: 'X', color: '#f00', size: 1, x: 1, y: 0, light: false, pc: true }];
    b.name = 'A2';
    const patch = diffViews(a, b)!;
    expect(Object.keys(patch.cells!)).toEqual(['2']);
    expect(Object.keys(patch.see!)).toEqual(['2']);
    expect(patch.name).toBe('A2');
    applyPatch(a, patch);
    expect(a).toEqual(b);
  });
  it('refuses to diff across maps or sizes', () => {
    const a = mk(), b = { ...mk(), mapId: 'b' };
    expect(diffViews(a, b)).toBeNull();
  });
});

describe('room codes', () => {
  it('uses an unambiguous alphabet and normalises what players type', () => {
    for (let i = 0; i < 200; i++) expect(makeRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(normalizeCode(' k7qx ')).toBe('K7QX');
    expect(normalizeCode('ko-li')).toBe('K0L1');
  });
});
