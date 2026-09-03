/* Application state, undo stack and the scene cache.
   UI and render modules read and mutate this; the engine never imports it. */

import type { Token } from './engine/data';
import { createGrid, type Grid } from './engine/grid';
import { computeScene, markExplored, type Scene } from './engine/lighting';

export type ToolId = 'terrain' | 'wall' | 'door' | 'prop' | 'eraser' | 'select' | 'token' | 'pan';
export type BrushMode = 'single' | 'rect';

export interface Overlays {
  light: boolean;    // shade dark / dim cells in DM view
  party: boolean;    // tint cells the party can see
  monsters: boolean; // tint cells monsters can see
}

export interface AppState {
  grid: Grid;
  tokens: Token[];
  nextTokenId: number;
  selectedTerrain: string;
  selectedProp: string;
  tool: ToolId;
  brushMode: BrushMode;
  playerView: boolean;
  dmPreview: boolean;
  overlays: Overlays;
  zoom: number;
  baseCell: number;
  selectedTokenId: number | null;
  placingToken: boolean; // "Place on Map" armed; the form is read at click time
}

export const state: AppState = {
  grid: createGrid(34, 24, 'stone'),
  tokens: [],
  nextTokenId: 1,
  selectedTerrain: 'stone',
  selectedProp: 'torch',
  tool: 'terrain',
  brushMode: 'single',
  playerView: false,
  dmPreview: false,
  overlays: { light: false, party: false, monsters: false },
  zoom: 1,
  baseCell: 28,
  selectedTokenId: null,
  placingToken: false,
};

/* ---------- scene cache ----------
   The scene is recomputed lazily after any change. Explored memory is updated
   here, in one explicit step, whenever a fresh scene is computed. It is never
   touched by rendering, and it does not depend on which view the DM is looking at:
   memory tracks what the party has seen, whichever screen is showing. */
let sceneCache: Scene | null = null;
export function invalidateScene(): void { sceneCache = null; }
export function scene(): Scene {
  if (!sceneCache) {
    sceneCache = computeScene(state.grid, state.tokens);
    markExplored(state.grid, sceneCache.party);
  }
  return sceneCache;
}

/* ---------- undo ---------- */
interface Snapshot { grid: Grid; tokens: Token[]; nextTokenId: number }
const undoStack: string[] = [];
const MAX_UNDO = 25;

function snapshot(): string {
  const s: Snapshot = { grid: state.grid, tokens: state.tokens, nextTokenId: state.nextTokenId };
  return JSON.stringify(s);
}
export function pushUndo(): void {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}
/** Restores the previous snapshot. Explored memory is kept: undo is for edits, not for what the party has seen. */
export function popUndo(): boolean {
  const raw = undoStack.pop();
  if (!raw) return false;
  const snap = JSON.parse(raw) as Snapshot;
  if (snap.grid.w === state.grid.w && snap.grid.h === state.grid.h) {
    for (let i = 0; i < snap.grid.cells.length; i++) snap.grid.cells[i].mem = state.grid.cells[i].mem;
  }
  state.grid = snap.grid;
  state.tokens = snap.tokens;
  state.nextTokenId = snap.nextTokenId;
  state.selectedTokenId = null;
  invalidateScene();
  return true;
}
