/* Transport interfaces. Two implementations:
   - LAN relay (WebSocket through server/host.mjs)
   - browser host (WebRTC through PeerJS, broker used for the handshake only) */

export type Json = unknown;

export interface HostTransport {
  /** Opens the room. Resolves with the code players type in. */
  start(preferredCode?: string): Promise<{ code: string; mode: 'lan' | 'webrtc' }>;
  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  onMessage(cb: (peerId: string, msg: Json) => void): void;
  send(peerId: string, msg: Json): void;
  broadcast(msg: Json): void;
  stop(): void;
}

export type ClientStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'no-room';

export interface ClientTransport {
  connect(code: string): Promise<void>;
  onMessage(cb: (msg: Json) => void): void;
  onStatus(cb: (status: ClientStatus, detail?: string) => void): void;
  send(msg: Json): void;
  close(): void;
}

/** True when the page is being served by the LAN relay script. */
export async function relayAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/relay-info', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j && j.relay === true;
  } catch { return false; }
}
