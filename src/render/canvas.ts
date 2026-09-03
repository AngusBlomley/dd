/* Canvas 2D renderer. `paintMap` is view-agnostic: the DM view feeds it from
   state and the cached scene, the player app feeds it from a MapView. */

import { PROP_MAP, TERRAIN_MAP } from '../engine/data';
import { BRIGHT, DIM, SEEN_DARKVISION, SEEN_DIM, UNSEEN, tokenVisibleToParty } from '../engine/lighting';
import { mapById, resolveExit } from '../campaign';
import { PREFAB_MAP, prefabSize, rotatePrefab } from '../engine/prefabs';
import { scene, state, type Layers, type Overlays } from '../state';

export const canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

export function effCell(): number {
  return Math.round(state.baseCell * state.zoom);
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
  darkvisionOverlay: 'rgba(70,76,92,0.42)',
  ovDark: 'rgba(0,0,0,0.55)',
  ovParty: 'rgba(79,138,121,0.38)',
  ovMonster: 'rgba(161,58,45,0.38)',
  ovBoth: 'rgba(200,140,60,0.45)',
  ovMemory: 'rgba(221,155,52,0.22)',
};

export interface Look { t: string; w: boolean; d: boolean; doOpen: boolean; secret?: boolean; p: string | null }
export interface PaintToken { x: number; y: number; size: number; color: string; initials: string; light: boolean; hidden?: boolean; selected?: boolean; mine?: boolean; turn?: boolean; ghost?: boolean }

export interface PaintOptions {
  ctx: CanvasRenderingContext2D;
  cs: number;
  w: number;
  h: number;
  /** Live look of cell i, or null when the viewer has no current sight of it. */
  lookAt: (i: number) => Look | null;
  /** Remembered look of cell i when out of sight, or null when never seen. */
  memAt: (i: number) => Look | null;
  /** SeeLevel per cell on the player side; null in DM view. */
  see: ArrayLike<number> | null;
  /** Light falloff 0..1 per cell. */
  intensity: ArrayLike<number>;
  playerSide: boolean;
  layers: Layers;
  overlays?: { flags: Overlays; light: ArrayLike<number>; party: ArrayLike<number>; monsters: ArrayLike<number>; explored: (i: number) => boolean };
  tokens: PaintToken[];
  highlightCell?: { x: number; y: number } | null;
  /** DM view: a short label to draw under an exit, e.g. the map it leads to. */
  exitLabel?: (i: number) => string | null;
  /** Dashed outline of a prefab about to be stamped. */
  preview?: { x: number; y: number; w: number; h: number } | null;
  /** Where a dragged prop started (drawn as a faint dashed cell). */
  ghostCell?: { x: number; y: number; icon: string } | null;
  /** DM area selection, and where it is being dragged to. */
  selection?: { x0: number; y0: number; x1: number; y1: number } | null;
  selectionOffset?: { dx: number; dy: number } | null;
}

type Orient = 'h' | 'v';

function drawCell(c: CanvasRenderingContext2D, x: number, y: number, cs: number, grey: boolean, look: Look, playerSide: boolean, L: Layers, orient: Orient = 'h'): void {
  const px = x * cs, py = y * cs;
  const terr = TERRAIN_MAP[look.t] || TERRAIN_MAP.void;
  c.fillStyle = L.terrain ? (grey ? GREY[terr.id] : terr.color) : '#1a1613';
  c.fillRect(px, py, cs, cs);
  if (L.terrain && (x + y) % 2 === 0) { c.fillStyle = 'rgba(0,0,0,0.045)'; c.fillRect(px, py, cs, cs); }

  const showAsWall = look.w || (look.d && look.secret && playerSide);
  if (L.walls && showAsWall) {
    c.fillStyle = COLORS.wall;
    c.fillRect(px, py, cs, cs);
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1;
    c.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
    c.fillStyle = 'rgba(255,255,255,.04)';
    c.fillRect(px, py, cs, 3);
  } else if (L.walls && look.d) {
    // A door is a bar across the wall it sits in: horizontal when the wall runs left-right.
    const thick = cs * 0.3, len = cs * 0.84, off = (cs - len) / 2;
    const bar = (bx: number, by: number, bw: number, bh: number) => {
      c.fillStyle = '#6b4a2c'; c.fillRect(bx, by, bw, bh);
      c.strokeStyle = look.secret ? '#e6d7ab' : '#2c1e10'; c.lineWidth = 1.5;
      if (look.secret) c.setLineDash([3, 3]);
      c.strokeRect(bx, by, bw, bh); c.setLineDash([]);
    };
    if (!look.doOpen) {
      if (orient === 'h') bar(px + off, py + cs / 2 - thick / 2, len, thick);
      else bar(px + cs / 2 - thick / 2, py + off, thick, len);
      c.fillStyle = '#d8b25a';
      c.beginPath();
      if (orient === 'h') c.arc(px + cs * 0.72, py + cs / 2, Math.max(1.5, cs * 0.05), 0, 7);
      else c.arc(px + cs / 2, py + cs * 0.72, Math.max(1.5, cs * 0.05), 0, 7);
      c.fill();
    } else {
      // open: the leaf swung to one side, leaving the middle clear
      const stub = cs * 0.18;
      if (orient === 'h') { bar(px + off, py + cs / 2 - thick / 2, stub, thick); bar(px + off, py + cs * 0.1, thick * 0.7, cs * 0.42); bar(px + cs - off - stub, py + cs / 2 - thick / 2, stub, thick); }
      else { bar(px + cs / 2 - thick / 2, py + off, thick, stub); bar(px + cs * 0.1, py + off, cs * 0.42, thick * 0.7); bar(px + cs / 2 - thick / 2, py + cs - off - stub, thick, stub); }
    }
  }
  if (L.props && look.p) {
    const pd = PROP_MAP[look.p];
    if (pd) {
      if (pd.id === 'exit' || pd.id === 'entry') {
        c.fillStyle = pd.id === 'exit' ? 'rgba(221,155,52,0.35)' : 'rgba(79,138,121,0.35)';
        c.fillRect(px + 2, py + 2, cs - 4, cs - 4);
      }
      c.font = Math.round(cs * 0.62) + 'px sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#100d09';
      c.fillText(pd.icon, px + cs / 2, py + cs * 0.56);
    }
  }
}

function overlay(c: CanvasRenderingContext2D, x: number, y: number, cs: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(x * cs, y * cs, cs, cs);
}

/**
 * Sizes a canvas so it is drawn at the screen's real resolution (issue #23):
 * the backing store is cssW × dpr, the element stays cssW in CSS pixels, and
 * the context is scaled so all drawing stays in CSS pixel units.
 */
export function fitCanvasToScreen(cv: HTMLCanvasElement, c: CanvasRenderingContext2D, cssW: number, cssH: number): void {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
  if (cv.width !== bw) cv.width = bw;
  if (cv.height !== bh) cv.height = bh;
  if (cv.style.width !== cssW + 'px') cv.style.width = cssW + 'px';
  if (cv.style.height !== cssH + 'px') cv.style.height = cssH + 'px';
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function paintMap(o: PaintOptions): void {
  const { ctx: c, cs, w, h } = o;
  c.imageSmoothingEnabled = true;
  c.clearRect(0, 0, w * cs, h * cs);

  // which way a door's wall runs, from its neighbours (walls, or what the viewer remembers as walls)
  const wallish = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const j = y * w + x;
    const l = o.lookAt(j) ?? o.memAt(j);
    return !!l && (l.w || (!!l.d && !!l.secret && o.playerSide));
  };
  const orientAt = (x: number, y: number): Orient => {
    const lr = (wallish(x - 1, y) ? 1 : 0) + (wallish(x + 1, y) ? 1 : 0);
    const ud = (wallish(x, y - 1) ? 1 : 0) + (wallish(x, y + 1) ? 1 : 0);
    return ud > lr ? 'v' : 'h';
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const px = x * cs, py = y * cs;
      if (o.playerSide) {
        const see = o.see ? o.see[i] : UNSEEN;
        const look = see > UNSEEN ? o.lookAt(i) : null;
        if (!look) {
          const mem = o.memAt(i);
          if (!mem) { c.fillStyle = COLORS.unseen; c.fillRect(px, py, cs, cs); continue; }
          drawCell(c, x, y, cs, false, mem, true, o.layers, mem.d ? orientAt(x, y) : 'h');
          overlay(c, x, y, cs, COLORS.memoryOverlay);
        } else {
          drawCell(c, x, y, cs, see === SEEN_DARKVISION, look, true, o.layers, look.d ? orientAt(x, y) : 'h');
          if (see === SEEN_DIM) {
            const a = 0.18 + 0.42 * (1 - Math.min(1, o.intensity[i]));
            overlay(c, x, y, cs, `rgba(5,4,3,${a.toFixed(3)})`);
          } else if (see === SEEN_DARKVISION) overlay(c, x, y, cs, COLORS.darkvisionOverlay);
        }
      } else {
        const look = o.lookAt(i)!;
        drawCell(c, x, y, cs, false, look, false, o.layers, look.d ? orientAt(x, y) : 'h');
        const ov = o.overlays;
        if (ov) {
          if (ov.flags.light) {
            if (ov.light[i] < DIM) overlay(c, x, y, cs, COLORS.ovDark);
            else if (ov.light[i] < BRIGHT) overlay(c, x, y, cs, `rgba(0,0,0,${(0.1 + 0.35 * (1 - o.intensity[i])).toFixed(3)})`);
          }
          if (ov.flags.memory && ov.explored(i)) overlay(c, x, y, cs, COLORS.ovMemory);
          const p = ov.flags.party && ov.party[i] > UNSEEN;
          const m = ov.flags.monsters && ov.monsters[i] > UNSEEN;
          if (p && m) overlay(c, x, y, cs, COLORS.ovBoth);
          else if (p) overlay(c, x, y, cs, COLORS.ovParty);
          else if (m) overlay(c, x, y, cs, COLORS.ovMonster);
        }
      }
      if (o.layers.grid) {
        c.strokeStyle = 'rgba(0,0,0,.18)';
        c.lineWidth = 1;
        c.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      }
    }
  }

  if (o.exitLabel && o.layers.props && cs >= 16) {
    c.font = 'bold ' + Math.max(8, Math.round(cs * 0.28)) + 'px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (let i = 0; i < w * h; i++) {
      const label = o.exitLabel(i);
      if (!label) continue;
      const x = i % w, y = (i - x) / w;
      const text = label.length > 10 ? label.slice(0, 9) + '…' : label;
      const tw = c.measureText(text).width + 6;
      c.fillStyle = 'rgba(16,13,9,0.85)';
      c.fillRect(x * cs + cs / 2 - tw / 2, y * cs + cs - Math.round(cs * 0.34), tw, Math.round(cs * 0.32));
      c.fillStyle = '#f4b94a';
      c.fillText(text, x * cs + cs / 2, y * cs + cs - 2);
    }
  }

  if (o.highlightCell) {
    c.strokeStyle = '#f4b94a'; c.lineWidth = 3;
    c.strokeRect(o.highlightCell.x * cs + 2, o.highlightCell.y * cs + 2, cs - 4, cs - 4);
  }
  if (o.ghostCell) {
    c.save(); c.globalAlpha = 0.4;
    c.font = Math.round(cs * 0.62) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#100d09';
    c.fillText(o.ghostCell.icon, o.ghostCell.x * cs + cs / 2, o.ghostCell.y * cs + cs * 0.56);
    c.setLineDash([4, 3]); c.strokeStyle = '#e6d7ab'; c.lineWidth = 1.5;
    c.strokeRect(o.ghostCell.x * cs + 2, o.ghostCell.y * cs + 2, cs - 4, cs - 4);
    c.restore();
  }
  if (o.selection) {
    const s = o.selection;
    const sw = (s.x1 - s.x0 + 1) * cs, sh = (s.y1 - s.y0 + 1) * cs;
    c.fillStyle = 'rgba(79,138,121,0.22)';
    c.fillRect(s.x0 * cs, s.y0 * cs, sw, sh);
    c.strokeStyle = '#6fb98a'; c.lineWidth = 2; c.setLineDash([6, 4]);
    c.strokeRect(s.x0 * cs + 1, s.y0 * cs + 1, sw - 2, sh - 2);
    c.setLineDash([]);
    if (o.selectionOffset && (o.selectionOffset.dx || o.selectionOffset.dy)) {
      const ox = (s.x0 + o.selectionOffset.dx) * cs, oy = (s.y0 + o.selectionOffset.dy) * cs;
      c.fillStyle = 'rgba(244,185,74,0.18)';
      c.fillRect(ox, oy, sw, sh);
      c.strokeStyle = '#f4b94a'; c.lineWidth = 2; c.setLineDash([6, 4]);
      c.strokeRect(ox + 1, oy + 1, sw - 2, sh - 2);
      c.setLineDash([]);
    }
  }
  if (o.preview) {
    c.fillStyle = 'rgba(244,185,74,0.16)';
    c.fillRect(o.preview.x * cs, o.preview.y * cs, o.preview.w * cs, o.preview.h * cs);
    c.strokeStyle = '#f4b94a'; c.lineWidth = 2; c.setLineDash([6, 4]);
    c.strokeRect(o.preview.x * cs + 1, o.preview.y * cs + 1, o.preview.w * cs - 2, o.preview.h * cs - 2);
    c.setLineDash([]);
  }

  if (!o.layers.tokens && !o.playerSide) return;
  for (const tok of o.tokens) {
    const cx = tok.x * cs + cs / 2, cy = tok.y * cs + cs / 2;
    const rad = Math.max(6, (cs / 2) * Math.min(tok.size, 1) * 0.86 + (tok.size > 1 ? cs * 0.14 * (tok.size - 1) : 0));
    if (tok.ghost) {
      // where a dragged token started: faint copy with a dashed outline (issue #10)
      c.save(); c.globalAlpha = 0.35;
      c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fillStyle = tok.color; c.fill();
      c.globalAlpha = 0.8; c.setLineDash([4, 3]); c.strokeStyle = '#e6d7ab'; c.lineWidth = 1.5; c.stroke();
      c.restore();
      continue;
    }
    if (tok.mine) {
      c.beginPath(); c.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(244,185,74,0.9)'; c.lineWidth = 2; c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]);
    }
    if (tok.turn) {
      c.beginPath(); c.arc(cx, cy, rad + 7, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(244,185,74,0.95)'; c.lineWidth = 3; c.stroke();
    }
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fillStyle = tok.color;
    c.fill();
    c.lineWidth = tok.selected ? 3 : 1.5;
    c.strokeStyle = tok.selected ? '#f4b94a' : 'rgba(0,0,0,.55)';
    if (tok.hidden && !o.playerSide) { c.setLineDash([3, 3]); c.strokeStyle = tok.selected ? '#f4b94a' : '#e6d7ab'; }
    c.stroke();
    c.setLineDash([]);
    c.font = 'bold ' + Math.round(cs * 0.34) + 'px sans-serif';
    c.fillStyle = '#100d09';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(tok.initials, cx, cy + 1);
    if (tok.light) {
      c.font = Math.round(cs * 0.32) + 'px sans-serif';
      c.fillText('\u{1F525}', cx + rad * 0.72, cy - rad * 0.72);
    }
  }
}

export function initialsOf(name: string): string {
  return (name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/* ---------- DM view ---------- */

export function render(): void {
  const cs = effCell();
  const grid = state.grid;
  fitCanvasToScreen(canvas, ctx, grid.w * cs, grid.h * cs);
  const sc = scene();
  const playerSide = state.playerView || state.dmPreview;
  const cells = grid.cells;
  paintMap({
    ctx, cs, w: grid.w, h: grid.h,
    lookAt: (i) => cells[i],
    memAt: (i) => cells[i].mem,
    see: playerSide ? sc.party : null,
    intensity: sc.intensity,
    playerSide,
    layers: state.layers,
    overlays: playerSide ? undefined : { flags: state.overlays, light: sc.light, party: sc.party, monsters: sc.monsters, explored: (i) => !!cells[i].mem },
    tokens: state.tokens
      .filter(t => !playerSide || tokenVisibleToParty(t, sc.party, grid.w))
      .flatMap(t => {
        const pt = { x: t.x, y: t.y, size: t.size, color: t.color, initials: initialsOf(t.name), light: !!t.light, hidden: t.hidden, selected: t.id === state.selectedTokenId, turn: !playerSide && t.id === state.turnTokenId };
        if (!playerSide && state.dragFrom && t.id === state.selectedTokenId && (state.dragFrom.x !== t.x || state.dragFrom.y !== t.y)) {
          return [{ ...pt, x: state.dragFrom.x, y: state.dragFrom.y, ghost: true, selected: false, turn: false }, pt];
        }
        return [pt];
      }),
    highlightCell: playerSide ? null : state.selectedCell,
    preview: !playerSide && state.tool === 'prefab' && state.hoverCell
      ? { x: state.hoverCell.x, y: state.hoverCell.y, ...prefabSize(rotatePrefab(PREFAB_MAP[state.selectedPrefab], state.prefabTurns)) }
      : null,
    selection: playerSide ? null : (state.marquee ?? state.selection),
    selectionOffset: playerSide ? null : state.selectionOffset,
    ghostCell: !playerSide && state.dragFrom && state.selectedTokenId === null && state.selectedCell
      ? { x: state.dragFrom.x, y: state.dragFrom.y, icon: PROP_MAP[cells[state.selectedCell.y * grid.w + state.selectedCell.x].p ?? '']?.icon ?? '' }
      : null,
    exitLabel: playerSide ? undefined : (i) => {
      if (cells[i].p !== 'exit') return null;
      const rec = state.mapId ? mapById(state.mapId) : undefined;
      if (!rec) return null;
      const r = resolveExit({ ...rec, grid, tokens: state.tokens }, i % grid.w, Math.floor(i / grid.w));
      return r ? '→ ' + r.map.name : 'no link';
    },
  });
}

let renderQueued = false;
export function requestRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
