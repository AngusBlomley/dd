/* Session tab: start / end hosting, show the room code and join link,
   list players, assign tokens, movement mode and turns, and send
   characters through linked exits. */

import { mapById, resolveExit, transferToken } from '../campaign';
import { session } from '../net/host';
import type { MoveMode } from '../net/protocol';
import { relayAvailable } from '../net/transport';
import { requestRender } from '../render/canvas';
import { onChange, state } from '../state';
import { $, escapeHtml } from './dom';
import { setStatus } from './status';
import { renderInspector, renderTokenList } from './tokens';

function pcOptions(selectedMapId: string | null, selectedTokenId: number | null): string {
  const c = state.campaign;
  if (!c) return '';
  let html = '<option value="">— not on the map —</option>';
  for (const m of c.maps) {
    const pcs = m.tokens.filter(t => t.type === 'pc');
    if (!pcs.length) continue;
    html += `<optgroup label="${escapeHtml(m.name)}">`;
    for (const t of pcs) {
      const sel = m.id === selectedMapId && t.id === selectedTokenId ? ' selected' : '';
      html += `<option value="${m.id}:${t.id}"${sel}>${escapeHtml(t.name)}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

function panelVisible(): boolean {
  return $('panel-session').classList.contains('active');
}

export function renderSessionPanel(): void {
  const info = session.info;
  $('sessionOff').hidden = !!info;
  $('sessionOn').hidden = !info;
  if (info) {
    $('sessionCode').textContent = info.code;
    $<HTMLInputElement>('sessionLink').value = info.joinUrl;
    $('sessionMode').textContent = info.mode === 'lan'
      ? 'Hosting through the local relay. Players must be on the same network (or you have forwarded the port).'
      : 'Hosting directly from this browser. Keep this tab open; players can join from anywhere with internet.';
  }

  /* players and assignments */
  const list = $('playerList');
  list.innerHTML = '';
  const players = [...session.players.values()];
  if (!players.length) list.innerHTML = '<div class="empty-note">' + (info ? 'No one has joined yet. Share the code or link.' : 'Start a session to let players join.') + '</div>';
  for (const p of players) {
    const row = document.createElement('div');
    const isTurn = session.moveMode === 'turn' && session.turnPlayerId === p.playerId;
    row.className = 'player-row' + (isTurn ? ' turn' : '');
    row.innerHTML = `<div class="player-head"><span class="dot ${p.connected ? 'on' : 'off'}"></span><span class="pname">${escapeHtml(p.name)}</span>${isTurn ? `<span class="turn-badge">turn · ${(session.movementLeft ?? 0) * 5} ft left</span>` : ''}<span class="tdel" title="Remove player">&#10005;</span></div>
      <select class="assign"></select>`;
    const sel = row.querySelector('select')!;
    sel.innerHTML = pcOptions(p.mapId, p.tokenId);
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (!v) { session.assign(p.playerId, null, null); return; }
      const [mapId, tid] = v.split(':');
      session.assign(p.playerId, mapId, parseInt(tid, 10));
    });
    if (session.moveMode === 'turn') {
      const give = document.createElement('button');
      give.className = 'btn small' + (isTurn ? ' primary' : '');
      give.textContent = isTurn ? 'Has the turn' : 'Give turn';
      give.style.marginTop = '5px';
      give.disabled = p.tokenId === null;
      give.addEventListener('click', () => session.giveTurn(p.playerId));
      row.appendChild(give);
    }
    row.querySelector('.tdel')!.addEventListener('click', () => { if (confirm(`Remove ${p.name} from the session?`)) session.removePlayer(p.playerId); });
    list.appendChild(row);
  }

  /* movement */
  $<HTMLSelectElement>('moveMode').value = session.moveMode;
  $('turnControls').hidden = session.moveMode !== 'turn';
  $<HTMLInputElement>('movePerTurn').value = String(session.movementPerTurn * 5);
  const who = session.turnPlayerId ? session.players.get(session.turnPlayerId)?.name : null;
  $('turnStatus').textContent = session.moveMode !== 'turn' ? '' : who ? `${who}'s turn · ${(session.movementLeft ?? 0) * 5} ft left` : 'Nobody has the turn. Give it to a player or press Next turn.';

  /* events */
  const ev = $('eventList');
  ev.innerHTML = session.events.length ? session.events.map(e => `<div class="event-row">${escapeHtml(e)}</div>`).join('') : '<div class="empty-note">Nothing yet. Doors opened and treasure taken by players show here.</div>';

  /* exits */
  const exits = $('exitList');
  exits.innerHTML = '';
  const waiting = session.waitingAtExits();
  if (!waiting.length) exits.innerHTML = '<div class="empty-note">No characters are waiting at an exit.</div>';
  for (const w of waiting) {
    const row = document.createElement('div');
    row.className = 'exit-row';
    const whoAt = w.playerName ? ` (${escapeHtml(w.playerName)})` : '';
    const dest = w.to ? escapeHtml(w.to.name) : 'a missing map';
    row.innerHTML = `<div><b>${escapeHtml(w.tokenName)}</b>${whoAt}<div class="map-meta">${escapeHtml(w.mapName)} → ${dest}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary'; btn.textContent = 'Send through';
    btn.disabled = !w.to;
    btn.addEventListener('click', () => sendThrough(w.mapId, w.tokenId));
    row.appendChild(btn);
    exits.appendChild(row);
  }
}

/** Moves a PC through the exit it is standing on. Shared with the inspector. */
export function sendThrough(mapId: string, tokenId: number): void {
  const rec = mapById(mapId);
  if (!rec) return;
  const m = rec.id === state.mapId ? { ...rec, grid: state.grid, tokens: state.tokens } : rec;
  const t = m.tokens.find(t => t.id === tokenId);
  if (!t) return;
  const r = resolveExit(m, t.x, t.y);
  if (!r) { alert('This exit leads nowhere yet. Link it, or set a next map in the Maps tab.'); return; }
  const newId = transferToken(mapId, tokenId, r.map.id, r.x, r.y);
  if (newId === null) { alert('Could not send the token through. Check the exit link.'); return; }
  session.retarget(mapId, tokenId, r.map.id, newId);
  refreshDm();
}

/** A strip over the map whenever a character is waiting at an exit (issue #7). */
export function renderExitBanner(): void {
  const el = $('exitBanner');
  const waiting = session.waitingAtExits();
  el.innerHTML = '';
  el.hidden = waiting.length === 0;
  for (const w of waiting) {
    const row = document.createElement('div');
    row.className = 'exit-banner-row';
    const dest = w.to ? escapeHtml(w.to.name) : 'nowhere yet';
    row.innerHTML = `<span><b>${escapeHtml(w.tokenName)}</b>${w.playerName ? ' (' + escapeHtml(w.playerName) + ')' : ''} is at the exit${w.mapId !== state.mapId ? ' on ' + escapeHtml(w.mapName) : ''} → ${dest}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary'; btn.textContent = w.to ? 'Send through' : 'Set next map…';
    btn.addEventListener('click', () => {
      if (w.to) sendThrough(w.mapId, w.tokenId);
      else document.querySelector<HTMLElement>('.tab[data-panel=maps]')?.click();
    });
    row.appendChild(btn);
    el.appendChild(row);
  }
}

/** Redraws the DM's map and lists after something a player did. */
function refreshDm(): void {
  renderTokenList(); renderInspector(); requestRender(); setStatus(); renderSessionPanel(); renderExitBanner();
}

export function initSessionPanel(): void {
  void relayAvailable().then(lan => {
    $('sessionModeHint').textContent = lan
      ? 'This page is served by the LAN host, so the session will run through it. Players on the same Wi-Fi join with the code.'
      : 'This browser will host the session directly. Players join with the code from anywhere. Keep this tab open while playing.';
  });
  $('btnStartSession').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('btnStartSession');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting…';
    try { await session.start(); }
    catch (err) { console.error(err); alert('Could not start the session: ' + ((err as Error).message || err)); }
    finally { btn.disabled = false; btn.textContent = 'Start session'; }
    renderSessionPanel();
  });
  $('btnEndSession').addEventListener('click', () => {
    if (!confirm('End the session? Players will be disconnected.')) return;
    session.stop();
    renderSessionPanel();
  });
  $('btnCopyLink').addEventListener('click', async () => {
    const link = $<HTMLInputElement>('sessionLink');
    try { await navigator.clipboard.writeText(link.value); $('btnCopyLink').textContent = 'Copied'; setTimeout(() => { $('btnCopyLink').textContent = 'Copy link'; }, 1500); }
    catch { link.select(); }
  });

  $('moveMode').addEventListener('change', (e) => session.setMoveMode((e.target as HTMLSelectElement).value as MoveMode));
  $('movePerTurn').addEventListener('change', (e) => session.setMovementPerTurn(Math.round(parseInt((e.target as HTMLInputElement).value, 10) / 5) || 6));
  $('btnNextTurn').addEventListener('click', () => session.nextTurn());
  $('btnEndTurn').addEventListener('click', () => session.giveTurn(null));
  $('btnResetMove').addEventListener('click', () => session.resetMovement());

  // Player moves and turn changes redraw the DM side; the panel follows the map so
  // tokens placed after it was opened appear in the dropdowns.
  session.onUpdate(refreshDm);
  document.querySelector('.tab[data-panel=session]')!.addEventListener('click', renderSessionPanel);
  let pending: number | null = null;
  onChange(() => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      renderExitBanner();
      if (panelVisible() && !document.activeElement?.closest('#panel-session')) renderSessionPanel();
    }, 250);
  });
  renderSessionPanel();
  renderExitBanner();
}
