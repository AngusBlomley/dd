/* Mouse and keyboard interaction with the map canvas: painting, token
   placement and dragging, panning, zoom, view-mode toggles, undo. */

import type { Token } from '../engine/data';
import { cellAt, inBounds } from '../engine/grid';
import { canvas, effCell, requestRender } from '../render/canvas';
import { invalidateVisibility, popUndo, pushUndo, state } from '../state';
import { $ } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

const wrap = $('canvas-wrap');

let painting = false;
let rectStart: { x: number; y: number } | null = null;
let draggingToken: Token | null = null;
let panDragging = false;
let panStart = { x: 0, y: 0 };
let scrollStart = { l: 0, t: 0 };

function eventToCell(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cs = effCell();
  return { x: Math.floor((e.clientX - rect.left) / cs), y: Math.floor((e.clientY - rect.top) / cs) };
}

function tokenAtCell(x: number, y: number): Token | null {
  for (let i = state.tokens.length - 1; i >= 0; i--) {
    if (state.tokens[i].x === x && state.tokens[i].y === y) return state.tokens[i];
  }
  return null;
}

function applyToolAtCell(x: number, y: number): void {
  const c = cellAt(state.grid, x, y);
  if (!c) return;
  switch (state.tool) {
    case 'terrain': c.t = state.selectedTerrain; c.w = false; break;
    case 'wall': c.w = true; c.d = false; c.p = null; break;
    case 'door': c.d = true; c.doOpen = false; c.w = false; c.p = null; break;
    case 'prop': c.p = state.selectedProp; c.w = false; c.d = false; break;
    case 'eraser': c.w = false; c.d = false; c.p = null; break;
  }
}

function refreshAll(): void {
  renderInspector(); renderTokenList(); requestRender(); setStatus();
}

export function undo(): void {
  if (!popUndo()) return;
  refreshAll();
}

function onMouseDown(e: MouseEvent): void {
  if (e.button === 1 || state.tool === 'pan') {
    panDragging = true; panStart = { x: e.clientX, y: e.clientY };
    scrollStart = { l: wrap.scrollLeft, t: wrap.scrollTop };
    canvas.classList.add('panning');
    e.preventDefault();
    return;
  }
  const { x, y } = eventToCell(e);
  if (!inBounds(state.grid, x, y)) return;

  if (state.tool === 'select') {
    const tok = tokenAtCell(x, y);
    if (tok) { state.selectedTokenId = tok.id; draggingToken = tok; pushUndo(); }
    else state.selectedTokenId = null;
    renderInspector(); renderTokenList(); requestRender();
    return;
  }
  if (state.tool === 'token') {
    const existing = tokenAtCell(x, y);
    if (existing) { state.selectedTokenId = existing.id; renderInspector(); renderTokenList(); requestRender(); return; }
    if (state.pendingTokenConfig) {
      pushUndo();
      const cfg = state.pendingTokenConfig;
      const tok: Token = {
        id: state.nextTokenId++,
        name: cfg.name || ('Token ' + state.nextTokenId),
        type: cfg.type, x, y, color: cfg.color, size: cfg.size,
        vision: cfg.vision, darkvision: cfg.darkvision,
        hasLight: cfg.hasLight, lightRadius: cfg.lightRadius,
      };
      state.tokens.push(tok);
      state.selectedTokenId = tok.id;
      invalidateVisibility();
      refreshAll();
      $('armHint').style.display = 'none';
    }
    return;
  }
  if (state.tool === 'door') {
    const c = cellAt(state.grid, x, y)!;
    if (c.d) { pushUndo(); c.doOpen = !c.doOpen; invalidateVisibility(); requestRender(); return; }
  }

  painting = true;
  if (state.brushMode === 'rect') { rectStart = { x, y }; }
  else {
    pushUndo();
    applyToolAtCell(x, y);
    invalidateVisibility();
    requestRender();
  }
}

function onMouseMove(e: MouseEvent): void {
  const { x, y } = eventToCell(e);
  $('hover-coord').textContent = inBounds(state.grid, x, y) ? 'x:' + x + '  y:' + y : '—';

  if (panDragging) {
    wrap.scrollLeft = scrollStart.l - (e.clientX - panStart.x);
    wrap.scrollTop = scrollStart.t - (e.clientY - panStart.y);
    return;
  }
  if (draggingToken) {
    if (inBounds(state.grid, x, y)) { draggingToken.x = x; draggingToken.y = y; invalidateVisibility(); requestRender(); }
    return;
  }
  if (painting && state.brushMode === 'single' && inBounds(state.grid, x, y)) {
    applyToolAtCell(x, y);
    invalidateVisibility();
    requestRender();
  }
}

function onMouseUp(e: MouseEvent): void {
  if (panDragging) { panDragging = false; canvas.classList.remove('panning'); return; }
  if (draggingToken) { draggingToken = null; return; }
  if (painting && state.brushMode === 'rect' && rectStart) {
    const { x, y } = eventToCell(e);
    if (inBounds(state.grid, x, y)) {
      pushUndo();
      const x0 = Math.min(rectStart.x, x), x1 = Math.max(rectStart.x, x);
      const y0 = Math.min(rectStart.y, y), y1 = Math.max(rectStart.y, y);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) applyToolAtCell(xx, yy);
      invalidateVisibility();
      requestRender();
    }
    rectStart = null;
  }
  painting = false;
}

export function initInteraction(): void {
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  let spaceHeld = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceHeld) { spaceHeld = true; canvas.classList.add('tool-pan'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceHeld = false; if (state.tool !== 'pan') canvas.classList.remove('tool-pan'); }
  });

  $('btnUndo').addEventListener('click', undo);
}

export function initZoomAndViews(): void {
  const label = () => { $('zoomReset').textContent = Math.round(state.zoom * 100) + '%'; };
  $('zoomIn').addEventListener('click', () => { state.zoom = Math.min(2.4, state.zoom + 0.15); label(); requestRender(); });
  $('zoomOut').addEventListener('click', () => { state.zoom = Math.max(0.4, state.zoom - 0.15); label(); requestRender(); });
  $('zoomReset').addEventListener('click', () => { state.zoom = 1; label(); requestRender(); });
  label();

  $('btnPanTool').addEventListener('click', (e) => {
    state.tool = state.tool === 'pan' ? 'terrain' : 'pan';
    (e.currentTarget as HTMLElement).classList.toggle('active', state.tool === 'pan');
    canvas.classList.toggle('tool-pan', state.tool === 'pan');
    setStatus();
  });

  $('btnPlayerView').addEventListener('click', (e) => {
    state.playerView = !state.playerView;
    if (state.playerView) state.dmPreview = false;
    (e.currentTarget as HTMLElement).classList.toggle('active', state.playerView);
    $('btnDmPreview').classList.remove('active');
    invalidateVisibility();
    requestRender(); setStatus();
  });
  $('btnDmPreview').addEventListener('click', (e) => {
    if (state.playerView) return;
    state.dmPreview = !state.dmPreview;
    (e.currentTarget as HTMLElement).classList.toggle('active', state.dmPreview);
    invalidateVisibility();
    requestRender(); setStatus();
  });
}
