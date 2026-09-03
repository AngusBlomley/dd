import { describe, expect, it } from 'vitest';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid } from '../src/engine/grid';
import { computeSceneVisibility, isSeenNow } from '../src/engine/lighting';

function token(partial: Partial<Token>): Token {
  return {
    id: 1, name: 'T', type: 'pc', x: 0, y: 0, color: '#fff', size: 1,
    vision: 6, darkvision: false, hasLight: false, lightRadius: 4, ...partial,
  };
}

describe('computeSceneVisibility (prototype 1 behaviour)', () => {
  it('an unlit room is not seen by a token without darkvision', () => {
    const grid = createGrid(11, 11, 'stone');
    const scene = computeSceneVisibility(grid, [token({ x: 5, y: 5 })]);
    expect(isSeenNow(scene, 5, 5)).toBe(false);
    expect(isSeenNow(scene, 7, 5)).toBe(false);
  });

  it('a torch prop lights cells so a nearby token can see them', () => {
    const grid = createGrid(11, 11, 'stone');
    cellAt(grid, 5, 5)!.p = 'torch';
    const scene = computeSceneVisibility(grid, [token({ x: 5, y: 7 })]);
    expect(isSeenNow(scene, 5, 5)).toBe(true);
    expect(isSeenNow(scene, 5, 3)).toBe(true);
  });

  it('a token carrying light sees around itself', () => {
    const grid = createGrid(11, 11, 'stone');
    const scene = computeSceneVisibility(grid, [token({ x: 5, y: 5, hasLight: true, lightRadius: 3 })]);
    expect(isSeenNow(scene, 5, 5)).toBe(true);
    expect(isSeenNow(scene, 8, 5)).toBe(true);
    expect(isSeenNow(scene, 5, 10)).toBe(false);
  });

  it('darkvision sees unlit cells within its radius', () => {
    const grid = createGrid(11, 11, 'stone');
    const scene = computeSceneVisibility(grid, [token({ x: 5, y: 5, darkvision: true, vision: 3 })]);
    expect(isSeenNow(scene, 8, 5)).toBe(true);
    expect(isSeenNow(scene, 5, 10)).toBe(false);
  });

  // Documents spec bug B1, to be fixed in Phase 1. When it is fixed this
  // expectation flips: a monster must not contribute to the party's vision.
  it('KNOWN BUG B1: a monster with darkvision currently reveals itself', () => {
    const grid = createGrid(11, 11, 'stone');
    const scene = computeSceneVisibility(grid, [
      token({ id: 1, type: 'pc', x: 1, y: 1, vision: 2 }),
      token({ id: 2, type: 'monster', x: 9, y: 9, darkvision: true, vision: 2 }),
    ]);
    expect(isSeenNow(scene, 9, 9)).toBe(true);
  });
});
