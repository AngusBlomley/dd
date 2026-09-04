/* Builds the filtered MapView a player device receives. Pure: no DOM, no state. */

import { LOOT_PROPS, type Token } from '../engine/data';
import type { Cell, CellMemory, Grid } from '../engine/grid';
import { isPartyToken, tokenVisibleToParty, UNSEEN, type Scene } from '../engine/lighting';
import type { MapRecord } from '../store/json';
import type { MapView, ViewCell, ViewToken } from './protocol';

/** A cell as the players are allowed to see it: a closed secret door is a wall. */
export function publicCell(c: Cell | CellMemory): ViewCell {
  if (c.d && c.secret && !c.doOpen) return { t: c.t, w: true, d: false, doOpen: false, p: null };
  const out: ViewCell = { t: c.t, w: c.w, d: c.d, doOpen: c.doOpen, p: c.p };
  if (c.rot) out.rot = c.rot;
  const loot = (c as Cell).loot;
  if (loot && c.p && (loot.title || loot.text)) out.loot = { title: loot.title, text: loot.text, canTake: loot.pickup && LOOT_PROPS.has(c.p) };
  return out;
}

export function initialsOf(name: string): string {
  return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export function publicToken(t: Token): ViewToken {
  const out: ViewToken = { id: t.id, initials: initialsOf(t.name), color: t.color, size: t.size, x: t.x, y: t.y, light: !!t.light, pc: isPartyToken(t) };
  if (t.type === 'npc') out.info = { name: t.name, role: t.role ?? '', trade: t.trade ?? '' };
  return out;
}

export function buildMapView(map: MapRecord, scene: Scene): MapView {
  const grid: Grid = map.grid;
  const n = grid.w * grid.h;
  const cells: (ViewCell | null)[] = new Array(n);
  const see: number[] = new Array(n);
  const intensity: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = grid.cells[i];
    const s = scene.party[i];
    see[i] = s;
    if (s > UNSEEN) { cells[i] = publicCell(c); intensity[i] = Math.round(Math.min(1, scene.intensity[i]) * 255); }
    else if (c.mem) { cells[i] = publicCell(c.mem); intensity[i] = 0; }
    else { cells[i] = null; intensity[i] = 0; }
  }
  const tokens = map.tokens.filter(t => tokenVisibleToParty(t, scene.party, grid.w)).map(publicToken);
  return { mapId: map.id, name: map.name, w: grid.w, h: grid.h, cells, see, intensity, tokens };
}
