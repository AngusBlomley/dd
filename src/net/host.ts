/* DM-side session: owns the room, knows the players, and pushes each of them
   a filtered view of the map their character is on. The DM's device is the
   only writer; nothing here accepts state changes from players (Phase 4 will). */

import { computeScene, markExplored, type Scene } from '../engine/lighting';
import { requestSave } from '../campaign';
import { onChange, scene as activeScene, state } from '../state';
import type { MapRecord } from '../store/json';
import { PeerHost } from './peerTransport';
import { applyPatch, diffViews, type Assignment, type ClientMessage, type HostMessage, type MapView } from './protocol';
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

class HostSession {
  info: SessionInfo | null = null;
  players = new Map<string, PlayerRec>();
  private peerToPlayer = new Map<string, string>();
  private transport: HostTransport | null = null;
  private refreshTimer: number | null = null;
  private listeners: Listener[] = [];
  private changeHooked = false;

  get active(): boolean { return !!this.info; }
  onUpdate(fn: Listener): void { this.listeners.push(fn); }
  private emit(): void { for (const fn of this.listeners) fn(); }

  async start(): Promise<SessionInfo> {
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
    const { code, mode } = await transport.start();
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
    }
  }

  /* ---------- assignments ---------- */

  assign(playerId: string, mapId: string | null, tokenId: number | null): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.mapId = mapId; p.tokenId = tokenId;
    this.emit();
    this.scheduleRefresh();
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.peerId) { this.send({ type: 'end' }, p.peerId); this.peerToPlayer.delete(p.peerId); }
    this.players.delete(playerId);
    this.emit();
  }

  /** Called after a token moves between maps so the owner follows it. */
  retarget(fromMapId: string, fromTokenId: number, toMapId: string, toTokenId: number): void {
    for (const p of this.players.values()) {
      if (p.mapId === fromMapId && p.tokenId === fromTokenId) { p.mapId = toMapId; p.tokenId = toTokenId; }
    }
    this.emit();
    this.scheduleRefresh();
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
    for (const p of this.players.values()) {
      if (!p.connected || !p.peerId) continue;
      let map = p.mapId ? c.maps.find(m => m.id === p.mapId) : undefined;
      let token = map && p.tokenId !== null ? map.tokens.find(t => t.id === p.tokenId) : undefined;
      if (!token) { map = undefined; p.mapId = null; p.tokenId = null; }
      const shown = map ?? c.maps.find(m => m.id === state.mapId) ?? c.maps[0];
      const cell = token && map ? map.grid.cells[token.y * map.grid.w + token.x] : null;
      const atExit = !!(cell && cell.p === 'exit' && cell.link);
      const target = atExit && cell?.link ? c.maps.find(m => m.id === cell.link!.mapId) : undefined;
      const assignment: Assignment = { mapId: shown.id, tokenId: token ? token.id : null, atExit, exitLabel: target?.name };
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
      for (const t of m.tokens) {
        if (t.type !== 'pc') continue;
        const cell = m.grid.cells[t.y * m.grid.w + t.x];
        if (!cell || cell.p !== 'exit' || !cell.link) continue;
        const to = c.maps.find(x => x.id === cell.link!.mapId) ?? null;
        const owner = [...this.players.values()].find(p => p.mapId === m.id && p.tokenId === t.id);
        out.push({ mapId: m.id, mapName: m.name, tokenId: t.id, tokenName: t.name, to, link: { x: cell.link.x, y: cell.link.y }, playerName: owner?.name ?? null });
      }
    }
    return out;
  }
}

function cloneView(v: MapView): MapView {
  return { ...v, cells: v.cells.slice(), see: v.see.slice(), intensity: v.intensity.slice(), tokens: v.tokens.map(t => ({ ...t })) };
}

export const session = new HostSession();
