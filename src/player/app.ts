/* The player app: join a room, receive the party's view of the map, render it,
   and (when the DM allows) move your own character. */

import { paintMap } from '../render/canvas';
import type { Layers } from '../state';
import { PeerClient } from '../net/peerTransport';
import { applyPatch, normalizeCode, type Assignment, type HostMessage, type MapView, type MoveDenial } from '../net/protocol';
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
let pendingCenter = false;        // centre on my token after the next paint
let moveTarget: { x: number; y: number } | null = null; // cell under a drag / tap-to-move
let dragActive = false;           // dragging own token: draw it at moveTarget with a ghost at home
let picking = false;              // tapped own token: next tap is the destination

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

function myToken() {
  const id = assignment?.tokenId ?? null;
  return id === null || !view ? null : view.tokens.find(t => t.id === id) ?? null;
}

/** Scrolls so my character sits in the middle of the screen. */
function centerOnMe(): void {
  const t = myToken();
  if (!t) return;
  const cs = cellSize();
  wrap.scrollLeft = t.x * cs + cs / 2 - wrap.clientWidth / 2;
  wrap.scrollTop = t.y * cs + cs / 2 - wrap.clientHeight / 2;
}

function myTokenOffScreen(): boolean {
  const t = myToken();
  if (!t) return false;
  const cs = cellSize();
  const px = t.x * cs + cs / 2 - wrap.scrollLeft, py = t.y * cs + cs / 2 - wrap.scrollTop;
  return px < 0 || py < 0 || px > wrap.clientWidth || py > wrap.clientHeight;
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
    tokens: v.tokens.flatMap(t => {
      const isMine = t.id === mine;
      const base = { size: t.size, color: t.color, initials: t.initials, light: t.light, mine: isMine, selected: picking && isMine };
      if (isMine && dragActive && moveTarget) {
        return [{ ...base, x: t.x, y: t.y, ghost: true }, { ...base, x: moveTarget.x, y: moveTarget.y }];
      }
      return [{ ...base, x: t.x, y: t.y }];
    }),
    highlightCell: dragActive ? null : moveTarget,
  });
  if (pendingCenter) { pendingCenter = false; centerOnMe(); }
}

/* ---------- pan, zoom and moving your character ---------- */

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

function cellAtClient(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!view) return null;
  const r = canvas.getBoundingClientRect();
  const cs = cellSize();
  const x = Math.floor((clientX - r.left) / cs), y = Math.floor((clientY - r.top) / cs);
  return x >= 0 && y >= 0 && x < view.w && y < view.h ? { x, y } : null;
}

/** A tap on a door next to your character opens or closes it (issue #8); a tap on a chest looks inside (issue #18). */
function tapCell(x: number, y: number): void {
  const t = myToken();
  if (!t || !view) return;
  const cell = view.cells[y * view.w + x];
  if (!cell) return;
  if (cell.loot) { openLoot(x, y); return; }
  if (!cell.d) return;
  if (Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) > 1) { toast('You need to be next to the door.'); return; }
  transport?.send({ type: 'door', tokenId: t.id, x, y });
}

/* ---------- treasure: look and take ---------- */

let lootOpen: { x: number; y: number } | null = null;

function nearbyLoot(): { x: number; y: number; title: string }[] {
  const t = myToken();
  if (!t || !view) return [];
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = t.x + dx, y = t.y + dy;
    if (x < 0 || y < 0 || x >= view.w || y >= view.h) continue;
    const c = view.cells[y * view.w + x];
    if (c?.loot) out.push({ x, y, title: c.loot.title });
  }
  return out;
}

function renderNearby(): void {
  const el = $('pNearby');
  const items = nearbyLoot();
  el.innerHTML = '';
  el.hidden = items.length === 0;
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'btn small'; b.textContent = 'Look: ' + it.title;
    b.addEventListener('click', () => openLoot(it.x, it.y));
    el.appendChild(b);
  }
  if (lootOpen) {
    const c = view?.cells[lootOpen.y * view.w + lootOpen.x];
    if (!c?.loot) closeLoot(); else renderLoot(c.loot);
  }
}

function renderLoot(loot: { title: string; text: string; canTake: boolean }): void {
  const t = myToken();
  const adjacent = !!(t && lootOpen && Math.max(Math.abs(t.x - lootOpen.x), Math.abs(t.y - lootOpen.y)) <= 1);
  $('pLootTitle').textContent = loot.title;
  $('pLootText').textContent = loot.text || 'Nothing more to see.';
  const take = $<HTMLButtonElement>('pLootTake');
  take.hidden = !loot.canTake;
  take.disabled = !adjacent;
  take.textContent = adjacent ? 'Take it' : 'Move closer to take it';
}

function openLoot(x: number, y: number): void {
  const c = view?.cells[y * view.w + x];
  if (!c?.loot) return;
  lootOpen = { x, y };
  $('pLoot').hidden = false;
  renderLoot(c.loot);
}

function closeLoot(): void {
  lootOpen = null;
  $('pLoot').hidden = true;
}

function requestMove(x: number, y: number): void {
  const t = myToken();
  if (!t || !assignment?.canMove) return;
  if (t.x === x && t.y === y) return;
  transport?.send({ type: 'move', tokenId: t.id, x, y });
}

function initGestures(): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
  let pan: { x: number; y: number; l: number; t: number } | null = null;
  let dragging: { startX: number; startY: number; moved: boolean } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan = null; dragging = null; moveTarget = null; dragActive = false; requestPaint();
    } else if (pointers.size === 1) {
      const cell = cellAtClient(e.clientX, e.clientY);
      const t = myToken();
      if (assignment?.canMove && t && cell && cell.x === t.x && cell.y === t.y) {
        dragging = { startX: e.clientX, startY: e.clientY, moved: false };
        dragActive = true;
      } else if (picking && cell) {
        picking = false; moveTarget = null; requestPaint();
        requestMove(cell.x, cell.y);
      } else {
        pan = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
      }
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
    } else if (dragging) {
      if (Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > 6) dragging.moved = true;
      const cell = cellAtClient(e.clientX, e.clientY);
      if (dragging.moved && cell && (!moveTarget || moveTarget.x !== cell.x || moveTarget.y !== cell.y)) { moveTarget = cell; requestPaint(); }
    } else if (pan) {
      wrap.scrollLeft = pan.l - (e.clientX - pan.x);
      wrap.scrollTop = pan.t - (e.clientY - pan.y);
    }
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (dragging) {
      const cell = cellAtClient(e.clientX, e.clientY);
      if (dragging.moved && cell) requestMove(cell.x, cell.y);
      else { picking = !picking; }          // a tap on your own token arms tap-to-move
      dragging = null; moveTarget = null; dragActive = false; requestPaint();
    }
    if (pan && pointers.size === 0) {
      if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 6) {
        const cell = cellAtClient(e.clientX, e.clientY);
        if (cell) tapCell(cell.x, cell.y);
      }
      pan = null;
    }
  };
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
  $('pFindMe').addEventListener('click', () => { pendingCenter = true; paint(); });
  $('pLootClose').addEventListener('click', closeLoot);
  $('pLootTake').addEventListener('click', () => {
    const t = myToken();
    if (!t || !lootOpen) return;
    transport?.send({ type: 'take', tokenId: t.id, x: lootOpen.x, y: lootOpen.y });
  });
  window.addEventListener('resize', () => { if (view) requestPaint(); });
}

/* ---------- status, banners, toasts ---------- */

function setStatus(text: string, kind: 'ok' | 'warn' | 'bad' = 'ok'): void {
  const el = $('pStatus');
  el.textContent = text;
  el.className = 'pstatus ' + kind;
}

let toastTimer: number | null = null;
function toast(text: string): void {
  const el = $('pToast');
  el.textContent = text;
  el.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 1800);
}

const ft = (cells: number) => cells * 5 + ' ft';

function updateBanner(): void {
  const b = $('pBanner');
  const turn = $('pTurn');
  if (!assignment || assignment.tokenId === null) {
    b.textContent = 'Waiting for the DM to place you on the map.';
    b.hidden = false;
  } else if (assignment.exitState === 'nowhere') {
    b.textContent = 'This exit leads nowhere yet. The DM will place you when ready.';
    b.hidden = false;
  } else if (assignment.exitState === 'no-entry') {
    b.textContent = (assignment.exitLabel || 'The next map') + ' has no arrival point yet. The DM will place you when ready.';
    b.hidden = false;
  } else if (assignment.atExit) {
    b.textContent = 'You are at an exit' + (assignment.exitLabel ? ' to ' + assignment.exitLabel : '') + '. Step off and back on to go through, or wait for the DM.';
    b.hidden = false;
  } else {
    b.hidden = true;
  }
  if (!assignment || assignment.tokenId === null) { turn.textContent = ''; turn.className = 'pturn'; }
  else if (assignment.mode === 'free') { turn.textContent = 'Free movement: drag your character'; turn.className = 'pturn can'; }
  else if (assignment.mode === 'turn' && assignment.yourTurn) { turn.textContent = 'Your turn · ' + ft(assignment.movementLeft ?? 0) + ' left'; turn.className = 'pturn can'; }
  else if (assignment.mode === 'turn') { turn.textContent = assignment.turnName ? assignment.turnName + "'s turn" : 'Waiting for the DM to start turns'; turn.className = 'pturn'; }
  else { turn.textContent = 'The DM moves the characters'; turn.className = 'pturn'; }
  $('pFindMe').hidden = !assignment || assignment.tokenId === null;
  $('pMapName').textContent = view ? view.name : '';
  renderNearby();
  if (!assignment?.canMove) { picking = false; moveTarget = null; }
}

const DENIALS: Record<MoveDenial, string> = {
  'not-your-token': 'That is not your character.',
  'not-your-turn': 'Not your turn.',
  'blocked': 'You cannot move there.',
  'too-far': 'Too far.',
  'no-path': 'No way through that you can see.',
  'out-of-bounds': 'Off the map.',
  'not-adjacent': 'You need to be next to it.',
  'not-a-door': 'There is nothing to do there.',
};

/* ---------- connection ---------- */

function onHostMessage(raw: unknown): void {
  const m = raw as HostMessage;
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'welcome':
      setStatus('Connected as ' + m.name);
      break;
    case 'assign': {
      const prev = assignment;
      assignment = m.assignment;
      if (assignment.tokenId !== null && (!prev || prev.tokenId !== assignment.tokenId || prev.mapId !== assignment.mapId)) pendingCenter = true;
      updateBanner();
      requestPaint();
      break;
    }
    case 'snapshot':
      if (!view || view.mapId !== m.view.mapId) { fitted = false; pendingCenter = true; }
      view = m.view;
      $('pWaiting').hidden = true;
      updateBanner();
      requestPaint();
      break;
    case 'patch':
      if (view && view.mapId === m.patch.mapId) {
        const before = myToken();
        applyPatch(view, m.patch);
        const after = myToken();
        if (before && after && (before.x !== after.x || before.y !== after.y) && myTokenOffScreen()) pendingCenter = true;
        updateBanner();
        requestPaint();
      }
      break;
    case 'move-denied':
      toast(DENIALS[m.reason] + (m.reason === 'too-far' && m.movementLeft !== null ? ' ' + ft(m.movementLeft) + ' left.' : ''));
      break;
    case 'notice':
      toast(m.text);
      break;
    case 'end':
      setStatus('The DM ended the session.', 'warn');
      transport?.close();
      break;
  }
}

function joinFeedback(text: string, busy: boolean, kind: 'info' | 'bad' = 'info'): void {
  const el = $('pJoinStatus');
  el.innerHTML = (busy ? '<span class="spinner"></span> ' : '') + text;
  el.className = 'pjoin-status ' + kind;
  $<HTMLButtonElement>('pJoinBtn').disabled = busy;
}

async function join(code: string, name: string): Promise<void> {
  joinFeedback('Looking for the host…', true);
  const lan = await relayAvailable();
  transport = lan ? new RelayClient() : new PeerClient();
  transport.onMessage(onHostMessage);
  transport.onStatus((s: ClientStatus, detail?: string) => {
    if (s === 'connected') { setStatus('Connected'); transport?.send({ type: 'hello', playerId: playerId(), name }); }
    else if (s === 'connecting') { setStatus('Connecting…', 'warn'); joinFeedback('Connecting to room ' + code + '…', true); }
    else if (s === 'reconnecting') setStatus(detail || 'Connection lost. Reconnecting…', 'warn');
    else if (s === 'no-room') { setStatus('No room with code ' + code + '.', 'bad'); joinFeedback('No room with code ' + code + '. Check the code with your DM.', false, 'bad'); }
    else if (s === 'closed') setStatus('Disconnected.', 'bad');
  });
  try {
    await transport.connect(code);
    joinFeedback('', false);
    $('pJoin').hidden = true;
    $('pMain').hidden = false;
    $('pWaiting').hidden = false;
  } catch (err) {
    console.error(err);
    if (String((err as Error).message) !== 'no-room') {
      joinFeedback('Could not connect. ' + (lan ? 'Is the host still running?' : 'Check your internet connection and the code.'), false, 'bad');
    }
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
  $('pLeave').addEventListener('click', () => { transport?.close(); transport = null; view = null; $('pMain').hidden = true; $('pJoin').hidden = false; joinFeedback('', false); });
  (codeFromUrl ? nameEl : codeEl).focus();
}
