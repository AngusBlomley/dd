/* Browser-host transport: WebRTC data channels through PeerJS.
   The public PeerJS broker is used only to introduce peers; map data flows
   directly between the DM's browser and each player. */

import Peer, { type DataConnection } from 'peerjs';
import { makeRoomCode } from './protocol';
import type { ClientStatus, ClientTransport, HostTransport, Json } from './transport';

const PREFIX = 'cartographers-table-';

export class PeerHost implements HostTransport {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private joinCb: ((id: string) => void) | null = null;
  private leaveCb: ((id: string) => void) | null = null;
  private msgCb: ((id: string, msg: Json) => void) | null = null;

  start(preferredCode?: string): Promise<{ code: string; mode: 'webrtc' }> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = (code: string) => {
        const peer = new Peer(PREFIX + code);
        this.peer = peer;
        peer.on('open', () => resolve({ code, mode: 'webrtc' }));
        peer.on('error', (err: Error & { type?: string }) => {
          if (err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(makeRoomCode(5)); return; }
          if (!this.conns.size) reject(err);
          console.error('peer error', err);
        });
        peer.on('connection', (conn) => {
          conn.on('open', () => { this.conns.set(conn.peer, conn); this.joinCb?.(conn.peer); });
          conn.on('data', (data) => this.msgCb?.(conn.peer, data as Json));
          conn.on('close', () => { this.conns.delete(conn.peer); this.leaveCb?.(conn.peer); });
          conn.on('error', () => { this.conns.delete(conn.peer); this.leaveCb?.(conn.peer); });
        });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
      };
      attempt(preferredCode || makeRoomCode(5));
    });
  }
  onPeerJoin(cb: (id: string) => void): void { this.joinCb = cb; }
  onPeerLeave(cb: (id: string) => void): void { this.leaveCb = cb; }
  onMessage(cb: (id: string, msg: Json) => void): void { this.msgCb = cb; }
  send(peerId: string, msg: Json): void { const c = this.conns.get(peerId); if (c && c.open) c.send(msg); }
  broadcast(msg: Json): void { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  stop(): void { for (const c of this.conns.values()) c.close(); this.conns.clear(); this.peer?.destroy(); this.peer = null; }
}

export class PeerClient implements ClientTransport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private code = '';
  private msgCb: ((msg: Json) => void) | null = null;
  private statusCb: ((s: ClientStatus, detail?: string) => void) | null = null;
  private closed = false;
  private attempts = 0;

  connect(code: string): Promise<void> {
    this.code = code; this.closed = false;
    return new Promise((resolve, reject) => {
      const open = (first: boolean) => {
        this.statusCb?.(first ? 'connecting' : 'reconnecting');
        const peer = new Peer();
        this.peer = peer;
        peer.on('open', () => {
          const conn = peer.connect(PREFIX + this.code, { reliable: true });
          this.conn = conn;
          conn.on('open', () => { this.attempts = 0; this.statusCb?.('connected'); if (first) resolve(); });
          conn.on('data', (data) => this.msgCb?.(data as Json));
          conn.on('close', () => this.retry(open));
        });
        peer.on('error', (err: Error & { type?: string }) => {
          if (err.type === 'peer-unavailable') {
            if (first) { this.closed = true; this.statusCb?.('no-room'); reject(new Error('no-room')); }
            else this.retry(open, 'The DM has disconnected. Waiting for them to come back…');
            return;
          }
          if (first && !this.conn?.open) reject(err); else this.retry(open);
        });
      };
      open(true);
    });
  }
  private retry(open: (first: boolean) => void, detail?: string): void {
    if (this.closed) { this.statusCb?.('closed'); return; }
    this.peer?.destroy(); this.peer = null; this.conn = null;
    this.statusCb?.('reconnecting', detail);
    const delay = Math.min(8000, 1500 * Math.pow(1.6, this.attempts++));
    setTimeout(() => { if (!this.closed) open(false); }, delay);
  }
  onMessage(cb: (msg: Json) => void): void { this.msgCb = cb; }
  onStatus(cb: (s: ClientStatus, detail?: string) => void): void { this.statusCb = cb; }
  send(msg: Json): void { if (this.conn?.open) this.conn.send(msg); }
  close(): void { this.closed = true; this.conn?.close(); this.peer?.destroy(); }
}
