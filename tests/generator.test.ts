import { describe, expect, it } from 'vitest';
import { PROP_MAP } from '../src/engine/data';
import { generateCave, generateDungeon, type GeneratorOptions } from '../src/engine/generator';
import { isOpaque } from '../src/engine/fov';
import { cellAt, type Grid } from '../src/engine/grid';
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

function borderIsWall(g: Grid): boolean {
  for (let x = 0; x < g.w; x++) if (!g.cells[x].w || !g.cells[(g.h - 1) * g.w + x].w) return false;
  for (let y = 0; y < g.h; y++) if (!g.cells[y * g.w].w || !g.cells[y * g.w + g.w - 1].w) return false;
  return true;
}

/** Every floor cell reachable from every other by orthogonal steps through passable cells. */
function floorIsConnected(g: Grid): boolean {
  const passable = (x: number, y: number) => { const c = cellAt(g, x, y); return !!c && !c.w && !(c.p && PROP_MAP[c.p].blocksMove); };
  let start = -1;
  for (let i = 0; i < g.cells.length; i++) { const x = i % g.w, y = (i - x) / g.w; if (passable(x, y)) { start = i; break; } }
  if (start < 0) return false;
  const seen = new Uint8Array(g.cells.length);
  const stack = [start]; seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!; count++;
    const x = i % g.w, y = (i - x) / g.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!passable(nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (!seen[ni]) { seen[ni] = 1; stack.push(ni); }
    }
  }
  let total = 0;
  for (let i = 0; i < g.cells.length; i++) { const x = i % g.w, y = (i - x) / g.w; if (passable(x, y)) total++; }
  return count === total;
}

describe('generateDungeon (rooms)', () => {
  it('produces the same layout for the same seed', () => {
    expect(JSON.stringify(generateDungeon(opts))).toBe(JSON.stringify(generateDungeon(opts)));
  });
  it('produces a different layout for a different seed', () => {
    expect(JSON.stringify(generateDungeon(opts))).not.toBe(JSON.stringify(generateDungeon({ ...opts, seed: 'other' })));
  });
  it('keeps the outer border solid wall and carves some floor', () => {
    const g = generateDungeon(opts);
    expect(g.w).toBe(34); expect(g.h).toBe(24);
    expect(borderIsWall(g)).toBe(true);
    expect(g.cells.filter(c => !c.w).length).toBeGreaterThan(50);
  });
  it('places the requested stairs', () => {
    const g = generateDungeon({ ...opts, stairsUp: 2, stairsDown: 3 });
    expect(g.cells.filter(c => c.p === 'stairs_up').length).toBe(2);
    expect(g.cells.filter(c => c.p === 'stairs_down').length).toBe(3);
  });
});

describe('generateCave', () => {
  const cave: GeneratorOptions = { ...opts, theme: 'underdark', w: 50, h: 40, seed: 'gracklstugh' };

  it('is deterministic and routes through generateDungeon for cave themes', () => {
    expect(JSON.stringify(generateCave(cave))).toBe(JSON.stringify(generateDungeon(cave)));
    expect(JSON.stringify(generateCave(cave))).not.toBe(JSON.stringify(generateCave({ ...cave, seed: 'menzoberranzan' })));
  });

  it('has a solid border and one connected cavern with no unreachable pockets', () => {
    for (const seed of ['a', 'b', 'c', 'deep', 'darklake']) {
      const g = generateCave({ ...cave, seed });
      expect(borderIsWall(g), seed).toBe(true);
      const floor = g.cells.filter(c => !c.w).length;
      expect(floor, seed).toBeGreaterThan(g.w * g.h * 0.25);
      expect(floorIsConnected(g), seed).toBe(true);
    }
  });

  it('dresses the cave with Underdark terrain and glowing props', () => {
    const g = generateCave(cave);
    const terrains = new Set(g.cells.filter(c => !c.w).map(c => c.t));
    expect(terrains.has('cave')).toBe(true);
    expect(terrains.has('fungus') || terrains.has('moss') || terrains.has('rough')).toBe(true);
    const props = g.cells.map(c => c.p).filter((p): p is string => !!p);
    expect(props.some(p => PROP_MAP[p].light)).toBe(true);
    expect(props.some(p => PROP_MAP[p].blocksLOS)).toBe(true);
    expect(g.cells.filter(c => c.p === 'stairs_up').length).toBe(1);
    expect(g.cells.filter(c => c.p === 'stairs_down').length).toBe(1);
  });

  it('never places a blocking prop where it would seal a corridor', () => {
    const g = generateCave({ ...cave, pillarDensity: 0.6 });
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const c = cellAt(g, x, y)!;
      if (!c.p || !PROP_MAP[c.p].blocksMove) continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cellAt(g, x + dx, y + dy); if (n && !isOpaque(n)) open++; }
      expect(open, `blocker at ${x},${y}`).toBeGreaterThanOrEqual(2);
    }
  });
});
