import { describe, expect, it } from 'vitest';
import { PROP_MAP } from '../src/engine/data';
import { generateDungeon, type GeneratorOptions } from '../src/engine/generator';
import { cellAt, createGrid } from '../src/engine/grid';
import { PREFABS, PREFAB_MAP, prefabSize, rotatePrefab, stampPrefab } from '../src/engine/prefabs';

describe('prefabs (issue #15)', () => {
  it('every prefab uses only known legend characters and props', () => {
    const legend = new Set('#.,+=~- TBbCcAKSLtf^anorWEX');
    for (const p of PREFABS) {
      for (const row of p.rows) for (const ch of row) expect(legend.has(ch), `${p.id}: '${ch}'`).toBe(true);
      const g = createGrid(20, 20, 'stone');
      stampPrefab(g, p, 2, 2);
      for (const c of g.cells) if (c.p) expect(PROP_MAP[c.p], `${p.id}: prop ${c.p}`).toBeTruthy();
    }
  });

  it('stamps a tavern with walls, a door, furniture and its floor', () => {
    const g = createGrid(20, 20, 'cave');
    const tavern = PREFAB_MAP.tavern;
    const { w, h } = prefabSize(tavern);
    expect(stampPrefab(g, tavern, 3, 4)).toBe(w * h);
    expect(cellAt(g, 3, 4)!.w).toBe(true);
    expect(cellAt(g, 4, 5)!.t).toBe('wood');
    expect(cellAt(g, 4, 5)!.p).toBe('lantern');
    expect(cellAt(g, 7, 11)!.d).toBe(true);   // the door in the bottom wall
    expect(cellAt(g, 2, 4)!.t).toBe('cave');  // outside untouched
  });

  it('clips at the map edge instead of throwing', () => {
    const g = createGrid(5, 5, 'stone');
    const n = stampPrefab(g, PREFAB_MAP.tavern, 3, 3);
    expect(n).toBe(4);
    expect(cellAt(g, 3, 3)!.w).toBe(true);
  });

  it('the campsite keeps the existing terrain around the fire', () => {
    const g = createGrid(10, 10, 'grass');
    stampPrefab(g, PREFAB_MAP.camp, 1, 1);
    expect(cellAt(g, 4, 2)!.p).toBe('campfire');
    expect(cellAt(g, 4, 2)!.t).toBe('grass');
  });
});

describe('rotatePrefab (issue #16)', () => {
  it('turns the sketch clockwise and swaps its size', () => {
    const p = { id: 'x', name: 'x', icon: '', rows: ['ab', 'cd', 'ef'] };
    expect(rotatePrefab(p, 1).rows).toEqual(['eca', 'fdb']);
    expect(rotatePrefab(p, 2).rows).toEqual(['fe', 'dc', 'ba']);
    expect(rotatePrefab(p, 4).rows).toEqual(p.rows);
    expect(rotatePrefab(p, -1).rows).toEqual(rotatePrefab(p, 3).rows);
    expect(prefabSize(rotatePrefab(PREFAB_MAP.tavern, 1))).toEqual({ w: 8, h: 9 });
  });

  it('a rotated tavern still stamps a door in an outer wall', () => {
    const g = createGrid(20, 20, 'stone');
    const r = rotatePrefab(PREFAB_MAP.tavern, 1);
    stampPrefab(g, r, 1, 1);
    // the door was in the bottom wall; after a clockwise turn it is in the left wall
    expect(cellAt(g, 1, 5)!.d).toBe(true);
  });
});

describe('generator places an arrival point (issue #12)', () => {
  const base: GeneratorOptions = { w: 34, h: 24, theme: 'stone', roomCount: 8, roomMin: 4, roomMax: 8, pillarDensity: 0.3, torchDensity: 0.4, stairsUp: 1, stairsDown: 1, seed: 'entry' };
  it('exactly one Entry on rooms maps and on caves', () => {
    for (const theme of ['stone', 'crypt', 'wood', 'cave', 'underdark'] as const) {
      const g = generateDungeon({ ...base, theme });
      const entries = g.cells.filter(c => c.p === 'entry');
      expect(entries.length, theme).toBe(1);
      expect(entries[0].w, theme).toBe(false);
    }
  });
});
