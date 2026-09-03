/* Maps tab (maps in the open campaign) and the campaign modal (switch, create,
   import, export, delete campaigns). Also PNG export. */

import {
  addMap, duplicateMap, newCampaign, newMapRecord, openCampaign, removeMap, renameCampaign, renameMap, saveNow, setNextMap, switchMap,
} from '../campaign';
import { canvas, render, requestRender } from '../render/canvas';
import { state } from '../state';
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
}

export function initMapsPanel(): void {
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
