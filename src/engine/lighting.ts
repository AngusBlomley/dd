/* The lighting and vision model from docs/SPEC.md section 4.

   Light map:   every cell is DARK, DIM or BRIGHT, from props and tokens that emit light.
                An intensity value (0..1) alongside gives the renderer a smooth falloff
                through the dim band; the levels are what the rules use.
   Vision:      each viewer casts FOV; a cell it can see resolves to a SeeLevel from the
                light there and the viewer's vision / darkvision radii.
   Party vision is the union over player characters only. Nothing else contributes. */

import { PROP_MAP, type Token } from './data';
import { computeFov, emptyMask } from './fov';
import { cellAt, rememberCell, type Grid } from './grid';

export const DARK = 0, DIM = 1, BRIGHT = 2;
export type LightLevel = 0 | 1 | 2;

/** How a cell is seen. Higher is better; 0 means not seen. */
export const UNSEEN = 0, SEEN_DARKVISION = 1, SEEN_DIM = 2, SEEN_BRIGHT = 3;
export type SeeLevel = 0 | 1 | 2 | 3;

export interface LightSource { x: number; y: number; bright: number; dim: number }

export function collectLightSources(grid: Grid, tokens: Token[]): LightSource[] {
  const out: LightSource[] = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = cellAt(grid, x, y)!;
      if (!c.p) continue;
      const pd = PROP_MAP[c.p];
      if (pd && pd.light) out.push({ x, y, bright: pd.light.bright, dim: pd.light.dim });
    }
  }
  for (const t of tokens) {
    if (t.light) out.push({ x: t.x, y: t.y, bright: t.light.bright, dim: t.light.dim });
  }
  return out;
}

export interface LightMap {
  level: Uint8Array;        // LightLevel per cell
  intensity: Float32Array;  // 1 inside bright, fading to ~0 at the dim edge; 0 in the dark
}

/** Light per cell. Overlapping lights take the brightest. */
export function computeLightMap(grid: Grid, sources: LightSource[]): LightMap {
  const level = new Uint8Array(grid.w * grid.h);
  const intensity = new Float32Array(grid.w * grid.h);
  const fov = emptyMask(grid);
  for (const s of sources) {
    const reach = Math.max(s.bright, s.dim);
    if (reach <= 0) continue;
    fov.fill(0);
    computeFov(grid, s.x, s.y, reach, fov);
    const b2 = (s.bright + 0.5) * (s.bright + 0.5);
    const dimSpan = Math.max(0.5, reach - s.bright);
    for (let i = 0; i < fov.length; i++) {
      if (!fov[i]) continue;
      const x = i % grid.w, y = (i - x) / grid.w;
      const dx = x - s.x, dy = y - s.y;
      const d2 = dx * dx + dy * dy;
      const lv = d2 <= b2 ? BRIGHT : DIM;
      if (lv > level[i]) level[i] = lv;
      const dist = Math.sqrt(d2);
      const t = lv === BRIGHT ? 1 : Math.max(0.08, 1 - (dist - s.bright) / (dimSpan + 0.5));
      if (t > intensity[i]) intensity[i] = t;
    }
  }
  return { level, intensity };
}

/** Only player characters count toward what the players see. */
export function isPartyToken(t: Token): boolean {
  return t.type === 'pc';
}

/** Cells within this distance of a viewer are always seen, even in darkness (you can feel the walls). */
export const TOUCH_RANGE = 1;

/**
 * SeeLevel per cell for a set of viewers, given the light map.
 * Bright light within vision radius -> SEEN_BRIGHT; dim -> SEEN_DIM;
 * darkness within darkvision radius, or within touch range -> SEEN_DARKVISION.
 */
export function computeVision(grid: Grid, viewers: Token[], light: Uint8Array): Uint8Array {
  const seen = new Uint8Array(grid.w * grid.h);
  const fov = emptyMask(grid);
  for (const v of viewers) {
    const vision = Math.max(0, v.vision.radius);
    const dark = Math.max(TOUCH_RANGE, v.vision.darkvision);
    const reach = Math.max(vision, dark);
    fov.fill(0);
    computeFov(grid, v.x, v.y, reach, fov);
    const v2 = (vision + 0.5) * (vision + 0.5);
    const d2 = (dark + 0.5) * (dark + 0.5);
    for (let i = 0; i < fov.length; i++) {
      if (!fov[i]) continue;
      const x = i % grid.w, y = (i - x) / grid.w;
      const dx = x - v.x, dy = y - v.y;
      const dist2 = dx * dx + dy * dy;
      let lvl: number = UNSEEN;
      if (light[i] === BRIGHT && dist2 <= v2) lvl = SEEN_BRIGHT;
      else if (light[i] === DIM && dist2 <= v2) lvl = SEEN_DIM;
      else if (dist2 <= d2) lvl = SEEN_DARKVISION;
      if (lvl > seen[i]) seen[i] = lvl;
    }
  }
  return seen;
}

export interface Scene {
  light: Uint8Array;        // LightLevel per cell
  intensity: Float32Array;  // smooth light falloff for rendering
  party: Uint8Array;        // SeeLevel per cell, player characters only
  monsters: Uint8Array;     // SeeLevel per cell, monster tokens only (DM overlay)
}

/** Pure: computes the whole scene without touching the grid. */
export function computeScene(grid: Grid, tokens: Token[]): Scene {
  const lm = computeLightMap(grid, collectLightSources(grid, tokens));
  return {
    light: lm.level,
    intensity: lm.intensity,
    party: computeVision(grid, tokens.filter(isPartyToken), lm.level),
    monsters: computeVision(grid, tokens.filter(t => t.type === 'monster'), lm.level),
  };
}

/**
 * The one place fog memory is written. Every cell the party can see right now
 * has its current appearance snapshotted, so later DM edits in areas the party
 * has left stay hidden until they look again. Returns the count of newly explored cells.
 */
export function markExplored(grid: Grid, party: Uint8Array): number {
  let added = 0;
  for (let i = 0; i < party.length; i++) {
    if (!party[i]) continue;
    const c = grid.cells[i];
    if (!c.mem) added++;
    rememberCell(c);
  }
  return added;
}

/** Is this token drawn in Player View? */
export function tokenVisibleToParty(t: Token, party: Uint8Array, gridW: number): boolean {
  if (t.hidden) return false;
  if (isPartyToken(t)) return true;
  return party[t.y * gridW + t.x] > UNSEEN;
}
