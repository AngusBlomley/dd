/* Application state, undo stack and the visibility cache.
   UI and render modules read and mutate this; the engine never imports it. */

import type { Token, TokenType } from './engine/data';
import { createGrid, type Grid } from './engine/grid';
import { computeSceneVisibility, type SceneVisibility } from './engine/lighting';

export type ToolId = 'terrain' | 'wall' | 'door' | 'prop' | 'eraser' | 'select' | 'token' | 'pan';
export type BrushMode = 'single' | 'rect';

export interface PendingTokenConfig {
  name: string; type: TokenType; color: string; size: number;
  vision: number; darkvision: boolean; hasLight: boolean; lightRadius: number;
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
  zoom: number;
  baseCell: number;
  selectedTokenId: number | null;
  pendingTokenConfig: PendingTokenConfig | null;
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
  zoom: 1,
  baseCell: 28,
  selectedTokenId: null,
  pendingTokenConfig: null,
};

/* ---------- visibility cache ---------- */
let visCache: SceneVisibility | null = null;
export function invalidateVisibility(): void { visCache = null; }
export function sceneVisibility(): SceneVisibility {
  if (!visCache) visCache = computeSceneVisibility(state.grid, state.tokens);
  return visCache;
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
/** Restores the previous snapshot. Returns false if there was nothing to undo. */
export function popUndo(): boolean {
  const raw = undoStack.pop();
  if (!raw) return false;
  const snap = JSON.parse(raw) as Snapshot;
  state.grid = snap.grid;
  state.tokens = snap.tokens;
  state.nextTokenId = snap.nextTokenId;
  state.selectedTokenId = null;
  invalidateVisibility();
  return true;
}
