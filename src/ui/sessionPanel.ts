/* Session tab: start / end hosting, show the room code and join link,
   list players, assign tokens, and send characters through linked exits. */

import { mapById, transferToken } from '../campaign';
import { session } from '../net/host';
import { relayAvailable } from '../net/transport';
import { requestRender } from '../render/canvas';
import { state } from '../state';
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

  const list = $('playerList');
  list.innerHTML = '';
  const players = [...session.players.values()];
  if (!players.length) list.innerHTML = '<div class="empty-note">' + (info ? 'No one has joined yet. Share the code or link.' : 'Start a session to let players join.') + '</div>';
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<div class="player-head"><span class="dot ${p.connected ? 'on' : 'off'}"></span><span class="pname">${escapeHtml(p.name)}</span><span class="tdel" title="Remove player">&#10005;</span></div>
      <select class="assign"></select>`;
    const sel = row.querySelector('select')!;
    sel.innerHTML = pcOptions(p.mapId, p.tokenId);
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (!v) { session.assign(p.playerId, null, null); return; }
      const [mapId, tid] = v.split(':');
      session.assign(p.playerId, mapId, parseInt(tid, 10));
    });
    row.querySelector('.tdel')!.addEventListener('click', () => { if (confirm(`Remove ${p.name} from the session?`)) session.removePlayer(p.playerId); });
    list.appendChild(row);
  }

  const exits = $('exitList');
  exits.innerHTML = '';
  const waiting = session.waitingAtExits();
  if (!waiting.length) exits.innerHTML = '<div class="empty-note">No characters are waiting at an exit.</div>';
  for (const w of waiting) {
    const row = document.createElement('div');
    row.className = 'exit-row';
    const who = w.playerName ? ` (${escapeHtml(w.playerName)})` : '';
    const dest = w.to ? escapeHtml(w.to.name) : 'a missing map';
    row.innerHTML = `<div><b>${escapeHtml(w.tokenName)}</b>${who}<div class="map-meta">${escapeHtml(w.mapName)} → ${dest}</div></div>`;
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
  const m = mapById(mapId);
  const t = m?.tokens.find(t => t.id === tokenId);
  if (!m || !t) return;
  const cell = m.grid.cells[t.y * m.grid.w + t.x];
  if (!cell?.link) return;
  const newId = transferToken(mapId, tokenId, cell.link.mapId, cell.link.x, cell.link.y);
  if (newId === null) { alert('Could not send the token through. Check the exit link.'); return; }
  session.retarget(mapId, tokenId, cell.link.mapId, newId);
  renderTokenList(); renderInspector(); requestRender(); setStatus(); renderSessionPanel();
}

export function initSessionPanel(): void {
  void relayAvailable().then(lan => {
    $('sessionModeHint').textContent = lan
      ? 'This page is served by the LAN host, so the session will run through it. Players on the same Wi-Fi join with the code.'
      : 'This browser will host the session directly. Players join with the code from anywhere. Keep this tab open while playing.';
  });
  $('btnStartSession').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('btnStartSession');
    btn.disabled = true; btn.textContent = 'Starting…';
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
  session.onUpdate(renderSessionPanel);
  renderSessionPanel();
}
