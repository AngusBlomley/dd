/* Sidebar tabs, terrain / prop / structure swatches, brush mode buttons. */

import { PROPS, TERRAINS } from '../engine/data';
import { state, type BrushMode, type ToolId } from '../state';
import { $ } from './dom';
import { setStatus } from './status';

function selectOnly(container: string, el: HTMLElement): void {
  document.querySelectorAll(container + ' .swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

export function initSwatches(): void {
  const terrainEl = $('terrainSwatches');
  for (const t of TERRAINS) {
    const el = document.createElement('div');
    el.className = 'swatch'; el.dataset.terrain = t.id;
    el.innerHTML = '<div class="chip" style="background:' + t.color + '"></div>' + t.name;
    el.addEventListener('click', () => {
      state.selectedTerrain = t.id; state.tool = 'terrain';
      selectOnly('#terrainSwatches', el);
      setStatus();
    });
    terrainEl.appendChild(el);
  }
  (terrainEl.firstChild as HTMLElement).classList.add('selected');

  const propEl = $('propSwatches');
  for (const p of PROPS) {
    const el = document.createElement('div');
    el.className = 'swatch'; el.dataset.prop = p.id;
    el.innerHTML = '<div class="prop-icon">' + p.icon + '</div>' + p.name;
    el.addEventListener('click', () => {
      state.selectedProp = p.id; state.tool = 'prop';
      selectOnly('#propSwatches', el);
      setStatus();
    });
    propEl.appendChild(el);
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
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('panel-' + tab.dataset.panel).classList.add('active');
      if (tab.dataset.panel === 'tokens') state.tool = 'select';
      setStatus();
    });
  });
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
