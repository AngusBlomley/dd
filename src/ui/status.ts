import { canvas } from '../render/canvas';
import { state, type ToolId } from '../state';
import { $ } from './dom';

const TOOL_LABELS: Record<ToolId, string> = {
  terrain: 'Terrain Brush', wall: 'Wall Brush', door: 'Door Brush', prop: 'Prop Brush',
  eraser: 'Eraser', select: 'Select / Move Token', token: 'Place Token', pan: 'Pan',
};

/** Refreshes the status bar, tool buttons and canvas cursor from state. */
export function setStatus(): void {
  $('statTool').textContent = TOOL_LABELS[state.tool] || state.tool;
  $('statSize').textContent = state.grid.w + ' x ' + state.grid.h;
  $('statTokens').textContent = String(state.tokens.length);
  $('statView').textContent = state.playerView ? 'Player' : (state.dmPreview ? 'DM (preview)' : 'DM');
  $<HTMLInputElement>('mapW').value = String(state.grid.w);
  $<HTMLInputElement>('mapH').value = String(state.grid.h);

  $('btnPanTool').classList.toggle('active', state.tool === 'pan');
  $('btnSelectTool').classList.toggle('active', state.tool === 'select');
  canvas.classList.toggle('tool-pan', state.tool === 'pan');
  canvas.classList.toggle('tool-select', state.tool === 'select' || state.tool === 'token');

  $('btnOvLight').classList.toggle('active', state.overlays.light);
  $('btnOvParty').classList.toggle('active', state.overlays.party);
  $('btnOvMonsters').classList.toggle('active', state.overlays.monsters);
  const overlaysUsable = !state.playerView && !state.dmPreview;
  ['btnOvLight', 'btnOvParty', 'btnOvMonsters'].forEach(id => { $<HTMLButtonElement>(id).disabled = !overlaysUsable; });
}
