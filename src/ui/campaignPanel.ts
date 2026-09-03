/* Maps tab (maps in the open campaign) and the campaign modal (switch, create,
   import, export, delete campaigns). Also PNG export. */

import {
  addMap, duplicateMap, entriesOf, newCampaign, newMapRecord, openCampaign, removeMap, renameCampaign, renameMap, resolveExit, saveNow, setNextMap, switchMap,
} from '../campaign';
import { canvas, render, requestRender } from '../render/canvas';
import { markChanged, onChange, pushUndo, state } from '../state';
import { isCampaignFile, parseCampaign, parseMap, serializeCampaign, serializeMap, type CampaignFile, type MapFile } from '../store/json';
import { deleteCampaign, listCampaigns, loadCampaign, saveCampaign } from '../store/storage';
import { $, escapeHtml } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

function afterMapSwitch(): void {
  renderMapList(); renderInspector(); renderTokenList(); requestRender(); setStatus();
}

function download(name: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = name; a.href = url; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'map';
}

function pickFile(accept: string, onText: (text: string) => void): void {
  const input = $<HTMLInputElement>('fileImport');
  input.accept = accept;
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result));
    reader.readAsText(file);
  };
  input.click();
}

/* ---------- maps tab ---------- */

export function renderMapList(): void {
  const c = state.campaign;
  const el = $('mapList');
  el.innerHTML = '';
  if (!c) return;
  $('campaignNameLabel').textContent = c.name;
  for (const m of c.maps) {
    const row = document.createElement('div');
    row.className = 'map-row' + (m.id === state.mapId ? ' active' : '');
    row.innerHTML = `<div class="map-name">${escapeHtml(m.name)}</div><div class="map-meta">${m.grid.w}×${m.grid.h} · ${m.tokens.length} tokens</div>`;
    row.addEventListener('click', () => { if (m.id !== state.mapId) { switchMap(m.id); afterMapSwitch(); } });
    el.appendChild(row);
  }
  const cur = c.maps.find(m => m.id === state.mapId);
  const sel = $<HTMLSelectElement>('nextMapSel');
  sel.innerHTML = '<option value="">— none —</option>' + c.maps.filter(m => m.id !== state.mapId).map(m => `<option value="${m.id}"${cur?.nextMapId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
  renderMapExits();
}

/** Every exit on the current map with its own destination picker (issue #13). */
export function renderMapExits(): void {
  const c = state.campaign;
  const box = $('mapExits');
  box.innerHTML = '';
  if (!c || !state.mapId) return;
  const rec = c.maps.find(m => m.id === state.mapId);
  if (!rec) return;
  const live = { ...rec, grid: state.grid, tokens: state.tokens };
  const exits: { x: number; y: number }[] = [];
  for (let i = 0; i < state.grid.cells.length; i++) if (state.grid.cells[i].p === 'exit') exits.push({ x: i % state.grid.w, y: Math.floor(i / state.grid.w) });
  if (!exits.length) { box.innerHTML = '<div class="empty-note">No exits on this map. Place one from Props › Dungeon features.</div>'; return; }
  for (const e of exits) {
    const cell = state.grid.cells[e.y * state.grid.w + e.x];
    const r = resolveExit(live, e.x, e.y);
    const row = document.createElement('div');
    row.className = 'exit-config';
    const mapOpts = c.maps.filter(m => m.id !== state.mapId).map(m => `<option value="${m.id}"${cell.link?.mapId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    row.innerHTML = `<div class="exit-config-head"><b>Exit at (${e.x}, ${e.y})</b><span class="map-meta">${r ? '→ ' + escapeHtml(r.map.name) + ' (' + r.x + ', ' + r.y + ')' : 'leads nowhere yet'}</span></div>
      <div class="row2"><select class="exit-map"><option value="">next map</option>${mapOpts}</select><select class="exit-entry"></select></div>`;
    const mapSel = row.querySelector<HTMLSelectElement>('.exit-map')!;
    const entrySel = row.querySelector<HTMLSelectElement>('.exit-entry')!;
    const fillEntries = () => {
      const target = c.maps.find(m => m.id === mapSel.value);
      entrySel.innerHTML = '';
      entrySel.disabled = !target;
      if (!target) { entrySel.innerHTML = '<option value="">first entry</option>'; return; }
      const ents = entriesOf(target.id === state.mapId ? live : target);
      if (!ents.length) { entrySel.innerHTML = '<option value="">no entry on that map</option>'; return; }
      entrySel.innerHTML = ents.map(en => `<option value="${en.x},${en.y}"${cell.link && cell.link.mapId === target.id && cell.link.x === en.x && cell.link.y === en.y ? ' selected' : ''}>Entry at (${en.x}, ${en.y})</option>`).join('');
    };
    fillEntries();
    const save = () => {
      pushUndo();
      const target = c.maps.find(m => m.id === mapSel.value);
      if (!target) { cell.link = null; }
      else {
        const [ex, ey] = (entrySel.value || '').split(',').map(Number);
        const ents = entriesOf(target);
        const at = !isNaN(ex) && !isNaN(ey) ? { x: ex, y: ey } : ents[0] ?? { x: 1, y: 1 };
        cell.link = { mapId: target.id, x: at.x, y: at.y };
      }
      markChanged(); requestRender(); renderMapExits(); renderInspector();
    };
    mapSel.addEventListener('change', () => { fillEntries(); save(); });
    entrySel.addEventListener('change', save);
    box.appendChild(row);
  }
}

export function initMapsPanel(): void {
  // The Maps tab follows the map: exits placed or removed since it was last drawn show up when it opens or changes.
  document.querySelector('.tab[data-panel=maps]')!.addEventListener('click', renderMapList);
  let pending: number | null = null;
  onChange(() => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      if ($('panel-maps').classList.contains('active') && !document.activeElement?.closest('#mapExits')) renderMapList();
    }, 300);
  });
  $('nextMapSel').addEventListener('change', (e) => {
    if (!state.mapId) return;
    setNextMap(state.mapId, (e.target as HTMLSelectElement).value || null);
    requestRender(); renderInspector();
  });
  $('btnNewMap').addEventListener('click', () => {
    const name = prompt('Name for the new map', 'Map ' + ((state.campaign?.maps.length ?? 0) + 1));
    if (name === null) return;
    addMap(newMapRecord(name.trim() || 'Untitled map'));
    afterMapSwitch();
  });
  $('btnDuplicateMap').addEventListener('click', () => { if (state.mapId) { duplicateMap(state.mapId); afterMapSwitch(); } });
  $('btnRenameMap').addEventListener('click', () => {
    const m = state.campaign?.maps.find(m => m.id === state.mapId);
    if (!m) return;
    const name = prompt('Rename map', m.name);
    if (name !== null) { renameMap(m.id, name); renderMapList(); }
  });
  $('btnDeleteMap').addEventListener('click', () => {
    const c = state.campaign;
    const m = c?.maps.find(m => m.id === state.mapId);
    if (!c || !m) return;
    if (c.maps.length <= 1) { alert('A campaign needs at least one map. Create another first.'); return; }
    if (!confirm(`Delete map "${m.name}"? This cannot be undone.`)) return;
    removeMap(m.id);
    afterMapSwitch();
  });
  $('btnExportMap').addEventListener('click', () => {
    const m = state.campaign?.maps.find(m => m.id === state.mapId);
    if (!m) return;
    m.grid = state.grid; m.tokens = state.tokens; m.nextTokenId = state.nextTokenId;
    download(safeName(m.name) + '.map.json', JSON.stringify(serializeMap(m), null, 2));
  });
  $('btnImportMap').addEventListener('click', () => {
    pickFile('.json,application/json', (text) => {
      try {
        const data = JSON.parse(text);
        if (isCampaignFile(data)) { void importCampaignFile(data); return; }
        const m = parseMap(data as MapFile, 'Imported map');
        addMap(m);
        afterMapSwitch();
      } catch (err) { console.error(err); alert('That file could not be read as a map or campaign.'); }
    });
  });
  $('btnExportPng').addEventListener('click', () => {
    render();
    const a = document.createElement('a');
    a.download = safeName(state.campaign?.maps.find(m => m.id === state.mapId)?.name ?? 'map') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
  $('btnRenameCampaign').addEventListener('click', () => {
    if (!state.campaign) return;
    const name = prompt('Rename campaign', state.campaign.name);
    if (name !== null) { void renameCampaign(name).then(() => { renderMapList(); setStatus(); }); }
  });
  $('btnCampaigns').addEventListener('click', () => { void openCampaignModal(); });
  $('btnCampaignName').addEventListener('click', () => { void openCampaignModal(); });
}

/* ---------- campaign modal ---------- */

async function importCampaignFile(data: CampaignFile): Promise<void> {
  const c = parseCampaign(data);
  const existing = await listCampaigns();
  if (existing.some(e => e.id === c.id)) {
    if (!confirm(`A campaign "${c.name}" with this id already exists. Replace it?`)) return;
  }
  await saveCampaign(c);
  await openCampaign(c);
  closeCampaignModal();
  afterMapSwitch();
}

function closeCampaignModal(): void { $('modalCampaigns').classList.add('hidden'); }

export async function openCampaignModal(): Promise<void> {
  const modal = $('modalCampaigns');
  const list = $('campaignList');
  modal.classList.remove('hidden');
  list.innerHTML = '<div class="empty-note">Loading…</div>';
  await saveNow();
  const all = await listCampaigns();
  list.innerHTML = '';
  if (!all.length) list.innerHTML = '<div class="empty-note">No campaigns yet.</div>';
  for (const c of all) {
    const row = document.createElement('div');
    row.className = 'saved-map-row' + (c.id === state.campaign?.id ? ' active' : '');
    const when = new Date(c.updatedAt).toLocaleString();
    row.innerHTML = `<div><div class="smname">${escapeHtml(c.name)}</div><div class="map-meta">${c.mapCount} map${c.mapCount === 1 ? '' : 's'} · saved ${when}</div></div>
      <div class="smbtns"><button class="btn small" data-act="open">Open</button><button class="btn small danger" data-act="del">Delete</button></div>`;
    row.querySelector('[data-act=open]')!.addEventListener('click', async () => {
      const full = await loadCampaign(c.id);
      if (!full) { alert('Could not load that campaign.'); return; }
      await openCampaign(full);
      closeCampaignModal();
      afterMapSwitch();
    });
    row.querySelector('[data-act=del]')!.addEventListener('click', async () => {
      if (!confirm(`Delete campaign "${c.name}" and all its maps? Export it first if you want a backup.`)) return;
      await deleteCampaign(c.id);
      if (state.campaign?.id === c.id) {
        const rest = (await listCampaigns());
        const next = rest.length ? await loadCampaign(rest[0].id) : null;
        const c2 = next ?? newCampaign('My campaign');
        if (!next) await saveCampaign(c2);
        await openCampaign(c2);
        afterMapSwitch();
      }
      void openCampaignModal();
    });
    list.appendChild(row);
  }
}

export function initCampaignModal(): void {
  $('campaignsCloseBtn').addEventListener('click', closeCampaignModal);
  $('btnNewCampaign').addEventListener('click', async () => {
    const name = prompt('Name for the new campaign', 'New campaign');
    if (name === null) return;
    const c = newCampaign(name.trim() || 'New campaign');
    await saveCampaign(c);
    await openCampaign(c);
    closeCampaignModal();
    afterMapSwitch();
  });
  $('btnExportCampaign').addEventListener('click', async () => {
    if (!state.campaign) return;
    await saveNow();
    download(safeName(state.campaign.name) + '.campaign.json', JSON.stringify(serializeCampaign(state.campaign), null, 2));
  });
  $('btnImportCampaign').addEventListener('click', () => {
    pickFile('.json,application/json', (text) => {
      try {
        const data = JSON.parse(text);
        if (!isCampaignFile(data)) { alert('That file is a single map, not a campaign. Use "Import map" in the Maps tab.'); return; }
        void importCampaignFile(data);
      } catch (err) { console.error(err); alert('That file could not be read as a campaign.'); }
    });
  });
}
