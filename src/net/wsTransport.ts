/* LAN relay transport: WebSocket to server/host.mjs on the same origin. */

import type { ClientStatus, ClientTransport, HostTransport, Json } from './transport';

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class RelayHost implements HostTransport {
  private ws: WebSocket | null = null;
  private code = '';
  private joinCb: ((id: string) => void) | null = null;
  private leaveCb: ((id: string) => void) | null = null;
  private msgCb: ((id: string, msg: Json) => void) | null = null;
  private stopped = false;

  start(preferredCode?: string): Promise<{ code: string; mode: 'lan' }> {
    this.stopped = false;
    return new Promise((resolve, reject) => {
      const open = (first: boolean) => {
        const ws = new WebSocket(wsUrl());
        this.ws = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'host', code: this.code || preferredCode || undefined }));
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.type === 'hosted') { this.code = m.code; if (first) resolve({ code: m.code, mode: 'lan' }); }
          else if (m.type === 'peer-joined') this.joinCb?.(m.peerId);
          else if (m.type === 'peer-left') this.leaveCb?.(m.peerId);
          else if (m.type === 'from') this.msgCb?.(m.peerId, m.msg);
        };
        ws.onerror = () => { if (first) reject(new Error('Could not reach the relay')); };
        ws.onclose = () => { if (!this.stopped) setTimeout(() => open(false), 1500); };
      };
      open(true);
    });
  }
  onPeerJoin(cb: (id: string) => void): void { this.joinCb = cb; }
  onPeerLeave(cb: (id: string) => void): void { this.leaveCb = cb; }
  onMessage(cb: (id: string, msg: Json) => void): void { this.msgCb = cb; }
  send(peerId: string, msg: Json): void { this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ type: 'to', peerId, msg })); }
  broadcast(msg: Json): void { this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ type: 'broadcast', msg })); }
  stop(): void { this.stopped = true; this.ws?.close(); this.ws = null; }
}

export class RelayClient implements ClientTransport {
  private ws: WebSocket | null = null;
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
        const ws = new WebSocket(wsUrl());
        this.ws = ws;
        ws.onopen = () => { this.attempts = 0; ws.send(JSON.stringify({ type: 'join', code: this.code })); };
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.type === 'joined') { this.statusCb?.('connected'); if (first) resolve(); }
          else if (m.type === 'no-room') { this.closed = true; this.statusCb?.('no-room'); if (first) reject(new Error('no-room')); }
          else if (m.type === 'host-left') this.statusCb?.('reconnecting', 'The DM has disconnected. Waiting for them to come back…');
          else if (m.type === 'msg') this.msgCb?.(m.msg);
        };
        ws.onerror = () => { if (first) reject(new Error('Could not reach the host')); };
        ws.onclose = () => {
          if (this.closed) { this.statusCb?.('closed'); return; }
          const delay = Math.min(8000, 1000 * Math.pow(1.6, this.attempts++));
          setTimeout(() => open(false), delay);
        };
      };
      open(true);
    });
  }
  onMessage(cb: (msg: Json) => void): void { this.msgCb = cb; }
  onStatus(cb: (s: ClientStatus, detail?: string) => void): void { this.statusCb = cb; }
  send(msg: Json): void { this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ msg })); }
  close(): void { this.closed = true; this.ws?.close(); }
}
