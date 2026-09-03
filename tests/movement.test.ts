import { describe, expect, it } from 'vitest';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid } from '../src/engine/grid';
import { findPath, isPassable, validateMove } from '../src/engine/movement';

function pc(id: number, x: number, y: number, extra: Partial<Token> = {}): Token {
  return { id, name: 'T' + id, type: 'pc', x, y, color: '#fff', size: 1, vision: { radius: 12, darkvision: 0 }, light: null, ...extra };
}
const anywhere = () => true;

describe('isPassable', () => {
  it('blocks walls, closed doors and blocking props, allows open doors and floor', () => {
    const g = createGrid(5, 1, 'stone');
    cellAt(g, 1, 0)!.w = true;
    cellAt(g, 2, 0)!.d = true;
    cellAt(g, 3, 0)!.p = 'pillar';
    cellAt(g, 4, 0)!.p = 'torch';
    expect(isPassable(g, 0, 0)).toBe(true);
    expect(isPassable(g, 1, 0)).toBe(false);
    expect(isPassable(g, 2, 0)).toBe(false);
    cellAt(g, 2, 0)!.doOpen = true;
    expect(isPassable(g, 2, 0)).toBe(true);
    expect(isPassable(g, 3, 0)).toBe(false);
    expect(isPassable(g, 4, 0)).toBe(true);
    expect(isPassable(g, 9, 0)).toBe(false);
  });
});

describe('findPath', () => {
  it('counts diagonals as one step and finds the shortest route', () => {
    const g = createGrid(10, 10, 'stone');
    expect(findPath(g, 0, 0, 3, 3)!.length).toBe(3);
    expect(findPath(g, 0, 0, 5, 2)!.length).toBe(5);
    expect(findPath(g, 2, 2, 2, 2)).toEqual([]);
  });

  it('routes around walls and returns null when sealed off', () => {
    const g = createGrid(7, 3, 'stone');
    for (let y = 0; y < 3; y++) cellAt(g, 3, y)!.w = true;
    expect(findPath(g, 0, 1, 6, 1)).toBeNull();
    cellAt(g, 3, 0)!.w = false;
    const p = findPath(g, 0, 1, 6, 1)!;
    expect(p.length).toBe(6);
    expect(p.some(c => c.x === 3 && c.y === 0)).toBe(true);
  });

  it('does not squeeze diagonally between two blocked orthogonals', () => {
    const g = createGrid(3, 3, 'stone');
    cellAt(g, 1, 0)!.w = true; cellAt(g, 0, 1)!.w = true;
    expect(findPath(g, 0, 0, 1, 1)).toBeNull();
    cellAt(g, 0, 1)!.w = false;
    expect(findPath(g, 0, 0, 1, 1)!.length).toBe(1);
  });

  it('respects a step limit and a permission callback', () => {
    const g = createGrid(10, 1, 'stone');
    expect(findPath(g, 0, 0, 6, 0, { maxSteps: 5 })).toBeNull();
    expect(findPath(g, 0, 0, 5, 0, { maxSteps: 5 })!.length).toBe(5);
    expect(findPath(g, 0, 0, 6, 0, { allowed: (x) => x !== 3 })).toBeNull();
  });

  it('treats other visible tokens as blockers but not hidden ones or itself', () => {
    const g = createGrid(5, 1, 'stone');
    const me = pc(1, 0, 0), other = pc(2, 2, 0), ghost = pc(3, 3, 0, { hidden: true });
    expect(findPath(g, 0, 0, 4, 0, { blockers: [me, other, ghost], selfId: 1 })).toBeNull();
    other.x = 2; other.y = 0; other.hidden = true;
    expect(findPath(g, 0, 0, 4, 0, { blockers: [me, other, ghost], selfId: 1 })!.length).toBe(4);
  });
});

describe('enemies block movement (issue #4)', () => {
  it('an enemy in a corridor cannot be walked through', () => {
    const g = createGrid(6, 3, 'stone');
    for (let x = 0; x < 6; x++) { cellAt(g, x, 0)!.w = true; cellAt(g, x, 2)!.w = true; }
    const me = pc(1, 1, 1);
    const enemy = { ...pc(2, 2, 1), type: 'monster' as const };
    const rules = { mode: 'free' as const, turnTokenId: null, movementLeft: null };
    expect(validateMove(g, [me, enemy], me, 3, 1, rules, anywhere)).toEqual({ ok: false, reason: 'no-path' });
    expect(validateMove(g, [me, enemy], me, 2, 1, rules, anywhere)).toEqual({ ok: false, reason: 'blocked' });
  });

  it('cannot slip diagonally between two enemies', () => {
    const g = createGrid(4, 4, 'stone');
    const me = pc(1, 1, 1);
    const a = { ...pc(2, 2, 1), type: 'monster' as const };
    const b = { ...pc(3, 1, 2), type: 'monster' as const };
    expect(findPath(g, 1, 1, 2, 2, { blockers: [me, a, b], selfId: 1, allowed: (x, y) => x <= 2 && y <= 2 })).toBeNull();
    // with one of them gone the diagonal opens up
    expect(findPath(g, 1, 1, 2, 2, { blockers: [me, a], selfId: 1, allowed: (x, y) => x <= 2 && y <= 2 })!.length).toBe(1);
  });

  it('routes around an enemy in the open rather than through it', () => {
    const g = createGrid(7, 5, 'stone');
    const me = pc(1, 1, 2);
    const enemy = { ...pc(2, 3, 2), type: 'monster' as const };
    const path = findPath(g, 1, 2, 5, 2, { blockers: [me, enemy], selfId: 1 })!;
    expect(path.some(c => c.x === 3 && c.y === 2)).toBe(false);
    expect(path.length).toBe(4);
  });
});

describe('validateMove (spec R26)', () => {
  const g = createGrid(12, 3, 'stone');
  for (let x = 0; x < 12; x++) { cellAt(g, x, 0)!.w = true; cellAt(g, x, 2)!.w = true; }
  const me = pc(1, 1, 1), you = pc(2, 8, 1);
  const tokens = [me, you];

  it('refuses everything in DM-only mode', () => {
    expect(validateMove(g, tokens, me, 2, 1, { mode: 'dm', turnTokenId: null, movementLeft: null }, anywhere)).toEqual({ ok: false, reason: 'not-your-turn' });
  });

  it('in turn mode only the token with the turn may move, within its budget', () => {
    const rules = { mode: 'turn' as const, turnTokenId: 1, movementLeft: 3 };
    expect(validateMove(g, tokens, you, 7, 1, rules, anywhere)).toEqual({ ok: false, reason: 'not-your-turn' });
    const ok = validateMove(g, tokens, me, 4, 1, rules, anywhere);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.path.length).toBe(3);
    expect(validateMove(g, tokens, me, 5, 1, rules, anywhere)).toEqual({ ok: false, reason: 'too-far' });
  });

  it('free mode lets anyone move any distance but never into a wall, a token, or unexplored dark', () => {
    const rules = { mode: 'free' as const, turnTokenId: null, movementLeft: null };
    expect(validateMove(g, tokens, you, 3, 1, rules, anywhere).ok).toBe(true);
    expect(validateMove(g, tokens, me, 5, 0, rules, anywhere)).toEqual({ ok: false, reason: 'blocked' });
    expect(validateMove(g, tokens, me, 8, 1, rules, anywhere)).toEqual({ ok: false, reason: 'blocked' });
    expect(validateMove(g, tokens, me, 20, 1, rules, anywhere)).toEqual({ ok: false, reason: 'out-of-bounds' });
    // the party has only explored x <= 4
    expect(validateMove(g, tokens, me, 6, 1, rules, (x) => x <= 4)).toEqual({ ok: false, reason: 'no-path' });
  });
});
