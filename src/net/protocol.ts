/* Wire protocol between the DM's device (host) and player devices.
   The host is the only writer. Players receive a filtered view of a map and
   render exactly what they are given. */

/** What a player may know about one cell. Secret doors arrive as walls. */
export interface ViewCell { t: string; w: boolean; d: boolean; doOpen: boolean; p: string | null }

/** What a player may know about a token: no names (initials only), no hidden tokens. */
export interface ViewToken {
  id: number; initials: string; color: string; size: number; x: number; y: number;
  light: boolean; pc: boolean;
}

export interface MapView {
  mapId: string;
  name: string;
  w: number;
  h: number;
  cells: (ViewCell | null)[]; // null = never seen (black)
  see: number[];              // SeeLevel per cell: 0 unseen (memory if cell is not null), 1 darkvision, 2 dim, 3 bright
  intensity: number[];        // 0..255 light falloff for the dim band
  tokens: ViewToken[];
}

export interface ViewPatch {
  mapId: string;
  name?: string;
  cells?: Record<number, ViewCell | null>;
  see?: Record<number, number>;
  intensity?: Record<number, number>;
  tokens?: ViewToken[];
}

export type MoveMode = 'dm' | 'turn' | 'free';
export type MoveDenial = 'not-your-token' | 'not-your-turn' | 'blocked' | 'too-far' | 'no-path' | 'out-of-bounds' | 'not-adjacent' | 'not-a-door';

export interface Assignment {
  mapId: string | null;   // map the player's token is on (or the DM's active map when unassigned)
  tokenId: number | null;
  atExit: boolean;        // standing on a linked exit, waiting for the DM
  exitLabel?: string;     // where the exit leads, for the waiting banner
  mode: MoveMode;
  canMove: boolean;       // this player may move their token right now
  yourTurn: boolean;
  movementLeft: number | null; // cells, in turn mode
  turnName: string | null;     // whose turn it is, for everyone's top bar
}

export type ClientMessage =
  | { type: 'hello'; playerId: string; name: string }
  | { type: 'move'; tokenId: number; x: number; y: number }
  | { type: 'door'; tokenId: number; x: number; y: number }
  | { type: 'ping' };

export type HostMessage =
  | { type: 'welcome'; playerId: string; name: string }
  | { type: 'assign'; assignment: Assignment }
  | { type: 'snapshot'; view: MapView }
  | { type: 'patch'; patch: ViewPatch }
  | { type: 'move-denied'; reason: MoveDenial; movementLeft: number | null }
  | { type: 'end' }
  | { type: 'pong' };

export const PROTOCOL_VERSION = 1;

/* ---------- diffing ---------- */

function sameCell(a: ViewCell | null, b: ViewCell | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.t === b.t && a.w === b.w && a.d === b.d && a.doOpen === b.doOpen && a.p === b.p;
}

function sameTokens(a: ViewToken[], b: ViewToken[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.x !== y.x || x.y !== y.y || x.color !== y.color || x.initials !== y.initials ||
        x.size !== y.size || x.light !== y.light || x.pc !== y.pc) return false;
  }
  return true;
}

/** Returns the smallest patch that turns `prev` into `next`, or null if nothing changed. */
export function diffViews(prev: MapView, next: MapView): ViewPatch | null {
  if (prev.mapId !== next.mapId || prev.w !== next.w || prev.h !== next.h) return null; // caller must send a snapshot
  const patch: ViewPatch = { mapId: next.mapId };
  let changed = false;
  if (prev.name !== next.name) { patch.name = next.name; changed = true; }
  const cells: Record<number, ViewCell | null> = {};
  const see: Record<number, number> = {};
  const intensity: Record<number, number> = {};
  let nc = 0, ns = 0, ni = 0;
  for (let i = 0; i < next.cells.length; i++) {
    if (!sameCell(prev.cells[i], next.cells[i])) { cells[i] = next.cells[i]; nc++; }
    if (prev.see[i] !== next.see[i]) { see[i] = next.see[i]; ns++; }
    if (prev.intensity[i] !== next.intensity[i]) { intensity[i] = next.intensity[i]; ni++; }
  }
  if (nc) { patch.cells = cells; changed = true; }
  if (ns) { patch.see = see; changed = true; }
  if (ni) { patch.intensity = intensity; changed = true; }
  if (!sameTokens(prev.tokens, next.tokens)) { patch.tokens = next.tokens; changed = true; }
  return changed ? patch : null;
}

/** Applies a patch in place. */
export function applyPatch(view: MapView, patch: ViewPatch): void {
  if (patch.name !== undefined) view.name = patch.name;
  if (patch.cells) for (const k in patch.cells) view.cells[+k] = patch.cells[k];
  if (patch.see) for (const k in patch.see) view.see[+k] = patch.see[k];
  if (patch.intensity) for (const k in patch.intensity) view.intensity[+k] = patch.intensity[k];
  if (patch.tokens) view.tokens = patch.tokens;
}

/* ---------- room codes ---------- */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function makeRoomCode(len = 4, rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}
export function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1');
}
