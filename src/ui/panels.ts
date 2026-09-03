/* Generator panel, map settings (resize, clear fog), new map. */

import { generateDungeon } from '../engine/generator';
import { createGrid, resizeGrid } from '../engine/grid';
import { requestRender } from '../render/canvas';
import { invalidateVisibility, pushUndo, state } from '../state';
import { $ } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

const num = (id: string) => parseInt($<HTMLInputElement>(id).value, 10);

export function initGeneratorPanel(): void {
  $('genRooms').addEventListener('input', (e) => { $('genRoomsVal').textContent = (e.target as HTMLInputElement).value; });
  $('btnGenerate').addEventListener('click', () => {
    pushUndo();
    const roomMin = num('genRoomMin');
    state.grid = generateDungeon({
      w: num('genW'),
      h: num('genH'),
      theme: $<HTMLSelectElement>('genTheme').value,
      roomCount: num('genRooms'),
      roomMin,
      roomMax: Math.max(roomMin, num('genRoomMax')),
      pillarDensity: parseFloat($<HTMLSelectElement>('genPillars').value),
      torchDensity: parseFloat($<HTMLSelectElement>('genTorches').value),
      stairsUp: num('genStairsUp'),
      stairsDown: num('genStairsDown'),
      seed: $<HTMLInputElement>('genSeed').value.trim(),
    });
    state.tokens.forEach(t => { t.x = Math.min(t.x, state.grid.w - 1); t.y = Math.min(t.y, state.grid.h - 1); });
    invalidateVisibility();
    requestRender(); setStatus();
  });
}

export function initMapSettings(): void {
  $('btnResize').addEventListener('click', () => {
    const w = num('mapW'), h = num('mapH');
    if (!w || !h) return;
    pushUndo();
    state.grid = resizeGrid(state.grid, w, h);
    state.tokens = state.tokens.filter(t => t.x < w && t.y < h);
    invalidateVisibility();
    requestRender(); setStatus(); renderTokenList();
  });

  $('btnClearFog').addEventListener('click', () => {
    pushUndo();
    state.grid.cells.forEach(c => { c.ex = false; });
    invalidateVisibility();
    requestRender();
  });

  $('btnNewMap').addEventListener('click', () => {
    if (!confirm('Start a new blank map? Unsaved changes will be lost unless you Save first.')) return;
    pushUndo();
    state.grid = createGrid(34, 24, 'stone');
    state.tokens = []; state.selectedTokenId = null;
    invalidateVisibility();
    requestRender(); setStatus(); renderTokenList(); renderInspector();
  });
}
