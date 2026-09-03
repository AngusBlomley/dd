/* Token creation form, token list, and the inspector for the selected token. */

import { TOKEN_TYPE_COLORS, type TokenType } from '../engine/data';
import { requestRender } from '../render/canvas';
import { invalidateVisibility, pushUndo, state } from '../state';
import { $, escapeHtml } from './dom';
import { setStatus } from './status';

/* ---------- creation form ---------- */
export function initTokenForm(): void {
  const vision = $<HTMLInputElement>('newTokVision');
  vision.addEventListener('input', () => { $('visionVal').textContent = vision.value; });
  const lightRadius = $<HTMLInputElement>('newTokLightRadius');
  lightRadius.addEventListener('input', () => { $('lightVal').textContent = lightRadius.value; });
  $<HTMLInputElement>('newTokLight').addEventListener('change', (e) => {
    $('tokLightRadiusWrap').style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none';
  });
  $<HTMLSelectElement>('newTokType').addEventListener('change', (e) => {
    const type = (e.target as HTMLSelectElement).value as TokenType;
    $<HTMLInputElement>('newTokColor').value = TOKEN_TYPE_COLORS[type] || '#4f8a79';
  });
  $('btnArmToken').addEventListener('click', () => {
    state.pendingTokenConfig = {
      name: $<HTMLInputElement>('newTokName').value.trim(),
      type: $<HTMLSelectElement>('newTokType').value as TokenType,
      color: $<HTMLInputElement>('newTokColor').value,
      size: parseFloat($<HTMLSelectElement>('newTokSize').value),
      vision: parseInt($<HTMLInputElement>('newTokVision').value, 10),
      darkvision: $<HTMLInputElement>('newTokDark').checked,
      hasLight: $<HTMLInputElement>('newTokLight').checked,
      lightRadius: parseInt($<HTMLInputElement>('newTokLightRadius').value, 10),
    };
    state.tool = 'token';
    $('armHint').style.display = 'block';
    setStatus();
  });
}

export function deleteToken(id: number): void {
  pushUndo();
  state.tokens = state.tokens.filter(t => t.id !== id);
  if (state.selectedTokenId === id) state.selectedTokenId = null;
  invalidateVisibility();
  renderTokenList(); renderInspector(); requestRender(); setStatus();
}

/* ---------- list ---------- */
export function renderTokenList(): void {
  const el = $('tokenList');
  el.innerHTML = '';
  if (state.tokens.length === 0) { el.innerHTML = '<div class="empty-note">No tokens placed yet.</div>'; return; }
  for (const tok of state.tokens) {
    const row = document.createElement('div');
    row.className = 'token-list-item' + (tok.id === state.selectedTokenId ? ' selected' : '');
    row.innerHTML = '<div class="tok-dot" style="background:' + tok.color + '"></div><div class="tname">' + escapeHtml(tok.name) + '</div><div class="tdel" title="Delete">&#10005;</div>';
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tdel')) { deleteToken(tok.id); return; }
      state.selectedTokenId = tok.id;
      renderTokenList(); renderInspector(); requestRender();
    });
    el.appendChild(row);
  }
}

/* ---------- inspector ---------- */
export function renderInspector(): void {
  const body = $('inspectorBody');
  const tok = state.tokens.find(t => t.id === state.selectedTokenId);
  if (!tok) { body.innerHTML = '<div class="empty-note">Select a token on the map, or in the Tokens tab, to edit it here.</div>'; return; }
  body.innerHTML = '';
  const mk = (labelHtml: string, inputHtml: string) => {
    const wrap = document.createElement('div');
    const lab = document.createElement('label'); lab.className = 'field'; lab.innerHTML = labelHtml;
    wrap.appendChild(lab); wrap.insertAdjacentHTML('beforeend', inputHtml);
    return wrap;
  };
  body.appendChild(mk('Name', '<input type="text" id="insName" value="' + escapeHtml(tok.name) + '">'));
  const typeSel = mk('Type', '<select id="insType"><option value="pc">Player Character</option><option value="npc">NPC / Ally</option><option value="monster">Monster / Enemy</option><option value="object">Object / Marker</option></select>');
  body.appendChild(typeSel);
  typeSel.querySelector('select')!.value = tok.type;
  body.appendChild(mk('Color', '<input type="color" id="insColor" value="' + tok.color + '">'));
  const sizeSel = mk('Size', '<select id="insSize"><option value="0.6">Tiny</option><option value="1">Small/Medium</option><option value="1.5">Large</option><option value="2">Huge</option><option value="3">Gargantuan</option></select>');
  body.appendChild(sizeSel);
  sizeSel.querySelector('select')!.value = String(tok.size);
  body.appendChild(mk('Vision Radius: <span id="insVisionVal">' + tok.vision + '</span> sq', '<input type="range" id="insVision" min="0" max="20" value="' + tok.vision + '">'));

  const dvRow = document.createElement('div'); dvRow.className = 'check-row';
  dvRow.innerHTML = '<input type="checkbox" id="insDark" ' + (tok.darkvision ? 'checked' : '') + '><label for="insDark">Darkvision</label>';
  body.appendChild(dvRow);

  const lightRow = document.createElement('div'); lightRow.className = 'check-row';
  lightRow.innerHTML = '<input type="checkbox" id="insLight" ' + (tok.hasLight ? 'checked' : '') + '><label for="insLight">Carries light</label>';
  body.appendChild(lightRow);

  const lrWrap = document.createElement('div'); lrWrap.id = 'insLightRadiusWrap';
  lrWrap.style.display = tok.hasLight ? 'block' : 'none';
  lrWrap.innerHTML = '<label class="field">Light Radius: <span id="insLightVal">' + (tok.lightRadius || 4) + '</span> sq</label><input type="range" id="insLightRadius" min="1" max="12" value="' + (tok.lightRadius || 4) + '">';
  body.appendChild(lrWrap);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn danger full-btn'; delBtn.textContent = 'Remove Token'; delBtn.style.marginTop = '14px';
  body.appendChild(delBtn);

  const commit = () => {
    tok.name = $<HTMLInputElement>('insName').value.trim() || tok.name;
    tok.type = $<HTMLSelectElement>('insType').value as TokenType;
    tok.color = $<HTMLInputElement>('insColor').value;
    tok.size = parseFloat($<HTMLSelectElement>('insSize').value);
    tok.vision = parseInt($<HTMLInputElement>('insVision').value, 10);
    tok.darkvision = $<HTMLInputElement>('insDark').checked;
    tok.hasLight = $<HTMLInputElement>('insLight').checked;
    tok.lightRadius = parseInt($<HTMLInputElement>('insLightRadius').value, 10) || 4;
    $('insLightRadiusWrap').style.display = tok.hasLight ? 'block' : 'none';
    invalidateVisibility();
    renderTokenList();
    requestRender();
  };
  body.querySelectorAll('input,select').forEach(elm => {
    elm.addEventListener('input', () => {
      $('insVisionVal').textContent = $<HTMLInputElement>('insVision').value;
      $('insLightVal').textContent = $<HTMLInputElement>('insLightRadius').value;
      commit();
    });
  });
  delBtn.addEventListener('click', () => deleteToken(tok.id));
}
