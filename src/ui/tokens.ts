/* Token creation form, token list, and the inspector for the selected token. */

import {
  DARKVISION_OPTIONS, DEFAULT_TOKEN_LIGHT, TOKEN_TYPE_COLORS, type Token, type TokenType,
} from '../engine/data';
import { requestRender } from '../render/canvas';
import { invalidateScene, pushUndo, state } from '../state';
import { $, escapeHtml } from './dom';
import { setStatus } from './status';

const ft = (cells: number) => cells * 5 + ' ft';

export interface TokenConfig {
  name: string; type: TokenType; color: string; size: number;
  vision: Token['vision']; light: Token['light']; hidden: boolean;
}

/* ---------- creation form ---------- */
let colorTouched = false;

/** Reads the form as it is right now. Called when the token is placed, so late edits count. */
export function readTokenForm(): TokenConfig {
  const type = $<HTMLSelectElement>('newTokType').value as TokenType;
  const hasLight = $<HTMLInputElement>('newTokLight').checked;
  return {
    name: $<HTMLInputElement>('newTokName').value.trim(),
    type,
    color: $<HTMLInputElement>('newTokColor').value,
    size: parseFloat($<HTMLSelectElement>('newTokSize').value),
    vision: {
      radius: parseInt($<HTMLInputElement>('newTokVision').value, 10),
      darkvision: parseInt($<HTMLSelectElement>('newTokDark').value, 10),
    },
    light: hasLight
      ? { bright: parseInt($<HTMLInputElement>('newTokBright').value, 10), dim: parseInt($<HTMLInputElement>('newTokDim').value, 10) }
      : null,
    hidden: $<HTMLInputElement>('newTokHidden').checked,
  };
}

function syncFormLabels(): void {
  const v = $<HTMLInputElement>('newTokVision').value;
  $('visionVal').textContent = v + ' squares (' + ft(+v) + ')';
  const b = $<HTMLInputElement>('newTokBright').value, d = $<HTMLInputElement>('newTokDim').value;
  $('brightVal').textContent = b + ' sq (' + ft(+b) + ')';
  $('dimVal').textContent = d + ' sq (' + ft(+d) + ')';
  $('tokLightRadiusWrap').style.display = $<HTMLInputElement>('newTokLight').checked ? 'block' : 'none';
}

export function initTokenForm(): void {
  const darkSel = $<HTMLSelectElement>('newTokDark');
  darkSel.innerHTML = DARKVISION_OPTIONS.map(c => `<option value="${c}">${c === 0 ? 'None' : ft(c) + ' (' + c + ' sq)'}</option>`).join('');
  $<HTMLInputElement>('newTokBright').value = String(DEFAULT_TOKEN_LIGHT.bright);
  $<HTMLInputElement>('newTokDim').value = String(DEFAULT_TOKEN_LIGHT.dim);

  ['newTokVision', 'newTokBright', 'newTokDim', 'newTokLight', 'newTokType'].forEach(id => {
    $(id).addEventListener('input', syncFormLabels);
  });
  $<HTMLInputElement>('newTokColor').addEventListener('input', () => { colorTouched = true; });
  $<HTMLSelectElement>('newTokType').addEventListener('change', (e) => {
    const type = (e.target as HTMLSelectElement).value as TokenType;
    if (!colorTouched) $<HTMLInputElement>('newTokColor').value = TOKEN_TYPE_COLORS[type];
  });
  $('btnArmToken').addEventListener('click', () => {
    state.placingToken = true;
    state.tool = 'token';
    $('armHint').style.display = 'block';
    setStatus();
  });
  syncFormLabels();
}

export function cancelPlacing(): void {
  state.placingToken = false;
  $('armHint').style.display = 'none';
}

export function deleteToken(id: number): void {
  pushUndo();
  state.tokens = state.tokens.filter(t => t.id !== id);
  if (state.selectedTokenId === id) state.selectedTokenId = null;
  invalidateScene();
  renderTokenList(); renderInspector(); requestRender(); setStatus();
}

/* ---------- list ---------- */
const TYPE_ICON: Record<TokenType, string> = { pc: '', npc: '', monster: '', object: '' };

export function renderTokenList(): void {
  const el = $('tokenList');
  el.innerHTML = '';
  if (state.tokens.length === 0) { el.innerHTML = '<div class="empty-note">No tokens placed yet.</div>'; return; }
  for (const tok of state.tokens) {
    const row = document.createElement('div');
    row.className = 'token-list-item' + (tok.id === state.selectedTokenId ? ' selected' : '');
    const flags = (tok.hidden ? ' <span title="Hidden from players">&#128065;&#65039;&#8203;</span>' : '') + (tok.light ? ' \u{1F525}' : '');
    row.innerHTML = '<div class="tok-dot" style="background:' + tok.color + '"></div><div class="tname">' + escapeHtml(tok.name) + TYPE_ICON[tok.type] + flags + '</div><div class="tdel" title="Delete">&#10005;</div>';
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tdel')) { deleteToken(tok.id); return; }
      state.selectedTokenId = tok.id;
      state.tool = 'select';
      renderTokenList(); renderInspector(); requestRender(); setStatus();
    });
    el.appendChild(row);
  }
}

/* ---------- inspector ---------- */
export function renderInspector(): void {
  const body = $('inspectorBody');
  const tok = state.tokens.find(t => t.id === state.selectedTokenId);
  if (!tok) { body.innerHTML = '<div class="empty-note">Select a token on the map, or in the Tokens tab, to edit it here.</div>'; return; }

  const dvOptions = DARKVISION_OPTIONS.map(c => `<option value="${c}">${c === 0 ? 'None' : ft(c)}</option>`).join('');
  body.innerHTML = `
    <label class="field">Name</label>
    <input type="text" id="insName">
    <label class="field">Type</label>
    <select id="insType"><option value="pc">Player Character</option><option value="npc">NPC / Ally</option><option value="monster">Monster / Enemy</option><option value="object">Object / Marker</option></select>
    <label class="field">Color</label>
    <input type="color" id="insColor">
    <label class="field">Size</label>
    <select id="insSize"><option value="0.6">Tiny</option><option value="1">Small/Medium</option><option value="1.5">Large</option><option value="2">Huge</option><option value="3">Gargantuan</option></select>
    <label class="field">Vision: <span id="insVisionVal"></span></label>
    <input type="range" id="insVision" min="0" max="30">
    <label class="field">Darkvision</label>
    <select id="insDark">${dvOptions}</select>
    <div class="check-row"><input type="checkbox" id="insLight"><label for="insLight">Carries light</label></div>
    <div id="insLightWrap">
      <label class="field">Bright: <span id="insBrightVal"></span></label>
      <input type="range" id="insBright" min="0" max="12">
      <label class="field">Dim (total reach): <span id="insDimVal"></span></label>
      <input type="range" id="insDim" min="0" max="24">
    </div>
    <div class="check-row"><input type="checkbox" id="insHidden"><label for="insHidden">Hidden from players</label></div>
    <button class="btn danger full-btn" id="insDelete" style="margin-top:14px">Remove Token</button>`;

  const f = <T extends HTMLElement>(id: string) => $<T>(id);
  f<HTMLInputElement>('insName').value = tok.name;
  f<HTMLSelectElement>('insType').value = tok.type;
  f<HTMLInputElement>('insColor').value = tok.color;
  f<HTMLSelectElement>('insSize').value = String(tok.size);
  f<HTMLInputElement>('insVision').value = String(tok.vision.radius);
  f<HTMLSelectElement>('insDark').value = String(tok.vision.darkvision);
  f<HTMLInputElement>('insLight').checked = !!tok.light;
  f<HTMLInputElement>('insBright').value = String(tok.light ? tok.light.bright : DEFAULT_TOKEN_LIGHT.bright);
  f<HTMLInputElement>('insDim').value = String(tok.light ? tok.light.dim : DEFAULT_TOKEN_LIGHT.dim);
  f<HTMLInputElement>('insHidden').checked = !!tok.hidden;

  const syncLabels = () => {
    const v = f<HTMLInputElement>('insVision').value;
    f('insVisionVal').textContent = v + ' sq (' + ft(+v) + ')';
    const b = f<HTMLInputElement>('insBright').value, d = f<HTMLInputElement>('insDim').value;
    f('insBrightVal').textContent = b + ' sq (' + ft(+b) + ')';
    f('insDimVal').textContent = d + ' sq (' + ft(+d) + ')';
    f('insLightWrap').style.display = f<HTMLInputElement>('insLight').checked ? 'block' : 'none';
  };
  syncLabels();

  const commit = () => {
    const oldType = tok.type;
    const newType = f<HTMLSelectElement>('insType').value as TokenType;
    if (newType !== oldType && f<HTMLInputElement>('insColor').value === TOKEN_TYPE_COLORS[oldType]) {
      f<HTMLInputElement>('insColor').value = TOKEN_TYPE_COLORS[newType];
    }
    tok.name = f<HTMLInputElement>('insName').value.trim() || tok.name;
    tok.type = newType;
    tok.color = f<HTMLInputElement>('insColor').value;
    tok.size = parseFloat(f<HTMLSelectElement>('insSize').value);
    tok.vision = {
      radius: parseInt(f<HTMLInputElement>('insVision').value, 10),
      darkvision: parseInt(f<HTMLSelectElement>('insDark').value, 10),
    };
    const dim = Math.max(parseInt(f<HTMLInputElement>('insBright').value, 10), parseInt(f<HTMLInputElement>('insDim').value, 10));
    f<HTMLInputElement>('insDim').value = String(dim);
    tok.light = f<HTMLInputElement>('insLight').checked
      ? { bright: parseInt(f<HTMLInputElement>('insBright').value, 10), dim }
      : null;
    tok.hidden = f<HTMLInputElement>('insHidden').checked;
    syncLabels();
    invalidateScene();
    renderTokenList();
    requestRender();
  };
  body.querySelectorAll('input,select').forEach(elm => elm.addEventListener('input', commit));
  f('insDelete').addEventListener('click', () => deleteToken(tok.id));
}
