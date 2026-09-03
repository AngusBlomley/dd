/* Generator panel, map settings (resize, clear fog), layers panel. */

import { addMap, newMapRecord } from '../campaign';
import { generateDungeon, type GeneratorOptions } from '../engine/generator';
import { resizeGrid } from '../engine/grid';
import { requestRender } from '../render/canvas';
import { markChanged, pushUndo, state, type Layers, type Overlays } from '../state';
import { renderMapList } from './campaignPanel';
import { $ } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

const num = (id: string) => parseInt($<HTMLInputElement>(id).value, 10);

function syncGeneratorLabels(): void {
  const theme = $<HTMLSelectElement>('genTheme').value;
  const cave = theme === 'cave' || theme === 'underdark';
  $('genRoomsLabel').textContent = cave ? 'Openness' : 'Room Count';
  $('genRoomSizeRow').style.display = cave ? 'none' : '';
  $('genPillarsLabel').textContent = cave ? 'Stalagmites & mushrooms' : 'Pillar Density';
  $('genTorchesLabel').textContent = cave ? 'Glowing fungi & crystals' : 'Torch Density';
}

export function initGeneratorPanel(): void {
  $('genRooms').addEventListener('input', (e) => { $('genRoomsVal').textContent = (e.target as HTMLInputElement).value; });
  $('genTheme').addEventListener('change', syncGeneratorLabels);
  syncGeneratorLabels();
  $('btnGenerate').addEventListener('click', () => {
    const replace = $<HTMLInputElement>('genReplace').checked;
    if (replace) pushUndo();
    const roomMin = num('genRoomMin');
    const opts: GeneratorOptions = {
      w: num('genW'),
      h: num('genH'),
      theme: $<HTMLSelectElement>('genTheme').value as GeneratorOptions['theme'],
      roomCount: num('genRooms'),
      roomMin,
      roomMax: Math.max(roomMin, num('genRoomMax')),
      pillarDensity: parseFloat($<HTMLSelectElement>('genPillars').value),
      torchDensity: parseFloat($<HTMLSelectElement>('genTorches').value),
      stairsUp: num('genStairsUp'),
      stairsDown: num('genStairsDown'),
      seed: $<HTMLInputElement>('genSeed').value.trim(),
    };
    const grid = generateDungeon(opts);
    if (replace) {
      state.grid = grid;
      state.tokens.forEach(t => { t.x = Math.min(t.x, state.grid.w - 1); t.y = Math.min(t.y, state.grid.h - 1); });
      markChanged();
    } else {
      // Each generation becomes its own map (issue #6): the previous map and its tokens stay as they were.
      const themeLabel = $<HTMLSelectElement>('genTheme').selectedOptions[0]?.textContent?.split(' (')[0] ?? 'Map';
      const count = (state.campaign?.maps.length ?? 0) + 1;
      const name = opts.seed ? `${themeLabel} · ${opts.seed}` : `${themeLabel} ${count}`;
      addMap(newMapRecord(name, grid));
      renderMapList(); renderTokenList(); renderInspector();
    }
    requestRender(); setStatus();
  });
}

export function initMapSettings(): void {
  $('btnResize').addEventListener('click', () => {
    const w = num('mapW'), h = num('mapH');
    if (!w || !h) return;
    pushUndo();
    state.grid = resizeGrid(state.grid, w, h);
    state.tokens = state.tokens.filter(t => t.x < w && t.y < h);
    markChanged();
    requestRender(); setStatus(); renderTokenList();
  });

  $('btnClearFog').addEventListener('click', () => {
    pushUndo();
    state.grid.cells.forEach(c => { c.mem = null; });
    markChanged();
    requestRender();
  });
}

const LAYER_BOXES: { id: string; key: keyof Layers }[] = [
  { id: 'lyTerrain', key: 'terrain' },
  { id: 'lyWalls', key: 'walls' },
  { id: 'lyProps', key: 'props' },
  { id: 'lyTokens', key: 'tokens' },
  { id: 'lyGrid', key: 'grid' },
];
const OVERLAY_BOXES: { id: string; key: keyof Overlays }[] = [
  { id: 'lyLight', key: 'light' },
  { id: 'lyParty', key: 'party' },
  { id: 'lyMonsters', key: 'monsters' },
  { id: 'lyMemory', key: 'memory' },
];

export function initLayersPanel(): void {
  for (const b of LAYER_BOXES) {
    $<HTMLInputElement>(b.id).addEventListener('change', (e) => {
      state.layers[b.key] = (e.target as HTMLInputElement).checked;
      requestRender(); setStatus();
    });
  }
  for (const b of OVERLAY_BOXES) {
    $<HTMLInputElement>(b.id).addEventListener('change', (e) => {
      state.overlays[b.key] = (e.target as HTMLInputElement).checked;
      requestRender(); setStatus();
    });
  }
}

/** Called from setStatus so the checkboxes follow the top-bar buttons and vice versa. */
export function syncLayersPanel(): void {
  for (const b of LAYER_BOXES) $<HTMLInputElement>(b.id).checked = state.layers[b.key];
  for (const b of OVERLAY_BOXES) $<HTMLInputElement>(b.id).checked = state.overlays[b.key];
}
