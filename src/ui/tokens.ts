/* Token creation form, token list, and the inspector for the selected token. */

import {
  DARKVISION_OPTIONS, DEFAULT_TOKEN_LIGHT, LOOT_PROPS, PROP_MAP, TOKEN_TYPE_COLORS, type Token, type TokenType,
} from '../engine/data';
import { entriesOf, mapById, resolveExit } from '../campaign';
import { cellAt } from '../engine/grid';
import { countProps, rectArea, tokensIn } from '../engine/region';
import { clearSelection } from './interaction';
import { requestRender } from '../render/canvas';
import { markChanged, pushUndo, state } from '../state';
import { $, escapeHtml } from './dom';
import { sendThrough } from './sessionPanel';
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
    // Player characters can go straight to the map's arrival point (issue #12); everyone else is placed freely.
    const type = $<HTMLSelectElement>('newTokType').value;
    const rec = state.mapId ? mapById(state.mapId) : undefined;
    const entries = rec ? entriesOf({ ...rec, grid: state.grid }) : [];
    if (type !== 'pc' || !entries.length) { armFreePlacement(); return; }
    $('modalPlace').classList.remove('hidden');
  });
  $('placeAtEntryBtn').addEventListener('click', () => {
    $('modalPlace').classList.add('hidden');
    const rec = state.mapId ? mapById(state.mapId) : undefined;
    const entries = rec ? entriesOf({ ...rec, grid: state.grid }) : [];
    if (!entries.length) { armFreePlacement(); return; }
    // stack characters next to the entry if it is already taken
    let spot = entries[0];
    const taken = (x: number, y: number) => state.tokens.some(t => t.x === x && t.y === y);
    if (taken(spot.x, spot.y)) {
      outer: for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const c = cellAt(state.grid, spot.x + dx, spot.y + dy);
        if (c && !c.w && !(c.d && !c.doOpen) && !taken(spot.x + dx, spot.y + dy)) { spot = { x: spot.x + dx, y: spot.y + dy }; break outer; }
      }
    }
    createTokenAt(spot.x, spot.y);
    state.tool = 'select';
    renderTokenList(); renderInspector(); requestRender(); setStatus();
  });
  $('placeFreeBtn').addEventListener('click', () => { $('modalPlace').classList.add('hidden'); armFreePlacement(); });
  $('placeCancelBtn').addEventListener('click', () => { $('modalPlace').classList.add('hidden'); });
  syncFormLabels();
}

export function cancelPlacing(): void {
  state.placingToken = false;
  $('armHint').style.display = 'none';
}

/** Creates a token from the form at a cell. Used by click placement and by "at the arrival point". */
export function createTokenAt(x: number, y: number): Token {
  const cfg = readTokenForm();
  pushUndo();
  const tok: Token = {
    id: state.nextTokenId++,
    name: cfg.name || ('Token ' + (state.nextTokenId - 1)),
    type: cfg.type, x, y, color: cfg.color, size: cfg.size,
    vision: cfg.vision, light: cfg.light,
    hidden: cfg.hidden || undefined,
  };
  state.tokens.push(tok);
  state.selectedTokenId = tok.id;
  markChanged();
  return tok;
}

function armFreePlacement(): void {
  state.placingToken = true;
  state.tool = 'token';
  $('armHint').style.display = 'block';
  setStatus();
}

export function deleteToken(id: number): void {
  pushUndo();
  state.tokens = state.tokens.filter(t => t.id !== id);
  if (state.selectedTokenId === id) state.selectedTokenId = null;
  markChanged();
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
  if (!tok) {
    if (state.selection) { renderSelectionInspector(body); return; }
    if (state.selectedCell) { renderCellInspector(body, state.selectedCell.x, state.selectedCell.y); return; }
    body.innerHTML = '<div class="empty-note">Select a token on the map, or in the Tokens tab, to edit it here. With the Select tool, click an Exit or Entry cell to link maps.</div>';
    return;
  }

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
    <div id="insNpc">
      <label class="field">Role (shown to players)</label>
      <input type="text" id="insRole" placeholder="e.g. Innkeeper, guard captain, fungus farmer">
      <label class="field">Trade (what they offer, shown to players)</label>
      <textarea id="insTrade" rows="4" placeholder="e.g. Rooms 5 sp a night. Sells rations, torches and rope. Buys gems."></textarea>
      <div class="hint">Players tap this NPC to read the name, role and trade.</div>
    </div>
    <div id="insExit"></div>
    <button class="btn danger full-btn" id="insDelete" style="margin-top:14px">Remove Token</button>`;

  const here = cellAt(state.grid, tok.x, tok.y);
  const rec = state.mapId ? mapById(state.mapId) : undefined;
  if (here && here.p === 'exit' && rec) {
    const r = resolveExit({ ...rec, grid: state.grid, tokens: state.tokens }, tok.x, tok.y);
    const box = $('insExit');
    if (tok.type === 'pc' && r) {
      box.innerHTML = `<div class="callout-small">Standing at an exit to <b>${escapeHtml(r.map.name)}</b>.</div>`;
      const b = document.createElement('button');
      b.className = 'btn primary full-btn'; b.textContent = 'Send through to ' + r.map.name;
      b.addEventListener('click', () => sendThrough(state.mapId!, tok.id));
      box.appendChild(b);
    } else if (!r) {
      box.innerHTML = '<div class="callout-small">This exit leads nowhere yet. Link it with the Select tool, or set a next map in the Maps tab.</div>';
    }
  }

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
  f<HTMLInputElement>('insRole').value = tok.role ?? '';
  f<HTMLTextAreaElement>('insTrade').value = tok.trade ?? '';

  const syncLabels = () => {
    const v = f<HTMLInputElement>('insVision').value;
    f('insVisionVal').textContent = v + ' sq (' + ft(+v) + ')';
    const b = f<HTMLInputElement>('insBright').value, d = f<HTMLInputElement>('insDim').value;
    f('insBrightVal').textContent = b + ' sq (' + ft(+b) + ')';
    f('insDimVal').textContent = d + ' sq (' + ft(+d) + ')';
    f('insLightWrap').style.display = f<HTMLInputElement>('insLight').checked ? 'block' : 'none';
    f('insNpc').style.display = f<HTMLSelectElement>('insType').value === 'npc' ? 'block' : 'none';
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
    tok.role = f<HTMLInputElement>('insRole').value.trim() || undefined;
    tok.trade = f<HTMLTextAreaElement>('insTrade').value.trim() || undefined;
    syncLabels();
    markChanged();
    renderTokenList();
    requestRender();
  };
  body.querySelectorAll('input,select,textarea').forEach(elm => elm.addEventListener('input', commit));
  f('insDelete').addEventListener('click', () => deleteToken(tok.id));
}

/* ---------- exit / entry cell inspector ---------- */

function renderCellInspector(body: HTMLElement, x: number, y: number): void {
  const cell = cellAt(state.grid, x, y);
  const c = state.campaign;
  if (!cell || !c) { body.innerHTML = ''; return; }
  if (cell.p === 'entry') {
    body.innerHTML = `<div class="callout-small"><b>Entry</b> at (${x}, ${y}). Exits on other maps can link here. Characters sent through arrive on this cell.</div>`;
    return;
  }
  if (cell.d) { renderDoorInspector(body, cell, x, y); return; }
  if (cell.p && cell.p !== 'exit') { renderPropInspector(body, cell, x, y); return; }
  if (cell.p !== 'exit') { body.innerHTML = ''; return; }
  const link = cell.link ?? null;
  const mapOpts = c.maps.map(m => `<option value="${m.id}"${link && link.mapId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}${m.id === state.mapId ? ' (this map)' : ''}</option>`).join('');
  body.innerHTML = `
    <div class="callout-small"><b>Exit</b> at (${x}, ${y}). A character standing here waits until you send them through.${(() => { const rec = state.mapId ? mapById(state.mapId) : undefined; const r = rec ? resolveExit({ ...rec, grid: state.grid, tokens: state.tokens }, x, y) : null; return r ? ' Currently leads to <b>' + escapeHtml(r.map.name) + '</b>' + (link ? '' : ' (the map\'s next map)') + '.' : ' It leads nowhere yet.'; })()}</div>
    <label class="field">Leads to map</label>
    <select id="exitMap"><option value="">— use the map's next map —</option>${mapOpts}</select>
    <label class="field">Arrives at</label>
    <select id="exitEntry"></select>
    <div class="hint">Place an Entry prop on the target map to get arrival points here, or pick a cell by coordinates.</div>
    <div class="row2"><div><label class="field">x</label><input type="number" id="exitX" min="0"></div><div><label class="field">y</label><input type="number" id="exitY" min="0"></div></div>
    <button class="btn primary full-btn" id="exitSave">Save link</button>
    <button class="btn full-btn" id="exitClear">Remove link</button>`;
  const mapSel = $<HTMLSelectElement>('exitMap');
  const entrySel = $<HTMLSelectElement>('exitEntry');
  const xIn = $<HTMLInputElement>('exitX'), yIn = $<HTMLInputElement>('exitY');
  const fillEntries = () => {
    const m = mapById(mapSel.value);
    entrySel.innerHTML = '<option value="">Custom cell (below)</option>';
    if (!m) return;
    for (const e of entriesOf(m)) {
      const sel = link && link.mapId === m.id && link.x === e.x && link.y === e.y ? ' selected' : '';
      entrySel.innerHTML += `<option value="${e.x},${e.y}"${sel}>Entry at (${e.x}, ${e.y})</option>`;
    }
    if (entrySel.value === '' && entrySel.options.length > 1 && !link) entrySel.selectedIndex = 1;
    if (entrySel.value) { const [ex, ey] = entrySel.value.split(','); xIn.value = ex; yIn.value = ey; }
  };
  if (link) { xIn.value = String(link.x); yIn.value = String(link.y); }
  fillEntries();
  mapSel.addEventListener('change', fillEntries);
  entrySel.addEventListener('change', () => { if (entrySel.value) { const [ex, ey] = entrySel.value.split(','); xIn.value = ex; yIn.value = ey; } });
  $('exitSave').addEventListener('click', () => {
    const m = mapById(mapSel.value);
    const lx = parseInt(xIn.value, 10), ly = parseInt(yIn.value, 10);
    if (!m || isNaN(lx) || isNaN(ly) || lx < 0 || ly < 0 || lx >= m.grid.w || ly >= m.grid.h) { alert('Pick a map and a cell inside it.'); return; }
    pushUndo();
    cell.link = { mapId: m.id, x: lx, y: ly };
    markChanged(); requestRender(); renderInspector();
  });
  $('exitClear').addEventListener('click', () => {
    pushUndo();
    cell.link = null;
    markChanged(); requestRender(); renderInspector();
  });
}

/* ---------- door inspector (issue #9) ---------- */

function renderDoorInspector(body: HTMLElement, cell: import('../engine/grid').Cell, x: number, y: number): void {
  const kind = cell.secret ? 'Secret door' : 'Door';
  body.innerHTML = `
    <div class="callout-small"><b>${kind}</b> at (${x}, ${y}) · ${cell.doOpen ? 'open' : 'closed'}${cell.secret ? ' · hidden from players (looks like a wall)' : ''}</div>
    ${cell.secret ? '<button class="btn primary full-btn" id="doorReveal">Reveal to players</button>' : ''}
    <button class="btn full-btn" id="doorToggle">${cell.doOpen ? 'Close door' : 'Open door'}</button>
    ${cell.secret ? '' : '<button class="btn full-btn" id="doorHide">Make secret again</button>'}
    <div class="hint">Revealing turns the wall into a visible door for the players. Opening it lets light and sight through. Doors draw across whichever wall they sit in.</div>`;
  const done = () => { markChanged(); requestRender(); renderInspector(); };
  document.getElementById('doorReveal')?.addEventListener('click', () => { pushUndo(); cell.secret = false; done(); });
  document.getElementById('doorToggle')?.addEventListener('click', () => { pushUndo(); cell.doOpen = !cell.doOpen; done(); });
  document.getElementById('doorHide')?.addEventListener('click', () => { pushUndo(); cell.secret = true; cell.doOpen = false; done(); });
}

/* ---------- prop inspector, with the treasure editor (issues #17, #18) ---------- */

function renderPropInspector(body: HTMLElement, cell: import('../engine/grid').Cell, x: number, y: number): void {
  const pd = cell.p ? PROP_MAP[cell.p] : undefined;
  const name = pd?.name ?? cell.p ?? 'Prop';
  const lootable = !!cell.p && LOOT_PROPS.has(cell.p);
  const notes = [pd?.light ? `Light ${pd.light.bright * 5}/${pd.light.dim * 5} ft` : '', pd?.blocksLOS ? 'Blocks sight' : '', pd?.blocksMove ? 'Blocks movement' : ''].filter(Boolean).join(' · ');
  body.innerHTML = `
    <div class="callout-small"><b>${pd?.icon ?? ''} ${escapeHtml(name)}</b> at (${x}, ${y})${cell.p === 'entry' ? '. Characters sent to this map arrive here.' : ''}${notes ? '<div class="map-meta">' + notes + '</div>' : ''}</div>
    <label class="field">Name shown to players</label>
    <input type="text" id="lootTitle" placeholder="e.g. ${escapeHtml(name)}">
    <label class="field">Description shown to players when they look</label>
    <textarea id="lootText" rows="5" placeholder="${lootable ? 'e.g. Inside: 40 gp, a silver locket and a potion of healing.' : 'e.g. A weathered statue of a drow matron, one hand raised.'}"></textarea>
    ${lootable ? '<div class="check-row"><input type="checkbox" id="lootPickup"><label for="lootPickup">Players can pick it up (removes it from the map)</label></div>' : ''}
    <div class="hint">Players tap any prop they can see to read its name and this description. ${lootable ? 'If pick-up is allowed, players next to it also get Take, and you see who took it in the Session tab.' : ''}</div>
    <div class="hint">Drag it with the Select tool to move it.</div>
    <button class="btn danger full-btn" id="propRemove" style="margin-top:10px">Remove ${escapeHtml(name)}</button>`;
  {
    const title = $<HTMLInputElement>('lootTitle'), text = $<HTMLTextAreaElement>('lootText');
    const pickup = lootable ? $<HTMLInputElement>('lootPickup') : null;
    title.value = cell.loot?.title ?? ''; text.value = cell.loot?.text ?? '';
    if (pickup) pickup.checked = !!cell.loot?.pickup;
    const commit = () => {
      const t = title.value.trim(), d = text.value.trim();
      cell.loot = t || d ? { title: t || name, text: d, pickup: !!pickup?.checked } : null;
      markChanged();
    };
    title.addEventListener('input', commit); text.addEventListener('input', commit); pickup?.addEventListener('change', commit);
  }
  $('propRemove').addEventListener('click', () => {
    pushUndo();
    cell.p = null; cell.link = null; cell.loot = null;
    state.selectedCell = null;
    markChanged(); requestRender(); renderInspector();
  });
}

/* ---------- area selection (issue #25) ---------- */

function renderSelectionInspector(body: HTMLElement): void {
  const r = state.selection!;
  const props = countProps(state.grid, r);
  const toks = tokensIn(state.tokens, r).length;
  let walls = 0, doors = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const c = cellAt(state.grid, x, y)!; if (c.w) walls++; if (c.d) doors++; }
  body.innerHTML = `
    <div class="callout-small"><b>${rectArea(r)} cells selected</b> · (${r.x0}, ${r.y0}) to (${r.x1}, ${r.y1})
      <div class="map-meta">${props} prop${props === 1 ? '' : 's'} · ${toks} token${toks === 1 ? '' : 's'} · ${walls} wall${walls === 1 ? '' : 's'} · ${doors} door${doors === 1 ? '' : 's'}</div></div>
    <div class="hint">Drag inside the selection to move everything in it. Delete removes it all. Esc deselects.</div>
    <button class="btn full-btn" id="selRemoveProps">Remove props</button>
    <button class="btn full-btn" id="selRemoveTokens">Remove tokens</button>
    <button class="btn full-btn" id="selRemoveWalls">Remove walls &amp; doors</button>
    <button class="btn danger full-btn" id="selRemoveAll" style="margin-top:10px">Remove everything</button>
    <div class="hint">Terrain and fog memory are always kept.</div>`;
  $('selRemoveProps').addEventListener('click', () => clearSelection('props'));
  $('selRemoveTokens').addEventListener('click', () => clearSelection('tokens'));
  $('selRemoveWalls').addEventListener('click', () => clearSelection('structure'));
  $('selRemoveAll').addEventListener('click', () => clearSelection('all'));
}
