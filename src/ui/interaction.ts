/* Pointer and keyboard interaction with the map canvas: painting, token
   placement and dragging, panning, pinch and wheel zoom, view-mode toggles,
   undo and redo. Works for mouse, pen and touch through pointer events. */

import type { Token } from '../engine/data';
import { cellAt, inBounds } from '../engine/grid';
import { PREFAB_MAP, stampPrefab } from '../engine/prefabs';
import { canvas, effCell, render, requestRender } from '../render/canvas';
import { markChanged, popRedo, popUndo, pushUndo, state, type Overlays } from '../state';
import { $ } from './dom';
import { setStatus } from './status';
import { cancelPlacing, createTokenAt, renderInspector, renderTokenList } from './tokens';

const wrap = $('canvas-wrap');
const MIN_ZOOM = 0.35, MAX_ZOOM = 3;

let painting = false;
let rectStart: { x: number; y: number } | null = null;
let draggingToken: Token | null = null;
let panning = false;
let panStart = { x: 0, y: 0 };
let scrollStart = { l: 0, t: 0 };

// active pointers for pinch
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;

function clientToCell(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cs = effCell();
  return { x: Math.floor((clientX - rect.left) / cs), y: Math.floor((clientY - rect.top) / cs) };
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
    case 'wall': c.w = true; c.d = false; c.secret = false; c.p = null; break;
    case 'door': c.d = true; c.secret = false; c.doOpen = false; c.w = false; c.p = null; break;
    case 'secretdoor': c.d = true; c.secret = true; c.doOpen = false; c.w = false; c.p = null; break;
    case 'prop': c.p = state.selectedProp; c.w = false; c.d = false; c.secret = false; break;
    case 'eraser': c.w = false; c.d = false; c.secret = false; c.doOpen = false; c.p = null; break;
  }
}

function refreshAll(): void {
  renderInspector(); renderTokenList(); requestRender(); setStatus();
}

export function undo(): void { if (popUndo()) refreshAll(); }
export function redo(): void { if (popRedo()) refreshAll(); }

function selectToken(tok: Token | null): void {
  state.selectedTokenId = tok ? tok.id : null;
  renderInspector(); renderTokenList(); requestRender();
}


/* ---------- zoom ---------- */

/** Sets zoom keeping the map point under (clientX, clientY) fixed on screen. */
export function setZoom(zoom: number, clientX?: number, clientY?: number): void {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  if (z === state.zoom) return;
  const wrapRect = wrap.getBoundingClientRect();
  const ax = clientX === undefined ? wrapRect.width / 2 : clientX - wrapRect.left;
  const ay = clientY === undefined ? wrapRect.height / 2 : clientY - wrapRect.top;
  const oldCs = effCell();
  const mapX = (wrap.scrollLeft + ax) / oldCs, mapY = (wrap.scrollTop + ay) / oldCs;
  state.zoom = z;
  render(); // synchronous so the new canvas size is in layout before we scroll
  const cs = effCell();
  wrap.scrollLeft = mapX * cs - ax;
  wrap.scrollTop = mapY * cs - ay;
  $('zoomReset').textContent = Math.round(state.zoom * 100) + '%';
}

/* ---------- pointer handlers ---------- */

function startPan(clientX: number, clientY: number): void {
  panning = true; panStart = { x: clientX, y: clientY };
  scrollStart = { l: wrap.scrollLeft, t: wrap.scrollTop };
  canvas.classList.add('panning');
}

function cancelStroke(): void {
  painting = false; rectStart = null; draggingToken = null;
}

function onPointerDown(e: PointerEvent): void {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    // second finger: switch to pinch / two-finger pan, abandon any single-finger action
    cancelStroke();
    panning = false; canvas.classList.remove('panning');
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    scrollStart = { l: wrap.scrollLeft, t: wrap.scrollTop };
    e.preventDefault();
    return;
  }
  if (pointers.size > 2) return;

  const touchPans = e.pointerType === 'touch' && (state.playerView || state.tool === 'pan');
  if (e.button === 1 || state.tool === 'pan' || touchPans) {
    startPan(e.clientX, e.clientY);
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  const { x, y } = clientToCell(e.clientX, e.clientY);
  if (!inBounds(state.grid, x, y)) return;
  if (state.playerView) return; // no editing from the player side

  if (state.tool === 'select') {
    const tok = tokenAtCell(x, y);
    if (tok) { draggingToken = tok; pushUndo(); state.dragFrom = { x, y }; }
    const cell = cellAt(state.grid, x, y);
    state.selectedCell = !tok && cell && (cell.p === 'exit' || cell.p === 'entry' || cell.d) ? { x, y } : null;
    selectToken(tok);
    return;
  }
  if (state.tool === 'token') {
    const existing = tokenAtCell(x, y);
    if (existing) { selectToken(existing); return; }
    if (state.placingToken) { createTokenAt(x, y); refreshAll(); }
    return;
  }
  if (state.tool === 'prefab') {
    pushUndo();
    stampPrefab(state.grid, PREFAB_MAP[state.selectedPrefab], x, y);
    markChanged();
    requestRender();
    return;
  }
  const c = cellAt(state.grid, x, y)!;
  if (state.tool === 'door' && c.d) {
    pushUndo(); c.doOpen = !c.doOpen; markChanged(); requestRender(); return;
  }
  if (state.tool === 'secretdoor' && c.d && c.secret) {
    pushUndo(); c.secret = false; markChanged(); requestRender(); return; // reveal
  }

  painting = true;
  if (state.brushMode === 'rect') { rectStart = { x, y }; }
  else {
    pushUndo();
    applyToolAtCell(x, y);
    markChanged();
    requestRender();
  }
}

function onPointerMove(e: PointerEvent): void {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    setZoom(pinch.zoom * (dist / pinch.dist), cx, cy);
    wrap.scrollLeft -= cx - pinch.cx;
    wrap.scrollTop -= cy - pinch.cy;
    pinch.cx = cx; pinch.cy = cy;
    e.preventDefault();
    return;
  }

  const { x, y } = clientToCell(e.clientX, e.clientY);
  $('hover-coord').textContent = inBounds(state.grid, x, y) ? 'x:' + x + '  y:' + y : '—';
  if (state.tool === 'prefab') {
    const hc = inBounds(state.grid, x, y) ? { x, y } : null;
    if ((hc?.x !== state.hoverCell?.x) || (hc?.y !== state.hoverCell?.y)) { state.hoverCell = hc; requestRender(); }
  }

  if (panning) {
    wrap.scrollLeft = scrollStart.l - (e.clientX - panStart.x);
    wrap.scrollTop = scrollStart.t - (e.clientY - panStart.y);
    return;
  }
  if (draggingToken) {
    if (inBounds(state.grid, x, y) && (draggingToken.x !== x || draggingToken.y !== y)) {
      draggingToken.x = x; draggingToken.y = y; markChanged(); requestRender();
    }
    return;
  }
  if (painting && state.brushMode === 'single' && inBounds(state.grid, x, y)) {
    applyToolAtCell(x, y);
    markChanged();
    requestRender();
  }
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  if (panning) { panning = false; canvas.classList.remove('panning'); return; }
  if (draggingToken) { draggingToken = null; state.dragFrom = null; requestRender(); return; }
  if (painting && state.brushMode === 'rect' && rectStart) {
    const { x, y } = clientToCell(e.clientX, e.clientY);
    if (inBounds(state.grid, x, y)) {
      pushUndo();
      const x0 = Math.min(rectStart.x, x), x1 = Math.max(rectStart.x, x);
      const y0 = Math.min(rectStart.y, y), y1 = Math.max(rectStart.y, y);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) applyToolAtCell(xx, yy);
      markChanged();
      requestRender();
    }
    rectStart = null;
  }
  painting = false;
}

function setTool(tool: 'select' | 'pan' | 'terrain'): void {
  if (state.tool === 'token') cancelPlacing();
  state.tool = tool;
  state.hoverCell = null;
  setStatus();
  requestRender();
}

function isTypingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

export function initInteraction(): void {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // trackpad pinch and ctrl+wheel zoom; plain wheel scrolls the map as usual
  wrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(state.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  }, { passive: false });

  let spaceHeld = false;
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') {
      if (state.tool === 'token') { cancelPlacing(); state.tool = 'select'; }
      if (state.tool === 'prefab') { state.tool = 'select'; state.hoverCell = null; }
      state.selectedCell = null;
      selectToken(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
      setStatus();
      return;
    }
    if (isTypingInField()) return;
    if (e.code === 'Space' && !spaceHeld) { spaceHeld = true; canvas.classList.add('tool-pan'); e.preventDefault(); }
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'h' || e.key === 'H') setTool(state.tool === 'pan' ? 'terrain' : 'pan');
    if (e.key === '=' || e.key === '+') setZoom(state.zoom * 1.15);
    if (e.key === '-' || e.key === '_') setZoom(state.zoom / 1.15);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceHeld = false; if (state.tool !== 'pan') canvas.classList.remove('tool-pan'); }
  });

  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnSelectTool').addEventListener('click', () => setTool(state.tool === 'select' ? 'terrain' : 'select'));
  $('btnPanTool').addEventListener('click', () => setTool(state.tool === 'pan' ? 'terrain' : 'pan'));
}

export function initZoomAndViews(): void {
  $('zoomIn').addEventListener('click', () => setZoom(state.zoom * 1.15));
  $('zoomOut').addEventListener('click', () => setZoom(state.zoom / 1.15));
  $('zoomReset').addEventListener('click', () => setZoom(1));
  $('zoomReset').textContent = '100%';

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
