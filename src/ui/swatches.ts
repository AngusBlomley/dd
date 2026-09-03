/* Sidebar tabs, terrain / prop / structure swatches, brush mode buttons. */

import { PROPS, PROP_CATEGORY_LABELS, TERRAINS, type PropCategory, type Terrain } from '../engine/data';
import { state, type BrushMode, type ToolId } from '../state';
import { $ } from './dom';
import { setStatus } from './status';

function selectOnly(container: string, el: HTMLElement): void {
  document.querySelectorAll(container + ' .swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

const TERRAIN_GROUPS: { key: Terrain['group']; label: string }[] = [
  { key: 'built', label: 'Built' }, { key: 'natural', label: 'Natural' },
  { key: 'underdark', label: 'Underdark' }, { key: 'liquid', label: 'Liquid' }, { key: 'other', label: 'Other' },
];

export function initSwatches(): void {
  const terrainEl = $('terrainSwatches');
  for (const g of TERRAIN_GROUPS) {
    const items = TERRAINS.filter(t => t.group === g.key);
    if (!items.length) continue;
    const lab = document.createElement('div'); lab.className = 'swatch-group-label'; lab.textContent = g.label;
    terrainEl.appendChild(lab);
    const grid = document.createElement('div'); grid.className = 'swatch-grid';
    for (const t of items) {
      const el = document.createElement('div');
      el.className = 'swatch' + (t.id === state.selectedTerrain ? ' selected' : ''); el.dataset.terrain = t.id;
      el.innerHTML = '<div class="chip" style="background:' + t.color + '"></div>' + t.name;
      el.addEventListener('click', () => {
        state.selectedTerrain = t.id; state.tool = 'terrain';
        selectOnly('#terrainSwatches', el);
        setStatus();
      });
      grid.appendChild(el);
    }
    terrainEl.appendChild(grid);
  }

  const propEl = $('propSwatches');
  for (const cat of Object.keys(PROP_CATEGORY_LABELS) as PropCategory[]) {
    const items = PROPS.filter(p => p.cat === cat);
    if (!items.length) continue;
    const lab = document.createElement('div'); lab.className = 'swatch-group-label'; lab.textContent = PROP_CATEGORY_LABELS[cat];
    propEl.appendChild(lab);
    const grid = document.createElement('div'); grid.className = 'swatch-grid';
    for (const p of items) {
      const el = document.createElement('div');
      el.className = 'swatch'; el.dataset.prop = p.id;
      const tip = [p.light ? `light ${p.light.bright * 5}/${p.light.dim * 5} ft` : '', p.blocksLOS ? 'blocks sight' : '', p.blocksMove ? 'blocks movement' : ''].filter(Boolean).join(', ');
      if (tip) el.title = tip;
      el.innerHTML = '<div class="prop-icon">' + p.icon + '</div>' + p.name;
      el.addEventListener('click', () => {
        state.selectedProp = p.id; state.tool = 'prop';
        selectOnly('#propSwatches', el);
        setStatus();
      });
      grid.appendChild(el);
    }
    propEl.appendChild(grid);
  }

  document.querySelectorAll<HTMLElement>('#panel-walls .swatch').forEach(el => {
    el.addEventListener('click', () => {
      state.tool = el.dataset.tool as ToolId;
      selectOnly('#panel-walls', el);
      setStatus();
    });
  });
}

export function initTabs(): void {
  document.querySelectorAll<HTMLElement>('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.panel!));
  });
}

export function showTab(panel: string): void {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.panel === panel));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + panel));
  if (panel === 'tokens') state.tool = 'select';
  setStatus();
}

export function initBrushButtons(): void {
  const setMode = (m: BrushMode) => {
    state.brushMode = m;
    $('brushSingle').classList.toggle('primary', m === 'single');
    $('brushRect').classList.toggle('primary', m === 'rect');
  };
  $('brushSingle').addEventListener('click', () => setMode('single'));
  $('brushRect').addEventListener('click', () => setMode('rect'));
  setMode(state.brushMode);
}
