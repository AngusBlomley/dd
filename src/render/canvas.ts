/* Canvas 2D renderer. Draws the whole grid every frame (fine at prototype sizes). */

import { PROP_MAP, TERRAIN_MAP } from '../engine/data';
import { cellAt } from '../engine/grid';
import { isSeenNow, type FogState } from '../engine/lighting';
import { sceneVisibility, state } from '../state';

export const canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

export function effCell(): number {
  return Math.round(state.baseCell * state.zoom);
}

function resizeCanvas(): void {
  const cs = effCell();
  canvas.width = state.grid.w * cs;
  canvas.height = state.grid.h * cs;
}

/** Fog state for a cell in the current view mode.
    TODO(B3): marks cells explored as a side effect of rendering, as prototype 1 did. */
function cellFogState(x: number, y: number): FogState {
  if (!state.playerView && !state.dmPreview) return 'visible';
  const cell = cellAt(state.grid, x, y)!;
  if (isSeenNow(sceneVisibility(), x, y)) { cell.ex = true; return 'visible'; }
  if (cell.ex) return 'memory';
  return 'hidden';
}

export function render(): void {
  resizeCanvas();
  const cs = effCell();
  const grid = state.grid;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = cellAt(grid, x, y)!;
      const fog = cellFogState(x, y);
      const px = x * cs, py = y * cs;

      if (fog === 'hidden') {
        ctx.fillStyle = '#050403';
        ctx.fillRect(px, py, cs, cs);
        continue;
      }

      const terr = TERRAIN_MAP[c.t] || TERRAIN_MAP.void;
      ctx.fillStyle = terr.color;
      ctx.fillRect(px, py, cs, cs);
      if ((x + y) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.045)'; ctx.fillRect(px, py, cs, cs); }

      if (c.w) {
        ctx.fillStyle = '#332a20';
        ctx.fillRect(px, py, cs, cs);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
        ctx.fillStyle = 'rgba(255,255,255,.04)';
        ctx.fillRect(px, py, cs, 3);
      }
      if (c.d) {
        ctx.fillStyle = c.doOpen ? '#4a3a24' : '#6b4a2c';
        ctx.fillRect(px + cs * 0.12, py + cs * 0.12, cs * 0.76, cs * 0.76);
        ctx.strokeStyle = '#2c1e10'; ctx.lineWidth = 2;
        ctx.strokeRect(px + cs * 0.12, py + cs * 0.12, cs * 0.76, cs * 0.76);
        if (!c.doOpen) {
          ctx.fillStyle = '#d8b25a';
          ctx.beginPath(); ctx.arc(px + cs * 0.78, py + cs * 0.5, Math.max(1.5, cs * 0.05), 0, 7); ctx.fill();
        }
      }
      if (c.p) {
        const pd = PROP_MAP[c.p];
        if (pd) {
          ctx.font = Math.round(cs * 0.62) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(pd.icon, px + cs / 2, py + cs * 0.56);
        }
      }
      if (fog === 'memory') {
        ctx.fillStyle = 'rgba(5,4,3,0.72)';
        ctx.fillRect(px, py, cs, cs);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
    }
  }

  for (const tok of state.tokens) {
    const fog = cellFogState(tok.x, tok.y);
    if ((state.playerView || state.dmPreview) && fog !== 'visible') continue;
    const cx = tok.x * cs + cs / 2, cy = tok.y * cs + cs / 2;
    const rad = Math.max(6, (cs / 2) * Math.min(tok.size, 1) * 0.86 + (tok.size > 1 ? cs * 0.14 * (tok.size - 1) : 0));
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = tok.color;
    ctx.fill();
    const selected = tok.id === state.selectedTokenId;
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#f4b94a' : 'rgba(0,0,0,.55)';
    ctx.stroke();
    ctx.font = 'bold ' + Math.round(cs * 0.34) + 'px sans-serif';
    ctx.fillStyle = '#100d09';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const initials = (tok.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
    ctx.fillText(initials, cx, cy + 1);
    if (tok.hasLight) {
      ctx.font = Math.round(cs * 0.32) + 'px sans-serif';
      ctx.fillText('\u{1F525}', cx + rad * 0.72, cy - rad * 0.72);
    }
  }
}

let renderQueued = false;
export function requestRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
