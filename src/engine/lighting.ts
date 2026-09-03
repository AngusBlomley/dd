/* Scene lighting: which cells are lit, and which cells tokens can see.
   Phase 0 keeps prototype 1 behaviour, including bug B1 (every token
   contributes to vision). Phase 1 replaces this with the model in the spec. */

import { PROP_MAP, type Token } from './data';
import { cellKey, computeVisibility } from './fov';
import { cellAt, type Grid } from './grid';

export interface SceneVisibility {
  litCells: Set<string>;
  sightCells: Set<string>; // normal vision, needs light
  darkCells: Set<string>;  // darkvision, ignores light
}

export function computeSceneVisibility(grid: Grid, tokens: Token[]): SceneVisibility {
  const litCells = new Set<string>();
  const sightCells = new Set<string>();
  const darkCells = new Set<string>();

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = cellAt(grid, x, y);
      if (c && c.p) {
        const pd = PROP_MAP[c.p];
        if (pd && pd.light) {
          computeVisibility(grid, x, y, pd.radius || 4).forEach(v => litCells.add(v));
        }
      }
    }
  }
  for (const tok of tokens) {
    if (tok.hasLight) {
      computeVisibility(grid, tok.x, tok.y, tok.lightRadius || 4).forEach(v => litCells.add(v));
    }
    const vis = computeVisibility(grid, tok.x, tok.y, tok.vision || 0);
    if (tok.darkvision) vis.forEach(v => darkCells.add(v));
    else vis.forEach(v => sightCells.add(v));
  }
  return { litCells, sightCells, darkCells };
}

export type FogState = 'visible' | 'memory' | 'hidden';

/** Is the cell currently seen by the scene? Pure: does not touch explored memory. */
export function isSeenNow(scene: SceneVisibility, x: number, y: number): boolean {
  const key = cellKey(x, y);
  return (scene.sightCells.has(key) && scene.litCells.has(key)) || scene.darkCells.has(key);
}
