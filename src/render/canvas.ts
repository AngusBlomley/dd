/* Canvas 2D renderer. Reads state and the cached scene; never writes to either. */

import { PROP_MAP, TERRAIN_MAP } from '../engine/data';
import { cellAt, type CellMemory } from '../engine/grid';
import {
  BRIGHT, DIM, SEEN_DARKVISION, SEEN_DIM, UNSEEN, tokenVisibleToParty,
} from '../engine/lighting';
import { scene, state } from '../state';

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

/* Greyscale terrain colours for darkvision, precomputed once. */
const GREY: Record<string, string> = {};
for (const t of Object.values(TERRAIN_MAP)) {
  const r = parseInt(t.color.slice(1, 3), 16), g = parseInt(t.color.slice(3, 5), 16), b = parseInt(t.color.slice(5, 7), 16);
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  GREY[t.id] = `rgb(${l},${l},${Math.min(255, l + 6)})`;
}

const COLORS = {
  unseen: '#050403',
  wall: '#332a20',
  memoryOverlay: 'rgba(5,4,3,0.72)',
  dimOverlay: 'rgba(5,4,3,0.32)',
  darkvisionOverlay: 'rgba(70,76,92,0.42)',
  ovDark: 'rgba(0,0,0,0.55)',
  ovDim: 'rgba(0,0,0,0.25)',
  ovParty: 'rgba(79,138,121,0.38)',
  ovMonster: 'rgba(161,58,45,0.38)',
  ovBoth: 'rgba(200,140,60,0.45)',
};

function drawCell(x: number, y: number, cs: number, grey: boolean, from?: CellMemory): void {
  const c = from ?? cellAt(state.grid, x, y)!;
  const px = x * cs, py = y * cs;
  const terr = TERRAIN_MAP[c.t] || TERRAIN_MAP.void;
  ctx.fillStyle = grey ? GREY[terr.id] : terr.color;
  ctx.fillRect(px, py, cs, cs);
  if ((x + y) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.045)'; ctx.fillRect(px, py, cs, cs); }

  if (c.w) {
    ctx.fillStyle = COLORS.wall;
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
}

function overlay(x: number, y: number, cs: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * cs, y * cs, cs, cs);
}

export function render(): void {
  resizeCanvas();
  const cs = effCell();
  const grid = state.grid;
  const sc = scene();
  const playerSide = state.playerView || state.dmPreview;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      const px = x * cs, py = y * cs;

      if (playerSide) {
        const see = sc.party[i];
        if (see === UNSEEN) {
          const mem = grid.cells[i].mem;
          if (!mem) {
            ctx.fillStyle = COLORS.unseen;
            ctx.fillRect(px, py, cs, cs);
            continue;
          }
          // Memory shows the cell as it was last seen, not as it is now.
          drawCell(x, y, cs, false, mem);
          overlay(x, y, cs, COLORS.memoryOverlay);
        } else {
          drawCell(x, y, cs, see === SEEN_DARKVISION);
          if (see === SEEN_DIM) overlay(x, y, cs, COLORS.dimOverlay);
          else if (see === SEEN_DARKVISION) overlay(x, y, cs, COLORS.darkvisionOverlay);
        }
      } else {
        drawCell(x, y, cs, false);
        if (state.overlays.light) {
          if (sc.light[i] < DIM) overlay(x, y, cs, COLORS.ovDark);
          else if (sc.light[i] < BRIGHT) overlay(x, y, cs, COLORS.ovDim);
        }
        const p = state.overlays.party && sc.party[i] > UNSEEN;
        const m = state.overlays.monsters && sc.monsters[i] > UNSEEN;
        if (p && m) overlay(x, y, cs, COLORS.ovBoth);
        else if (p) overlay(x, y, cs, COLORS.ovParty);
        else if (m) overlay(x, y, cs, COLORS.ovMonster);
      }

      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
    }
  }

  for (const tok of state.tokens) {
    if (playerSide && !tokenVisibleToParty(tok, sc.party, grid.w)) continue;
    const cx = tok.x * cs + cs / 2, cy = tok.y * cs + cs / 2;
    const rad = Math.max(6, (cs / 2) * Math.min(tok.size, 1) * 0.86 + (tok.size > 1 ? cs * 0.14 * (tok.size - 1) : 0));
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = tok.color;
    ctx.fill();
    const selected = tok.id === state.selectedTokenId;
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#f4b94a' : 'rgba(0,0,0,.55)';
    if (tok.hidden && !playerSide) { ctx.setLineDash([3, 3]); ctx.strokeStyle = selected ? '#f4b94a' : '#e6d7ab'; }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold ' + Math.round(cs * 0.34) + 'px sans-serif';
    ctx.fillStyle = '#100d09';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const initials = (tok.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
    ctx.fillText(initials, cx, cy + 1);
    if (tok.light) {
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
