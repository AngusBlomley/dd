/* Campaign lifecycle: open, create, switch maps, autosave. Sits between state and store. */

import type { Token } from './engine/data';
import { createGrid, type Grid } from './engine/grid';
import { clearHistory, invalidateScene, markChanged, onChange, state } from './state';
import { newId, type Campaign, type MapRecord } from './store/json';
import { getLastCampaignId, importLegacyMaps, listCampaigns, loadCampaign, saveCampaign, setLastCampaignId } from './store/storage';

const AUTOSAVE_MS = 600;
let saveTimer: number | null = null;
let saving = false;
let saveListeners: ((status: 'saving' | 'saved' | 'error') => void)[] = [];

export function onSaveStatus(fn: (status: 'saving' | 'saved' | 'error') => void): void { saveListeners.push(fn); }
function notify(status: 'saving' | 'saved' | 'error'): void { for (const fn of saveListeners) fn(status); }

/** Writes the live grid/tokens back into the campaign's map record. */
export function commitCurrentMap(): void {
  const c = state.campaign;
  if (!c || !state.mapId) return;
  const m = c.maps.find(m => m.id === state.mapId);
  if (!m) return;
  m.grid = state.grid;
  m.tokens = state.tokens;
  m.nextTokenId = state.nextTokenId;
  c.activeMapId = state.mapId;
}

export async function saveNow(): Promise<void> {
  const c = state.campaign;
  if (!c) return;
  commitCurrentMap();
  c.updatedAt = Date.now();
  saving = true; notify('saving');
  try {
    await saveCampaign(c);
    state.dirty = false;
    notify('saved');
  } catch (err) {
    console.error('autosave failed', err);
    notify('error');
  } finally {
    saving = false;
  }
}

function scheduleSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { saveTimer = null; void saveNow(); }, AUTOSAVE_MS);
}

/** Ask for an autosave without going through markChanged (no scene invalidation). */
export function requestSave(): void { state.dirty = true; scheduleSave(); }

export function initAutosave(): void {
  onChange(scheduleSave);
  window.addEventListener('beforeunload', () => { if (state.dirty && !saving) void saveNow(); });
}

/* ---------- maps ---------- */

export function newMapRecord(name: string, grid?: Grid): MapRecord {
  return { id: newId(), name, grid: grid ?? createGrid(34, 24, 'stone'), tokens: [], nextTokenId: 1 };
}

/** Makes a map the live one. Commits the previous map first. */
export function switchMap(mapId: string): void {
  const c = state.campaign;
  if (!c) return;
  const target = c.maps.find(m => m.id === mapId);
  if (!target) return;
  commitCurrentMap();
  state.mapId = target.id;
  state.grid = target.grid;
  state.tokens = target.tokens;
  state.nextTokenId = target.nextTokenId;
  state.selectedTokenId = null;
  c.activeMapId = target.id;
  clearHistory();
  invalidateScene();
  state.dirty = true;
  scheduleSave();
}

export function addMap(map: MapRecord, makeActive = true): void {
  const c = state.campaign;
  if (!c) return;
  c.maps.push(map);
  if (makeActive) switchMap(map.id); else scheduleSave();
}

export function removeMap(mapId: string): boolean {
  const c = state.campaign;
  if (!c || c.maps.length <= 1) return false;
  const i = c.maps.findIndex(m => m.id === mapId);
  if (i < 0) return false;
  c.maps.splice(i, 1);
  if (state.mapId === mapId) switchMap(c.maps[Math.max(0, i - 1)].id);
  else scheduleSave();
  return true;
}

export function duplicateMap(mapId: string): void {
  const c = state.campaign;
  if (!c) return;
  commitCurrentMap();
  const src = c.maps.find(m => m.id === mapId);
  if (!src) return;
  const copy: MapRecord = JSON.parse(JSON.stringify(src));
  copy.id = newId();
  copy.name = src.name + ' (copy)';
  c.maps.splice(c.maps.indexOf(src) + 1, 0, copy);
  switchMap(copy.id);
}

export function renameMap(mapId: string, name: string): void {
  const m = state.campaign?.maps.find(m => m.id === mapId);
  if (!m || !name.trim()) return;
  m.name = name.trim();
  scheduleSave();
}

/* ---------- linked maps ---------- */

export function mapById(mapId: string): MapRecord | undefined {
  return state.campaign?.maps.find(m => m.id === mapId);
}

/** Cells holding an Entry prop on a map, for exit-link pickers. */
export function entriesOf(map: MapRecord): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < map.grid.cells.length; i++) {
    if (map.grid.cells[i].p === 'entry') out.push({ x: i % map.grid.w, y: Math.floor(i / map.grid.w) });
  }
  return out;
}

export function setNextMap(mapId: string, nextMapId: string | null): void {
  const m = mapById(mapId);
  if (!m) return;
  m.nextMapId = nextMapId && nextMapId !== mapId ? nextMapId : null;
  requestSave();
}

/** The first Entry on a map, else the first walkable cell, else null. */
export function arrivalCell(map: MapRecord): { x: number; y: number } | null {
  const entries = entriesOf(map);
  if (entries.length) return entries[0];
  for (let i = 0; i < map.grid.cells.length; i++) {
    const c = map.grid.cells[i];
    if (!c.w && !c.d && !c.p && c.t !== 'void' && c.t !== 'chasm') return { x: i % map.grid.w, y: Math.floor(i / map.grid.w) };
  }
  return null;
}

/**
 * Where an exit leads: its own link if it has one, otherwise the map's
 * "next map" and that map's arrival cell. Null if it leads nowhere yet.
 */
export function resolveExit(map: MapRecord, x: number, y: number): { map: MapRecord; x: number; y: number } | null {
  const c = state.campaign;
  const cell = map.grid.cells[y * map.grid.w + x];
  if (!c || !cell || cell.p !== 'exit') return null;
  if (cell.link) {
    const target = c.maps.find(m => m.id === cell.link!.mapId);
    return target ? { map: target, x: cell.link.x, y: cell.link.y } : null;
  }
  if (map.nextMapId) {
    const target = c.maps.find(m => m.id === map.nextMapId);
    const at = target ? arrivalCell(target) : null;
    return target && at ? { map: target, x: at.x, y: at.y } : null;
  }
  return null;
}

export function hasEntry(map: MapRecord): boolean {
  return map.grid.cells.some(c => c.p === 'entry');
}

/**
 * Where an Entry leads back to: the exit on another map that arrives here,
 * either through its own link or through that map's "next map". Null if none.
 */
export function resolveEntry(map: MapRecord, x: number, y: number): { map: MapRecord; x: number; y: number } | null {
  const c = state.campaign;
  const cell = map.grid.cells[y * map.grid.w + x];
  if (!c || !cell || cell.p !== 'entry') return null;
  for (const other of c.maps) {
    if (other.id === map.id) continue;
    const live = other.id === state.mapId ? { ...other, grid: state.grid, tokens: state.tokens } : other;
    for (let i = 0; i < live.grid.cells.length; i++) {
      if (live.grid.cells[i].p !== 'exit') continue;
      const ex = i % live.grid.w, ey = Math.floor(i / live.grid.w);
      const r = resolveExit(live, ex, ey);
      if (r && r.map.id === map.id && r.x === x && r.y === y) return { map: other, x: ex, y: ey };
    }
  }
  return null;
}

/**
 * Moves a token from one map to a cell on another. Returns the token's id on
 * the target map (ids are per map), or null if anything was missing.
 */
export function transferToken(fromMapId: string, tokenId: number, toMapId: string, x: number, y: number): number | null {
  const c = state.campaign;
  if (!c) return null;
  commitCurrentMap();
  const from = c.maps.find(m => m.id === fromMapId);
  const to = c.maps.find(m => m.id === toMapId);
  if (!from || !to) return null;
  const idx = from.tokens.findIndex(t => t.id === tokenId);
  if (idx < 0) return null;
  if (x < 0 || y < 0 || x >= to.grid.w || y >= to.grid.h) return null;
  const [tok] = from.tokens.splice(idx, 1);
  const moved: Token = { ...tok, id: to.nextTokenId++, x, y };
  to.tokens.push(moved);
  // keep the live state in step with whichever record is active
  if (state.mapId === from.id) { state.tokens = from.tokens; }
  if (state.mapId === to.id) { state.tokens = to.tokens; state.nextTokenId = to.nextTokenId; }
  if (state.selectedTokenId === tokenId && state.mapId === from.id) state.selectedTokenId = null;
  markChanged();
  return moved.id;
}

/* ---------- campaigns ---------- */

export function newCampaign(name: string, firstMap?: MapRecord): Campaign {
  const now = Date.now();
  const map = firstMap ?? newMapRecord('Map 1');
  return { id: newId(), name, createdAt: now, updatedAt: now, activeMapId: map.id, maps: [map] };
}

export async function openCampaign(c: Campaign): Promise<void> {
  if (state.campaign && state.dirty) await saveNow();
  state.campaign = c;
  state.mapId = null;
  switchMap(c.maps.some(m => m.id === c.activeMapId) ? c.activeMapId : c.maps[0].id);
  await setLastCampaignId(c.id);
}

export async function renameCampaign(name: string): Promise<void> {
  if (!state.campaign || !name.trim()) return;
  state.campaign.name = name.trim();
  await saveNow();
}

/** On startup: reopen the last campaign, else fold in legacy maps, else start a fresh one. */
export async function bootCampaign(): Promise<Campaign> {
  const lastId = await getLastCampaignId();
  if (lastId) {
    const c = await loadCampaign(lastId);
    if (c) { await openCampaign(c); return c; }
  }
  const legacy = await importLegacyMaps();
  if (legacy) { await openCampaign(legacy); return legacy; }
  const existing = await listCampaigns();
  if (existing.length) {
    const c = await loadCampaign(existing[0].id);
    if (c) { await openCampaign(c); return c; }
  }
  const fresh = newCampaign('My campaign');
  await saveCampaign(fresh);
  await openCampaign(fresh);
  return fresh;
}
