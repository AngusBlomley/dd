/* DM-side session: owns the room, knows the players, pushes each of them a
   filtered view of the map their character is on, and (Phase 4) applies the
   moves players request when the movement mode allows it. The DM's device is
   the only writer: every player move is validated here first. */

import { computeScene, markExplored, UNSEEN, type Scene } from '../engine/lighting';
import { canOperateDoor, validateMove, type MoveDenial, type MoveRules } from '../engine/movement';
import { hasEntry, requestSave, resolveEntry, resolveExit, transferToken } from '../campaign';
import { markChanged, onChange, pushUndo, scene as activeScene, state } from '../state';
import type { MapRecord } from '../store/json';
import { PeerHost } from './peerTransport';
import { applyPatch, diffViews, type Assignment, type ClientMessage, type HostMessage, type MapView, type MoveMode } from './protocol';
import { relayAvailable, type HostTransport } from './transport';
import { buildMapView } from './views';
import { RelayHost } from './wsTransport';

export interface PlayerRec {
  playerId: string;
  name: string;
  peerId: string | null;
  connected: boolean;
  mapId: string | null;
  tokenId: number | null;
  lastView: MapView | null;
  lastAssign: string;
}

export interface SessionInfo { code: string; mode: 'lan' | 'webrtc'; joinUrl: string }

type Listener = () => void;

const PERSIST_KEY = 'ct.session';
interface Persisted {
  code: string;
  moveMode: MoveMode;
  movementPerTurn: number;
  players: { playerId: string; name: string; mapId: string | null; tokenId: number | null }[];
}

class HostSession {
  info: SessionInfo | null = null;
  players = new Map<string, PlayerRec>();
  /* movement */
  moveMode: MoveMode = 'dm';
  turnPlayerId: string | null = null;
  movementPerTurn = 6;          // cells (30 ft)
  movementLeft: number | null = null;

  private peerToPlayer = new Map<string, string>();
  private transport: HostTransport | null = null;
  private refreshTimer: number | null = null;
  private listeners: Listener[] = [];
  private changeHooked = false;

  get active(): boolean { return !!this.info; }
  onUpdate(fn: Listener): void { this.listeners.push(fn); }
  private emit(): void { this.persist(); for (const fn of this.listeners) fn(); }

  /** Kept in sessionStorage so a DM page refresh does not lose the room or who plays whom. */
  private persist(): void {
    try {
      if (!this.info) { sessionStorage.removeItem(PERSIST_KEY); return; }
      const data: Persisted = {
        code: this.info.code, moveMode: this.moveMode, movementPerTurn: this.movementPerTurn,
        players: [...this.players.values()].map(p => ({ playerId: p.playerId, name: p.name, mapId: p.mapId, tokenId: p.tokenId })),
      };
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  /** After a page load: reopen the previous room with the same code and remember the players. */
  async resume(): Promise<boolean> {
    let saved: Persisted | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(PERSIST_KEY) || 'null'); } catch { saved = null; }
    if (!saved || !saved.code) return false;
    this.moveMode = saved.moveMode || 'dm';
    this.movementPerTurn = saved.movementPerTurn || 6;
    for (const p of saved.players || []) {
      this.players.set(p.playerId, { playerId: p.playerId, name: p.name, peerId: null, connected: false, mapId: p.mapId, tokenId: p.tokenId, lastView: null, lastAssign: '' });
    }
    try { await this.start(saved.code); return true; }
    catch (err) { console.warn('could not resume session', err); return false; }
  }

  async start(preferredCode?: string): Promise<SessionInfo> {
    if (this.info) return this.info;
    const lan = await relayAvailable();
    const transport: HostTransport = lan ? new RelayHost() : new PeerHost();
    transport.onPeerJoin(() => { /* wait for hello */ });
    transport.onPeerLeave((peerId) => {
      const pid = this.peerToPlayer.get(peerId);
      this.peerToPlayer.delete(peerId);
      const p = pid ? this.players.get(pid) : null;
      if (p && p.peerId === peerId) { p.connected = false; p.peerId = null; p.lastView = null; p.lastAssign = ''; }
      this.emit();
    });
    transport.onMessage((peerId, raw) => this.onMessage(peerId, raw as ClientMessage));
    const { code, mode } = await transport.start(preferredCode);
    this.transport = transport;
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    this.info = { code, mode, joinUrl: `${base}#/join/${code}` };
    if (!this.changeHooked) { onChange(() => this.scheduleRefresh()); this.changeHooked = true; }
    this.emit();
    return this.info;
  }

  stop(): void {
    if (!this.transport) return;
    this.send({ type: 'end' });
    this.transport.stop();
    this.transport = null;
    this.info = null;
    for (const p of this.players.values()) { p.connected = false; p.peerId = null; p.lastView = null; p.lastAssign = ''; }
    this.peerToPlayer.clear();
    this.emit();
  }

  private send(msg: HostMessage, peerId?: string): void {
    if (!this.transport) return;
    if (peerId) this.transport.send(peerId, msg); else this.transport.broadcast(msg);
  }

  private onMessage(peerId: string, msg: ClientMessage): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') { this.send({ type: 'pong' }, peerId); return; }
    if (msg.type === 'hello') {
      const id = String(msg.playerId || '').slice(0, 40) || peerId;
      const name = String(msg.name || 'Player').slice(0, 24);
      let p = this.players.get(id);
      if (!p) { p = { playerId: id, name, peerId, connected: true, mapId: null, tokenId: null, lastView: null, lastAssign: '' }; this.players.set(id, p); }
      else { p.name = name; p.peerId = peerId; p.connected = true; p.lastView = null; p.lastAssign = ''; }
      this.peerToPlayer.set(peerId, id);
      this.send({ type: 'welcome', playerId: id, name }, peerId);
      this.emit();
      this.scheduleRefresh();
      return;
    }
    if (msg.type === 'move') { this.onMoveRequest(peerId, msg); return; }
    if (msg.type === 'door') { this.onDoorRequest(peerId, msg); return; }
  }

  /** The player, their map and token for a request, or null (after a denial) if not assigned. */
  private requester(peerId: string, tokenId: number): { p: PlayerRec; map: MapRecord; token: import('../engine/data').Token } | null {
    const pid = this.peerToPlayer.get(peerId);
    const p = pid ? this.players.get(pid) : null;
    const c = state.campaign;
    if (!p || !c) return null;
    if (p.tokenId === null || p.tokenId !== tokenId || !p.mapId) { this.deny(peerId, p, 'not-your-token'); return null; }
    const rec = c.maps.find(m => m.id === p.mapId);
    const map = rec && rec.id === state.mapId ? { ...rec, grid: state.grid, tokens: state.tokens } : rec;
    const token = map?.tokens.find(t => t.id === p.tokenId);
    if (!map || !token) { this.deny(peerId, p, 'not-your-token'); return null; }
    return { p, map, token };
  }

  private deny(peerId: string, p: PlayerRec, reason: MoveDenial): void {
    this.send({ type: 'move-denied', reason, movementLeft: this.turnPlayerId === p.playerId ? this.movementLeft : null }, peerId);
  }

  /** A player opens or closes a door next to their character (issue #8). */
  private onDoorRequest(peerId: string, msg: { tokenId: number; x: number; y: number }): void {
    const r = this.requester(peerId, msg.tokenId);
    if (!r) return;
    const { p, map, token } = r;
    const x = msg.x | 0, y = msg.y | 0;
    const check = canOperateDoor(map.grid, token, x, y);
    if (!check.ok) { this.deny(peerId, p, check.reason); return; }
    const cell = map.grid.cells[y * map.grid.w + x];
    if (map.id === state.mapId) pushUndo();
    cell.doOpen = !cell.doOpen;
    if (map.id === state.mapId) markChanged(); else { requestSave(); this.scheduleRefresh(); }
    this.emit();
  }

  /* ---------- assignments ---------- */

  assign(playerId: string, mapId: string | null, tokenId: number | null): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.mapId = mapId; p.tokenId = tokenId;
    this.syncTurnToken();
    this.emit();
    this.scheduleRefresh();
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.peerId) { this.send({ type: 'end' }, p.peerId); this.peerToPlayer.delete(p.peerId); }
    this.players.delete(playerId);
    if (this.turnPlayerId === playerId) this.giveTurn(null);
    this.emit();
  }

  /** Called after a token moves between maps so the owner follows it. */
  retarget(fromMapId: string, fromTokenId: number, toMapId: string, toTokenId: number): void {
    for (const p of this.players.values()) {
      if (p.mapId === fromMapId && p.tokenId === fromTokenId) { p.mapId = toMapId; p.tokenId = toTokenId; }
    }
    this.syncTurnToken();
    this.emit();
    this.scheduleRefresh();
  }

  /* ---------- movement and turns ---------- */

  setMoveMode(mode: MoveMode): void {
    this.moveMode = mode;
    if (mode !== 'turn') this.turnPlayerId = null;
    this.syncTurnToken();
    this.emit();
    this.scheduleRefresh();
  }

  setMovementPerTurn(cells: number): void {
    this.movementPerTurn = Math.max(1, Math.round(cells));
    if (this.turnPlayerId) this.movementLeft = this.movementPerTurn;
    this.emit();
    this.scheduleRefresh();
  }

  giveTurn(playerId: string | null): void {
    this.turnPlayerId = playerId && this.players.has(playerId) ? playerId : null;
    this.movementLeft = this.turnPlayerId ? this.movementPerTurn : null;
    this.syncTurnToken();
    this.emit();
    this.scheduleRefresh();
  }

  /** Cycles to the next assigned player in join order. */
  nextTurn(): void {
    const order = [...this.players.values()].filter(p => p.tokenId !== null);
    if (!order.length) { this.giveTurn(null); return; }
    const i = order.findIndex(p => p.playerId === this.turnPlayerId);
    this.giveTurn(order[(i + 1) % order.length].playerId);
  }

  resetMovement(): void {
    if (this.turnPlayerId) this.movementLeft = this.movementPerTurn;
    this.emit();
    this.scheduleRefresh();
  }

  /** Keeps state.turnTokenId pointing at the turn-holder's token when it is on the active map. */
  private syncTurnToken(): void {
    const p = this.turnPlayerId ? this.players.get(this.turnPlayerId) : null;
    state.turnTokenId = p && p.mapId === state.mapId && p.tokenId !== null ? p.tokenId : null;
  }

  private onMoveRequest(peerId: string, msg: { tokenId: number; x: number; y: number }): void {
    const r = this.requester(peerId, msg.tokenId);
    if (!r) return;
    const { p, map, token } = r;
    const deny = (reason: MoveDenial) => this.deny(peerId, p, reason);
    const x = msg.x | 0, y = msg.y | 0;
    const sc = this.sceneFor(map);
    const allowed = (cx: number, cy: number) => {
      const i = cy * map.grid.w + cx;
      return sc.party[i] > UNSEEN || !!map.grid.cells[i].mem;
    };
    const rules: MoveRules = {
      mode: this.moveMode,
      turnTokenId: this.turnPlayerId === p.playerId ? token.id : null,
      movementLeft: this.movementLeft,
    };
    const result = validateMove(map.grid, map.tokens, token, x, y, rules, allowed);
    if (!result.ok) { deny(result.reason); return; }
    if (map.id === state.mapId) pushUndo();
    token.x = x; token.y = y;
    if (this.moveMode === 'turn' && this.movementLeft !== null) this.movementLeft = Math.max(0, this.movementLeft - result.path.length);
    if (map.id === state.mapId) markChanged(); else { requestSave(); this.scheduleRefresh(); }
    this.emit();
    this.autoTravel(map, token.id, x, y);
  }

  /** A character walking onto an Exit, or back onto an Entry, changes map by itself (issue #14). */
  private autoTravel(map: MapRecord, tokenId: number, x: number, y: number): void {
    const cell = map.grid.cells[y * map.grid.w + x];
    if (!cell) return;
    let dest: { map: MapRecord; x: number; y: number } | null = null;
    if (cell.p === 'exit') {
      const r = resolveExit(map, x, y);
      if (r && hasEntry(r.map)) dest = r;   // no arrival point: the player waits for the DM instead
    } else if (cell.p === 'entry') {
      dest = resolveEntry(map, x, y);
    }
    if (!dest) return;
    const newId = transferToken(map.id, tokenId, dest.map.id, dest.x, dest.y);
    if (newId !== null) this.retarget(map.id, tokenId, dest.map.id, newId);
  }

  /* ---------- pushing views ---------- */

  scheduleRefresh(): void {
    if (!this.transport || this.refreshTimer !== null) return;
    this.refreshTimer = window.setTimeout(() => { this.refreshTimer = null; this.refresh(); }, 40);
  }

  private sceneFor(map: MapRecord): Scene {
    if (map.id === state.mapId) return activeScene();
    const sc = computeScene(map.grid, map.tokens);
    if (markExplored(map.grid, sc.party) > 0) requestSave();
    return sc;
  }

  private refresh(): void {
    const c = state.campaign;
    if (!c || !this.transport) return;
    const views = new Map<string, MapView>();
    const viewFor = (map: MapRecord): MapView => {
      let v = views.get(map.id);
      if (!v) { v = buildMapView(map, this.sceneFor(map)); views.set(map.id, v); }
      return v;
    };
    const turnPlayer = this.turnPlayerId ? this.players.get(this.turnPlayerId) : null;
    for (const p of this.players.values()) {
      if (!p.connected || !p.peerId) continue;
      let map = p.mapId ? c.maps.find(m => m.id === p.mapId) : undefined;
      let token = map && p.tokenId !== null ? map.tokens.find(t => t.id === p.tokenId) : undefined;
      if (!token) { map = undefined; p.mapId = null; p.tokenId = null; }
      const shown = map ?? c.maps.find(m => m.id === state.mapId) ?? c.maps[0];
      const live = map && map.id === state.mapId ? { ...map, grid: state.grid, tokens: state.tokens } : map;
      const onExit = !!(token && live && live.grid.cells[token.y * live.grid.w + token.x]?.p === 'exit');
      const exit = token && live && onExit ? resolveExit(live, token.x, token.y) : null;
      const exitState: Assignment['exitState'] = !onExit ? 'none' : !exit ? 'nowhere' : !hasEntry(exit.map) ? 'no-entry' : 'ready';
      const atExit = onExit;
      const target = exit?.map;
      const yourTurn = this.moveMode === 'turn' && this.turnPlayerId === p.playerId;
      const assignment: Assignment = {
        mapId: shown.id, tokenId: token ? token.id : null, atExit, exitLabel: target?.name, exitState,
        mode: this.moveMode,
        canMove: !!token && (this.moveMode === 'free' || yourTurn),
        yourTurn,
        movementLeft: yourTurn ? this.movementLeft : null,
        turnName: this.moveMode === 'turn' ? (turnPlayer?.name ?? null) : null,
      };
      const key = JSON.stringify(assignment);
      if (key !== p.lastAssign) { p.lastAssign = key; this.send({ type: 'assign', assignment }, p.peerId); }

      const view = viewFor(shown);
      if (p.lastView && p.lastView.mapId === view.mapId && p.lastView.w === view.w && p.lastView.h === view.h) {
        const patch = diffViews(p.lastView, view);
        if (patch) { this.send({ type: 'patch', patch }, p.peerId); applyPatch(p.lastView, patch); }
      } else {
        this.send({ type: 'snapshot', view }, p.peerId);
        p.lastView = cloneView(view);
      }
    }
  }

  /** Player characters standing on linked exits, for the DM's "send through" list. */
  waitingAtExits(): { mapId: string; mapName: string; tokenId: number; tokenName: string; to: MapRecord | null; link: { x: number; y: number } | null; playerName: string | null }[] {
    const c = state.campaign;
    if (!c) return [];
    const out = [];
    for (const m of c.maps) {
      const live = m.id === state.mapId ? { ...m, grid: state.grid, tokens: state.tokens } : m;
      for (const t of live.tokens) {
        if (t.type !== 'pc') continue;
        const cell = live.grid.cells[t.y * live.grid.w + t.x];
        if (!cell || cell.p !== 'exit') continue;
        const r = resolveExit(live, t.x, t.y);
        const owner = [...this.players.values()].find(p => p.mapId === m.id && p.tokenId === t.id);
        out.push({ mapId: m.id, mapName: m.name, tokenId: t.id, tokenName: t.name, to: r ? r.map : null, link: r ? { x: r.x, y: r.y } : null, playerName: owner?.name ?? null });
      }
    }
    return out;
  }
}

function cloneView(v: MapView): MapView {
  return { ...v, cells: v.cells.slice(), see: v.see.slice(), intensity: v.intensity.slice(), tokens: v.tokens.map(t => ({ ...t })) };
}

export const session = new HostSession();
