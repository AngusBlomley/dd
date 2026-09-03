import { canvas } from '../render/canvas';
import { canRedo, canUndo, state, type ToolId } from '../state';
import { $ } from './dom';
import { syncLayersPanel } from './panels';

const TOOL_LABELS: Record<ToolId, string> = {
  terrain: 'Terrain Brush', wall: 'Wall Brush', door: 'Door Brush', secretdoor: 'Secret Door', prop: 'Prop Brush',
  eraser: 'Eraser', select: 'Select / Move Token', token: 'Place Token', pan: 'Pan',
};

/** Refreshes the status bar, tool buttons, layer checkboxes and canvas cursor from state. */
export function setStatus(): void {
  $('statTool').textContent = TOOL_LABELS[state.tool] || state.tool;
  $('statSize').textContent = state.grid.w + ' x ' + state.grid.h;
  $('statTokens').textContent = String(state.tokens.length);
  $('statView').textContent = state.playerView ? 'Player' : (state.dmPreview ? 'DM (preview)' : 'DM');
  $<HTMLInputElement>('mapW').value = String(state.grid.w);
  $<HTMLInputElement>('mapH').value = String(state.grid.h);

  const mapName = state.campaign?.maps.find(m => m.id === state.mapId)?.name ?? '—';
  $('btnCampaignName').textContent = (state.campaign?.name ?? 'Campaign') + ' › ' + mapName;

  $('btnPanTool').classList.toggle('active', state.tool === 'pan');
  $('btnSelectTool').classList.toggle('active', state.tool === 'select');
  canvas.classList.toggle('tool-pan', state.tool === 'pan');
  canvas.classList.toggle('tool-select', state.tool === 'select' || state.tool === 'token');

  $<HTMLButtonElement>('btnUndo').disabled = !canUndo();
  $<HTMLButtonElement>('btnRedo').disabled = !canRedo();

  $('btnOvLight').classList.toggle('active', state.overlays.light);
  $('btnOvParty').classList.toggle('active', state.overlays.party);
  $('btnOvMonsters').classList.toggle('active', state.overlays.monsters);
  const overlaysUsable = !state.playerView && !state.dmPreview;
  ['btnOvLight', 'btnOvParty', 'btnOvMonsters'].forEach(id => { $<HTMLButtonElement>(id).disabled = !overlaysUsable; });
  syncLayersPanel();
}

export function setSaveStatus(status: 'saving' | 'saved' | 'error'): void {
  const el = $('statSave');
  el.textContent = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed';
  el.className = status;
}
