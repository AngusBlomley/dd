/* Campaign lifecycle: open, create, switch maps, autosave. Sits between state and store. */

import { createGrid, type Grid } from './engine/grid';
import { clearHistory, invalidateScene, onChange, state } from './state';
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
