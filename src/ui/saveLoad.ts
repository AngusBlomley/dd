/* Save / Load modals (IndexedDB), JSON export / import, PNG export. */

import { canvas, render, requestRender } from '../render/canvas';
import { invalidateVisibility, pushUndo, state } from '../state';
import { parseMap, serializeMap, type MapFile } from '../store/json';
import { deleteMap, listMaps, loadMap, saveMap } from '../store/storage';
import { $, escapeHtml } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

function currentMapJson(pretty = false): string {
  return JSON.stringify(serializeMap(state.grid, state.tokens, state.nextTokenId), null, pretty ? 2 : undefined);
}

function applyMapData(data: Partial<MapFile>): void {
  const parsed = parseMap(data);
  state.grid = parsed.grid;
  state.tokens = parsed.tokens;
  state.nextTokenId = parsed.nextTokenId;
  state.selectedTokenId = null;
  invalidateVisibility();
  requestRender(); setStatus(); renderTokenList(); renderInspector();
}

export function initSaveLoad(): void {
  const modalSave = $('modalSave');
  const modalLoad = $('modalLoad');

  $('btnSave').addEventListener('click', () => { $<HTMLInputElement>('saveNameInput').value = ''; modalSave.classList.remove('hidden'); });
  $('saveCancelBtn').addEventListener('click', () => modalSave.classList.add('hidden'));
  $('saveConfirmBtn').addEventListener('click', async () => {
    const name = $<HTMLInputElement>('saveNameInput').value.trim();
    if (!name) { alert('Please enter a map name.'); return; }
    try {
      await saveMap(name, currentMapJson());
      modalSave.classList.add('hidden');
    } catch (err) {
      console.error(err);
      alert('Could not save the map. You can still use Export JSON to download a backup.');
    }
  });

  $('btnLoad').addEventListener('click', async () => {
    const listEl = $('savedMapsList');
    listEl.innerHTML = '<div class="empty-note">Loading saved maps…</div>';
    modalLoad.classList.remove('hidden');
    try {
      const names = await listMaps();
      if (names.length === 0) { listEl.innerHTML = '<div class="empty-note">No saved maps yet.</div>'; return; }
      listEl.innerHTML = '';
      for (const name of names) {
        const row = document.createElement('div');
        row.className = 'saved-map-row';
        row.innerHTML = '<div class="smname">' + escapeHtml(name) + '</div><div class="smbtns"><button class="btn small" data-act="open">Open</button><button class="btn small danger" data-act="del">Delete</button></div>';
        row.querySelector('[data-act=open]')!.addEventListener('click', async () => {
          try {
            const raw = await loadMap(name);
            if (raw) { pushUndo(); applyMapData(JSON.parse(raw)); modalLoad.classList.add('hidden'); }
          } catch (err) { console.error(err); alert('Could not load that map.'); }
        });
        row.querySelector('[data-act=del]')!.addEventListener('click', async () => {
          if (!confirm('Delete saved map "' + name + '"?')) return;
          try { await deleteMap(name); row.remove(); } catch (err) { console.error(err); alert('Could not delete.'); }
        });
        listEl.appendChild(row);
      }
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<div class="empty-note">Could not reach map storage.</div>';
    }
  });
  $('loadCancelBtn').addEventListener('click', () => modalLoad.classList.add('hidden'));

  $('btnExportPng').addEventListener('click', () => {
    render();
    const link = document.createElement('a');
    link.download = 'dnd-map.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  $('btnExportJson').addEventListener('click', () => {
    const blob = new Blob([currentMapJson(true)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'dnd-map.json'; link.href = url; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  $('btnImportJson').addEventListener('click', () => $('fileImport').click());
  $<HTMLInputElement>('fileImport').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pushUndo();
        applyMapData(JSON.parse(String(reader.result)));
      } catch (err) { console.error(err); alert('That file could not be read as a map.'); }
    };
    reader.readAsText(file);
    input.value = '';
  });
}
