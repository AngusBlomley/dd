/* Application state, undo/redo and the scene cache.
   UI and render modules read and mutate this; the engine never imports it. */

import type { Token } from './engine/data';
import { createGrid, type Grid } from './engine/grid';
import { computeScene, markExplored, type Scene } from './engine/lighting';
import type { Campaign } from './store/json';

export type ToolId = 'terrain' | 'wall' | 'door' | 'secretdoor' | 'prop' | 'prefab' | 'eraser' | 'select' | 'token' | 'pan';
export type BrushMode = 'single' | 'rect';

export interface Overlays {
  light: boolean;    // shade dark / dim cells in DM view
  party: boolean;    // tint cells the party can see
  monsters: boolean; // tint cells monsters can see
  memory: boolean;   // tint cells the party has explored
}

export interface Layers {
  terrain: boolean;
  walls: boolean;
  props: boolean;
  tokens: boolean;
  grid: boolean;
}

export interface AppState {
  campaign: Campaign | null;
  mapId: string | null;
  grid: Grid;
  tokens: Token[];
  nextTokenId: number;
  selectedTerrain: string;
  selectedProp: string;
  selectedPrefab: string;
  prefabTurns: number;                          // quarter turns clockwise for the prefab tool
  hoverCell: { x: number; y: number } | null;   // for the prefab preview
  dragFrom: { x: number; y: number } | null;    // where a dragged token started (drawn as a ghost)
  selection: { x0: number; y0: number; x1: number; y1: number } | null; // area picked with the Select tool
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;   // area being dragged out right now
  selectionOffset: { dx: number; dy: number } | null;                   // preview while moving a selection
  tool: ToolId;
  brushMode: BrushMode;
  playerView: boolean;
  dmPreview: boolean;
  overlays: Overlays;
  layers: Layers;
  zoom: number;
  baseCell: number;
  selectedTokenId: number | null;
  selectedCell: { x: number; y: number } | null; // a cell picked with the Select tool (exit links)
  turnTokenId: number | null; // token whose turn it is, when on the active map (drawn with a ring)
  placingToken: boolean; // "Place on Map" armed; the form is read at click time
  dirty: boolean;        // unsaved changes since the last autosave
  mapLit: boolean;       // the active map is fully lit (mirrors the map record)
}

export const state: AppState = {
  campaign: null,
  mapId: null,
  grid: createGrid(34, 24, 'stone'),
  tokens: [],
  nextTokenId: 1,
  selectedTerrain: 'stone',
  selectedProp: 'torch',
  selectedPrefab: 'tavern',
  prefabTurns: 0,
  hoverCell: null,
  dragFrom: null,
  selection: null,
  marquee: null,
  selectionOffset: null,
  tool: 'terrain',
  brushMode: 'single',
  playerView: false,
  dmPreview: false,
  overlays: { light: false, party: false, monsters: false, memory: false },
  layers: { terrain: true, walls: true, props: true, tokens: true, grid: true },
  zoom: 1,
  baseCell: 28,
  selectedTokenId: null,
  selectedCell: null,
  turnTokenId: null,
  placingToken: false,
  dirty: false,
  mapLit: false,
};

/* ---------- change notification ----------
   Anything that edits the map calls markChanged(); listeners (autosave) subscribe. */
const changeListeners: (() => void)[] = [];
export function onChange(fn: () => void): void { changeListeners.push(fn); }
export function markChanged(): void {
  state.dirty = true;
  invalidateScene();
  for (const fn of changeListeners) fn();
}

/* ---------- scene cache ----------
   The scene is recomputed lazily after any change. Explored memory is updated
   here, in one explicit step, whenever a fresh scene is computed. It is never
   touched by rendering, and it does not depend on which view the DM is looking at:
   memory tracks what the party has seen, whichever screen is showing. */
let sceneCache: Scene | null = null;
export function invalidateScene(): void { sceneCache = null; }
export function scene(): Scene {
  if (!sceneCache) {
    sceneCache = computeScene(state.grid, state.tokens, state.mapLit);
    if (markExplored(state.grid, sceneCache.party) > 0) {
      state.dirty = true;
      for (const fn of changeListeners) fn();
    }
  }
  return sceneCache;
}

/* ---------- undo / redo ---------- */
interface Snapshot { grid: Grid; tokens: Token[]; nextTokenId: number }
const undoStack: string[] = [];
const redoStack: string[] = [];
const MAX_UNDO = 40;

function snapshot(): string {
  const s: Snapshot = { grid: state.grid, tokens: state.tokens, nextTokenId: state.nextTokenId };
  return JSON.stringify(s);
}
function restore(raw: string): void {
  const snap = JSON.parse(raw) as Snapshot;
  // Explored memory is kept: undo is for edits, not for what the party has seen.
  if (snap.grid.w === state.grid.w && snap.grid.h === state.grid.h) {
    for (let i = 0; i < snap.grid.cells.length; i++) snap.grid.cells[i].mem = state.grid.cells[i].mem;
  }
  state.grid = snap.grid;
  state.tokens = snap.tokens;
  state.nextTokenId = snap.nextTokenId;
  state.selectedTokenId = null;
  markChanged();
}
export function pushUndo(): void {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}
export function popUndo(): boolean {
  const raw = undoStack.pop();
  if (!raw) return false;
  redoStack.push(snapshot());
  restore(raw);
  return true;
}
export function popRedo(): boolean {
  const raw = redoStack.pop();
  if (!raw) return false;
  undoStack.push(snapshot());
  restore(raw);
  return true;
}
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}
export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }
