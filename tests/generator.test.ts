import { describe, expect, it } from 'vitest';
import { generateDungeon, type GeneratorOptions } from '../src/engine/generator';
import { makeRng } from '../src/engine/rng';

const opts: GeneratorOptions = {
  w: 34, h: 24, theme: 'stone', roomCount: 10, roomMin: 4, roomMax: 9,
  pillarDensity: 0.35, torchDensity: 0.45, stairsUp: 1, stairsDown: 1, seed: 'goblin-warren',
};

describe('makeRng', () => {
  it('is deterministic for the same seed', () => {
    const a = makeRng('abc'), b = makeRng('abc');
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('returns values in [0, 1)', () => {
    const r = makeRng('xyz');
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('generateDungeon', () => {
  it('produces the same layout for the same seed', () => {
    const a = generateDungeon(opts), b = generateDungeon(opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces a different layout for a different seed', () => {
    const a = generateDungeon(opts), b = generateDungeon({ ...opts, seed: 'other' });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('keeps the outer border solid wall and carves some floor', () => {
    const g = generateDungeon(opts);
    expect(g.w).toBe(34); expect(g.h).toBe(24);
    for (let x = 0; x < g.w; x++) { expect(g.cells[x].w).toBe(true); expect(g.cells[(g.h - 1) * g.w + x].w).toBe(true); }
    for (let y = 0; y < g.h; y++) { expect(g.cells[y * g.w].w).toBe(true); expect(g.cells[y * g.w + g.w - 1].w).toBe(true); }
    const floor = g.cells.filter(c => !c.w).length;
    expect(floor).toBeGreaterThan(50);
  });

  it('places the requested stairs', () => {
    const g = generateDungeon({ ...opts, stairsUp: 2, stairsDown: 3 });
    expect(g.cells.filter(c => c.p === 'stairs_up').length).toBe(2);
    expect(g.cells.filter(c => c.p === 'stairs_down').length).toBe(3);
  });
});
