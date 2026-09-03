/* Seeded room-and-corridor dungeon generator. Returns a new Grid. */

import { makeRng } from './rng';
import { cellAt, createGrid, type Grid } from './grid';

export interface GeneratorOptions {
  w: number;
  h: number;
  theme: string;
  roomCount: number;
  roomMin: number;
  roomMax: number;
  pillarDensity: number;
  torchDensity: number;
  stairsUp: number;
  stairsDown: number;
  seed?: string;
}

interface Room { x: number; y: number; w: number; h: number }

export function generateDungeon(opts: GeneratorOptions): Grid {
  const { w, h } = opts;
  const grid = createGrid(w, h, 'void');
  const rng = makeRng(opts.seed);
  const themeFloor = ({ stone: 'stone', cave: 'cave', crypt: 'stone', wood: 'wood' } as Record<string, string>)[opts.theme] || 'stone';

  for (const c of grid.cells) c.w = true;

  const rooms: Room[] = [];
  let attempts = 0;
  while (rooms.length < opts.roomCount && attempts < opts.roomCount * 40) {
    attempts++;
    const rw = opts.roomMin + Math.floor(rng() * (opts.roomMax - opts.roomMin + 1));
    const rh = opts.roomMin + Math.floor(rng() * (opts.roomMax - opts.roomMin + 1));
    const rx = 1 + Math.floor(rng() * (w - rw - 2));
    const ry = 1 + Math.floor(rng() * (h - rh - 2));
    if (rx < 1 || ry < 1 || rx + rw >= w - 1 || ry + rh >= h - 1) continue;
    const candidate: Room = { x: rx, y: ry, w: rw, h: rh };
    let overlaps = false;
    for (const r of rooms) {
      if (candidate.x - 1 < r.x + r.w + 1 && candidate.x + candidate.w + 1 > r.x - 1 &&
          candidate.y - 1 < r.y + r.h + 1 && candidate.y + candidate.h + 1 > r.y - 1) { overlaps = true; break; }
    }
    if (overlaps) continue;
    rooms.push(candidate);
  }

  const carveFloor = (x: number, y: number) => {
    const c = cellAt(grid, x, y);
    if (!c) return;
    c.w = false; c.t = themeFloor;
  };
  const carveRect = (rx: number, ry: number, rw: number, rh: number) => {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) carveFloor(x, y);
  };
  rooms.forEach(r => carveRect(r.x, r.y, r.w, r.h));

  const carveCorridorH = (x0: number, x1: number, y: number) => {
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) carveFloor(x, y);
  };
  const carveCorridorV = (y0: number, y1: number, x: number) => {
    const a = Math.min(y0, y1), b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) carveFloor(x, y);
  };
  const link = (a: Room, b: Room) => {
    const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2);
    if (rng() < 0.5) { carveCorridorH(ax, bx, ay); carveCorridorV(ay, by, bx); }
    else { carveCorridorV(ay, by, ax); carveCorridorH(ax, bx, by); }
  };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);

  const extraLinks = Math.max(0, Math.floor(rooms.length / 4));
  for (let i = 0; i < extraLinks; i++) {
    const a = rooms[Math.floor(rng() * rooms.length)];
    const b = rooms[Math.floor(rng() * rooms.length)];
    if (a === b) continue;
    link(a, b);
  }

  // doors on room edges where a corridor meets the room
  rooms.forEach(r => {
    const edgeCells: [number, number][] = [];
    for (let x = r.x; x < r.x + r.w; x++) { edgeCells.push([x, r.y - 1]); edgeCells.push([x, r.y + r.h]); }
    for (let y = r.y; y < r.y + r.h; y++) { edgeCells.push([r.x - 1, y]); edgeCells.push([r.x + r.w, y]); }
    edgeCells.forEach(([ex, ey]) => {
      const c = cellAt(grid, ex, ey);
      if (c && !c.w && c.t !== 'void' && rng() < 0.35) { c.d = true; c.doOpen = false; c.w = false; }
    });
  });

  // pillars in large rooms
  rooms.forEach(r => {
    if (r.w * r.h < 20) return;
    for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) {
        if (rng() < opts.pillarDensity) {
          const c = cellAt(grid, x, y);
          if (c && !c.w) c.p = 'pillar';
        }
      }
    }
  });

  // torches scattered on floor
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = cellAt(grid, x, y);
      if (!c || c.w || c.p || c.t === 'void') continue;
      if (rng() < opts.torchDensity * 0.06) c.p = 'torch';
    }
  }

  const placeStairs = (propId: string, count: number) => {
    let placed = 0, tries = 0;
    while (placed < count && tries < 500 && rooms.length > 0) {
      tries++;
      const r = rooms[Math.floor(rng() * rooms.length)];
      const x = r.x + 1 + Math.floor(rng() * Math.max(1, r.w - 2));
      const y = r.y + 1 + Math.floor(rng() * Math.max(1, r.h - 2));
      const c = cellAt(grid, x, y);
      if (c && !c.w && !c.p) { c.p = propId; placed++; }
    }
  };
  placeStairs('stairs_up', opts.stairsUp);
  placeStairs('stairs_down', opts.stairsDown);

  return grid;
}
