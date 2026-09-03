/* Mouse and keyboard interaction with the map canvas: painting, token
   placement and dragging, panning, zoom, view-mode and overlay toggles, undo. */

import type { Token } from '../engine/data';
import { cellAt, inBounds } from '../engine/grid';
import { canvas, effCell, requestRender } from '../render/canvas';
import { invalidateScene, popUndo, pushUndo, state, type Overlays } from '../state';
import { $ } from './dom';
import { setStatus } from './status';
import { cancelPlacing, readTokenForm, renderInspector, renderTokenList } from './tokens';

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

function selectToken(tok: Token | null): void {
  state.selectedTokenId = tok ? tok.id : null;
  renderInspector(); renderTokenList(); requestRender();
}

function placeTokenAt(x: number, y: number): void {
  const cfg = readTokenForm();
  pushUndo();
  const tok: Token = {
    id: state.nextTokenId++,
    name: cfg.name || ('Token ' + (state.nextTokenId - 1)),
    type: cfg.type, x, y, color: cfg.color, size: cfg.size,
    vision: cfg.vision, light: cfg.light,
    hidden: cfg.hidden || undefined,
  };
  state.tokens.push(tok);
  state.selectedTokenId = tok.id;
  invalidateScene();
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
  if (e.button !== 0) return;
  const { x, y } = eventToCell(e);
  if (!inBounds(state.grid, x, y)) return;

  if (state.tool === 'select') {
    const tok = tokenAtCell(x, y);
    if (tok) { draggingToken = tok; pushUndo(); }
    selectToken(tok);
    return;
  }
  if (state.tool === 'token') {
    const existing = tokenAtCell(x, y);
    if (existing) { selectToken(existing); return; }
    if (state.placingToken) placeTokenAt(x, y);
    return;
  }
  if (state.tool === 'door') {
    const c = cellAt(state.grid, x, y)!;
    if (c.d) { pushUndo(); c.doOpen = !c.doOpen; invalidateScene(); requestRender(); return; }
  }

  painting = true;
  if (state.brushMode === 'rect') { rectStart = { x, y }; }
  else {
    pushUndo();
    applyToolAtCell(x, y);
    invalidateScene();
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
    if (inBounds(state.grid, x, y) && (draggingToken.x !== x || draggingToken.y !== y)) {
      draggingToken.x = x; draggingToken.y = y; invalidateScene(); requestRender();
    }
    return;
  }
  if (painting && state.brushMode === 'single' && inBounds(state.grid, x, y)) {
    applyToolAtCell(x, y);
    invalidateScene();
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
      invalidateScene();
      requestRender();
    }
    rectStart = null;
  }
  painting = false;
}

function setTool(tool: 'select' | 'pan' | 'terrain'): void {
  if (state.tool === 'token') cancelPlacing();
  state.tool = tool;
  setStatus();
}

function isTypingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

export function initInteraction(): void {
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  let spaceHeld = false;
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      if (state.tool === 'token') { cancelPlacing(); state.tool = 'select'; }
      selectToken(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
      setStatus();
      return;
    }
    if (isTypingInField()) return;
    if (e.code === 'Space' && !spaceHeld) { spaceHeld = true; canvas.classList.add('tool-pan'); e.preventDefault(); }
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'h' || e.key === 'H') setTool(state.tool === 'pan' ? 'terrain' : 'pan');
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceHeld = false; if (state.tool !== 'pan') canvas.classList.remove('tool-pan'); }
  });

  $('btnUndo').addEventListener('click', undo);
  $('btnSelectTool').addEventListener('click', () => setTool(state.tool === 'select' ? 'terrain' : 'select'));
  $('btnPanTool').addEventListener('click', () => setTool(state.tool === 'pan' ? 'terrain' : 'pan'));
}

export function initZoomAndViews(): void {
  const label = () => { $('zoomReset').textContent = Math.round(state.zoom * 100) + '%'; };
  $('zoomIn').addEventListener('click', () => { state.zoom = Math.min(2.4, state.zoom + 0.15); label(); requestRender(); });
  $('zoomOut').addEventListener('click', () => { state.zoom = Math.max(0.4, state.zoom - 0.15); label(); requestRender(); });
  $('zoomReset').addEventListener('click', () => { state.zoom = 1; label(); requestRender(); });
  label();

  $('btnPlayerView').addEventListener('click', (e) => {
    state.playerView = !state.playerView;
    if (state.playerView) state.dmPreview = false;
    (e.currentTarget as HTMLElement).classList.toggle('active', state.playerView);
    $('btnDmPreview').classList.remove('active');
    requestRender(); setStatus();
  });
  $('btnDmPreview').addEventListener('click', (e) => {
    if (state.playerView) return;
    state.dmPreview = !state.dmPreview;
    (e.currentTarget as HTMLElement).classList.toggle('active', state.dmPreview);
    requestRender(); setStatus();
  });

  const bindOverlay = (id: string, key: keyof Overlays) => {
    $(id).addEventListener('click', () => {
      state.overlays[key] = !state.overlays[key];
      requestRender(); setStatus();
    });
  };
  bindOverlay('btnOvLight', 'light');
  bindOverlay('btnOvParty', 'party');
  bindOverlay('btnOvMonsters', 'monsters');
}
