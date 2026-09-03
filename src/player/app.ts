/* The player app: join a room, receive the party's view of the map, render it.
   Read-only in this phase; Phase 4 adds moving your own token on your turn. */

import { paintMap } from '../render/canvas';
import type { Layers } from '../state';
import { PeerClient } from '../net/peerTransport';
import { applyPatch, normalizeCode, type Assignment, type HostMessage, type MapView } from '../net/protocol';
import { relayAvailable, type ClientStatus, type ClientTransport } from '../net/transport';
import { RelayClient } from '../net/wsTransport';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const LAYERS: Layers = { terrain: true, walls: true, props: true, tokens: true, grid: true };
const BASE_CELL = 28;

let view: MapView | null = null;
let assignment: Assignment | null = null;
let transport: ClientTransport | null = null;
let zoom = 1;
let fitted = false;
let intensityF = new Float32Array(0);

function playerId(): string {
  try {
    let id = localStorage.getItem('ct.playerId');
    if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('ct.playerId', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 12); }
}

/* ---------- rendering ---------- */

const canvas = $('playerCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const wrap = $('pWrap');

function cellSize(): number { return Math.max(6, Math.round(BASE_CELL * zoom)); }

function fitToScreen(): void {
  if (!view) return;
  const zw = (wrap.clientWidth - 8) / (view.w * BASE_CELL);
  const zh = (wrap.clientHeight - 8) / (view.h * BASE_CELL);
  zoom = Math.max(0.3, Math.min(2.5, Math.min(zw, zh)));
}

let queued = false;
function requestPaint(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; paint(); });
}

function paint(): void {
  if (!view) return;
  if (!fitted) { fitToScreen(); fitted = true; }
  const cs = cellSize();
  const wpx = view.w * cs, hpx = view.h * cs;
  if (canvas.width !== wpx) canvas.width = wpx;
  if (canvas.height !== hpx) canvas.height = hpx;
  const v = view;
  const mine = assignment?.tokenId ?? null;
  if (intensityF.length !== v.intensity.length) intensityF = new Float32Array(v.intensity.length);
  for (let i = 0; i < v.intensity.length; i++) intensityF[i] = v.intensity[i] / 255;
  paintMap({
    ctx, cs, w: v.w, h: v.h,
    lookAt: (i) => v.cells[i],
    memAt: (i) => v.cells[i],
    see: v.see,
    intensity: intensityF,
    playerSide: true,
    layers: LAYERS,
    tokens: v.tokens.map(t => ({ x: t.x, y: t.y, size: t.size, color: t.color, initials: t.initials, light: t.light, mine: t.id === mine })),
  });
}

/* ---------- pan and zoom (one finger pans, two pinch, wheel zooms) ---------- */

function setZoom(z: number, clientX?: number, clientY?: number): void {
  const nz = Math.max(0.3, Math.min(3, z));
  if (nz === zoom) return;
  const r = wrap.getBoundingClientRect();
  const ax = clientX === undefined ? r.width / 2 : clientX - r.left;
  const ay = clientY === undefined ? r.height / 2 : clientY - r.top;
  const old = cellSize();
  const mx = (wrap.scrollLeft + ax) / old, my = (wrap.scrollTop + ay) / old;
  zoom = nz;
  paint();
  const cs = cellSize();
  wrap.scrollLeft = mx * cs - ax;
  wrap.scrollTop = my * cs - ay;
}

function initGestures(): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
  let pan: { x: number; y: number; l: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan = null;
    } else if (pointers.size === 1) {
      pan = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      setZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), cx, cy);
      wrap.scrollLeft -= cx - pinch.cx; wrap.scrollTop -= cy - pinch.cy;
      pinch.cx = cx; pinch.cy = cy;
    } else if (pan) {
      wrap.scrollLeft = pan.l - (e.clientX - pan.x);
      wrap.scrollTop = pan.t - (e.clientY - pan.y);
    }
  });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (pointers.size === 0) pan = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
  }, { passive: false });
  $('pZoomIn').addEventListener('click', () => setZoom(zoom * 1.2));
  $('pZoomOut').addEventListener('click', () => setZoom(zoom / 1.2));
  $('pZoomFit').addEventListener('click', () => { fitToScreen(); paint(); });
  window.addEventListener('resize', () => { if (view) requestPaint(); });
}

/* ---------- status and banners ---------- */

function setStatus(text: string, kind: 'ok' | 'warn' | 'bad' = 'ok'): void {
  const el = $('pStatus');
  el.textContent = text;
  el.className = 'pstatus ' + kind;
}

function updateBanner(): void {
  const b = $('pBanner');
  if (!assignment || assignment.tokenId === null) {
    b.textContent = 'Waiting for the DM to place you on the map.';
    b.hidden = false;
  } else if (assignment.atExit) {
    b.textContent = 'You are standing at an exit' + (assignment.exitLabel ? ' to ' + assignment.exitLabel : '') + '. Waiting for the DM to open the way.';
    b.hidden = false;
  } else {
    b.hidden = true;
  }
  $('pMapName').textContent = view ? view.name : '';
}

/* ---------- connection ---------- */

function onHostMessage(raw: unknown): void {
  const m = raw as HostMessage;
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'welcome':
      setStatus('Connected as ' + m.name);
      break;
    case 'assign':
      assignment = m.assignment;
      updateBanner();
      requestPaint();
      break;
    case 'snapshot':
      if (!view || view.mapId !== m.view.mapId) fitted = false;
      view = m.view;
      updateBanner();
      requestPaint();
      break;
    case 'patch':
      if (view && view.mapId === m.patch.mapId) { applyPatch(view, m.patch); updateBanner(); requestPaint(); }
      break;
    case 'end':
      setStatus('The DM ended the session.', 'warn');
      transport?.close();
      break;
  }
}

async function join(code: string, name: string): Promise<void> {
  const lan = await relayAvailable();
  transport = lan ? new RelayClient() : new PeerClient();
  transport.onMessage(onHostMessage);
  transport.onStatus((s: ClientStatus, detail?: string) => {
    if (s === 'connected') { setStatus('Connected'); transport?.send({ type: 'hello', playerId: playerId(), name }); }
    else if (s === 'connecting') setStatus('Connecting…', 'warn');
    else if (s === 'reconnecting') setStatus(detail || 'Connection lost. Reconnecting…', 'warn');
    else if (s === 'no-room') setStatus('No room with code ' + code + '. Check the code with your DM.', 'bad');
    else if (s === 'closed') setStatus('Disconnected.', 'bad');
  });
  $('pJoin').hidden = true;
  $('pMain').hidden = false;
  try {
    await transport.connect(code);
  } catch (err) {
    console.error(err);
    if (String((err as Error).message) !== 'no-room') setStatus('Could not connect. ' + (lan ? 'Is the host still running?' : 'Check your internet connection and the code.'), 'bad');
    $('pJoin').hidden = false;
    $('pMain').hidden = true;
  }
}

export function startPlayerApp(codeFromUrl: string | null): void {
  document.getElementById('app')!.hidden = true;
  const root = $('player-app');
  root.hidden = false;
  document.body.classList.add('player-mode');
  initGestures();

  const codeEl = $<HTMLInputElement>('pCode');
  const nameEl = $<HTMLInputElement>('pName');
  try {
    nameEl.value = localStorage.getItem('ct.playerName') || '';
    codeEl.value = codeFromUrl || localStorage.getItem('ct.lastCode') || '';
  } catch { /* ignore */ }
  if (codeFromUrl) codeEl.value = codeFromUrl;

  const go = () => {
    const code = normalizeCode(codeEl.value);
    const name = nameEl.value.trim();
    if (!code) { codeEl.focus(); return; }
    if (!name) { nameEl.focus(); return; }
    try { localStorage.setItem('ct.playerName', name); localStorage.setItem('ct.lastCode', code); } catch { /* ignore */ }
    void join(code, name);
  };
  $('pJoinBtn').addEventListener('click', go);
  nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('pLeave').addEventListener('click', () => { transport?.close(); transport = null; view = null; $('pMain').hidden = true; $('pJoin').hidden = false; });
  (codeFromUrl ? nameEl : codeEl).focus();
}
