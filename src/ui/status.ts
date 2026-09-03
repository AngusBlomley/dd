import { state, type ToolId } from '../state';
import { $ } from './dom';

const TOOL_LABELS: Record<ToolId, string> = {
  terrain: 'Terrain Brush', wall: 'Wall Brush', door: 'Door Brush', prop: 'Prop Brush',
  eraser: 'Eraser', select: 'Select / Move Token', token: 'Place Token', pan: 'Pan',
};

export function setStatus(): void {
  $('statTool').textContent = TOOL_LABELS[state.tool] || state.tool;
  $('statSize').textContent = state.grid.w + ' x ' + state.grid.h;
  $('statTokens').textContent = String(state.tokens.length);
  $('statView').textContent = state.playerView ? 'Player' : (state.dmPreview ? 'DM (preview)' : 'DM');
  $<HTMLInputElement>('mapW').value = String(state.grid.w);
  $<HTMLInputElement>('mapH').value = String(state.grid.h);
}
