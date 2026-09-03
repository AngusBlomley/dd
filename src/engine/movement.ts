/* Movement rules: what blocks, and shortest paths on the grid.
   5e-style: each step, straight or diagonal, costs one cell (5 ft).
   No squeezing diagonally between two blocked orthogonal neighbours. */

import { PROP_MAP, type Token } from './data';
import { cellAt, type Grid } from './grid';

export const CELL_FEET = 5;

export function isPassable(grid: Grid, x: number, y: number): boolean {
  const c = cellAt(grid, x, y);
  if (!c) return false;
  if (c.w) return false;
  if (c.d && !c.doOpen) return false;
  if (c.p && PROP_MAP[c.p]?.blocksMove) return false;
  return true;
}

/** Tokens that block movement into their cell (hidden ones never reveal themselves by blocking). */
export function occupiedBy(tokens: Token[], x: number, y: number, ignoreId?: number): Token | undefined {
  return tokens.find(t => t.x === x && t.y === y && t.id !== ignoreId && !t.hidden);
}

export interface PathOptions {
  /** Extra per-cell permission, e.g. "the player can see or remember this cell". */
  allowed?: (x: number, y: number) => boolean;
  /** Give up beyond this many steps. */
  maxSteps?: number;
  /** Tokens whose cells cannot be entered or passed through. */
  blockers?: Token[];
  /** Id of the moving token, so it does not block itself. */
  selfId?: number;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Breadth-first shortest path from (x0,y0) to (x1,y1). Returns the list of
 * cells after the start (so path.length is the cost in cells), or null.
 */
export function findPath(grid: Grid, x0: number, y0: number, x1: number, y1: number, opts: PathOptions = {}): { x: number; y: number }[] | null {
  if (x0 === x1 && y0 === y1) return [];
  const ok = (x: number, y: number) =>
    isPassable(grid, x, y) &&
    (!opts.allowed || opts.allowed(x, y)) &&
    !(opts.blockers && occupiedBy(opts.blockers, x, y, opts.selfId));
  if (!ok(x1, y1)) return null;
  const w = grid.w, h = grid.h;
  const max = opts.maxSteps ?? w * h;
  const prev = new Int32Array(w * h).fill(-2);
  const dist = new Int32Array(w * h).fill(-1);
  const start = y0 * w + x0, goal = y1 * w + x1;
  const queue: number[] = [start];
  prev[start] = -1; dist[start] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    if (dist[cur] >= max) continue;
    const cx = cur % w, cy = (cur - cx) / w;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -2) continue;
      if (!ok(nx, ny)) continue;
      // corner rule: a diagonal step needs at least one open orthogonal neighbour,
      // and creatures count as obstacles here just like walls (no slipping between two enemies)
      if (dx && dy && !ok(cx + dx, cy) && !ok(cx, cy + dy)) continue;
      prev[ni] = cur; dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const path: { x: number; y: number }[] = [];
  for (let i = goal; i !== start; i = prev[i]) path.push({ x: i % w, y: Math.floor(i / w) });
  return path.reverse();
}

export type MoveDenial = 'not-your-token' | 'not-your-turn' | 'blocked' | 'too-far' | 'no-path' | 'out-of-bounds' | 'not-adjacent' | 'not-a-door';

/** Can this token take the loot at (x, y)? Same cell or next to it, and the DM allowed pick-up. */
export function canTakeLoot(grid: Grid, token: Token, x: number, y: number): { ok: true } | { ok: false; reason: MoveDenial } {
  const c = cellAt(grid, x, y);
  if (!c) return { ok: false, reason: 'out-of-bounds' };
  if (!c.p || !c.loot || !c.loot.pickup) return { ok: false, reason: 'not-a-door' };
  if (Math.max(Math.abs(token.x - x), Math.abs(token.y - y)) > 1) return { ok: false, reason: 'not-adjacent' };
  return { ok: true };
}

/**
 * Can this token open or close the door at (x, y)? It must be next to it
 * (straight or diagonal) and the door must be one the players could know about:
 * a closed secret door still reads as a wall to them.
 */
export function canOperateDoor(grid: Grid, token: Token, x: number, y: number): { ok: true } | { ok: false; reason: MoveDenial } {
  const c = cellAt(grid, x, y);
  if (!c) return { ok: false, reason: 'out-of-bounds' };
  if (!c.d || (c.secret && !c.doOpen)) return { ok: false, reason: 'not-a-door' };
  if (Math.max(Math.abs(token.x - x), Math.abs(token.y - y)) > 1) return { ok: false, reason: 'not-adjacent' };
  return { ok: true };
}

export interface MoveRules {
  mode: 'dm' | 'turn' | 'free';
  turnTokenId: number | null;   // token whose turn it is (turn mode)
  movementLeft: number | null;  // cells left this turn (turn mode), null = unlimited
}

/**
 * Validates a player's move request. Pure. Returns the path on success or a denial reason.
 */
export function validateMove(
  grid: Grid, tokens: Token[], token: Token, x: number, y: number,
  rules: MoveRules, allowed: (x: number, y: number) => boolean,
): { ok: true; path: { x: number; y: number }[] } | { ok: false; reason: MoveDenial } {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return { ok: false, reason: 'out-of-bounds' };
  if (rules.mode === 'dm') return { ok: false, reason: 'not-your-turn' };
  if (rules.mode === 'turn' && rules.turnTokenId !== token.id) return { ok: false, reason: 'not-your-turn' };
  if (!isPassable(grid, x, y) || occupiedBy(tokens, x, y, token.id)) return { ok: false, reason: 'blocked' };
  const budget = rules.mode === 'turn' && rules.movementLeft !== null ? rules.movementLeft : undefined;
  const path = findPath(grid, token.x, token.y, x, y, { allowed, blockers: tokens, selfId: token.id, maxSteps: budget ?? undefined });
  if (!path) {
    // distinguish "no route" from "route exists but too far"
    if (budget !== undefined && findPath(grid, token.x, token.y, x, y, { allowed, blockers: tokens, selfId: token.id })) return { ok: false, reason: 'too-far' };
    return { ok: false, reason: 'no-path' };
  }
  if (budget !== undefined && path.length > budget) return { ok: false, reason: 'too-far' };
  return { ok: true, path };
}
