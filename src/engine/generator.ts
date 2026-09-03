/* Seeded map generators. Both return a new Grid.
   - rooms-and-corridors dungeon (stone / crypt / keep)
   - cellular-automata cave (organic caverns) */

import { makeRng, type Rng } from './rng';
import { cellAt, createGrid, type Grid } from './grid';

export interface GeneratorOptions {
  w: number;
  h: number;
  theme: 'stone' | 'crypt' | 'wood' | 'cave' | 'underdark';
  roomCount: number;
  roomMin: number;
  roomMax: number;
  pillarDensity: number;  // dungeon: pillars in big rooms; cave: stalagmites / mushrooms
  torchDensity: number;   // dungeon: torches; cave: glowing fungi and crystals
  stairsUp: number;
  stairsDown: number;
  seed?: string;
}

interface Room { x: number; y: number; w: number; h: number }

export function generateDungeon(opts: GeneratorOptions): Grid {
  if (opts.theme === 'cave' || opts.theme === 'underdark') return generateCave(opts);
  return generateRooms(opts);
}

/* ------------------------------------------------------------------ rooms */

function generateRooms(opts: GeneratorOptions): Grid {
  const { w, h } = opts;
  const grid = createGrid(w, h, 'void');
  const rng = makeRng(opts.seed);
  const themeFloor = ({ stone: 'stone', crypt: 'tile', wood: 'wood' } as Record<string, string>)[opts.theme] || 'stone';

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

  // crypt dressing
  if (opts.theme === 'crypt') {
    rooms.forEach(r => {
      if (rng() < 0.3) { const c = cellAt(grid, r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)); if (c && !c.p) c.p = 'altar'; }
      if (rng() < 0.5) { const c = cellAt(grid, r.x, r.y); if (c && !c.p) c.p = 'bones'; }
    });
  }

  placeStairsInRooms(grid, rooms, rng, 'stairs_up', opts.stairsUp);
  placeStairsInRooms(grid, rooms, rng, 'stairs_down', opts.stairsDown);
  placeEntry(grid, rooms.length ? rooms[0] : null, rng);
  return grid;
}

/** One arrival point per generated map, in the first room or on any open floor. */
function placeEntry(grid: Grid, room: Room | null, rng: Rng): void {
  const tryCell = (x: number, y: number) => {
    const c = cellAt(grid, x, y);
    if (c && !c.w && !c.d && !c.p && c.t !== 'void') { c.p = 'entry'; return true; }
    return false;
  };
  if (room) {
    if (tryCell(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))) return;
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (tryCell(x, y)) return;
  }
  const open: number[] = [];
  for (let i = 0; i < grid.cells.length; i++) { const c = grid.cells[i]; if (!c.w && !c.d && !c.p && c.t !== 'void') open.push(i); }
  if (!open.length) return;
  const i = open[Math.floor(rng() * open.length)];
  tryCell(i % grid.w, Math.floor(i / grid.w));
}

function placeStairsInRooms(grid: Grid, rooms: Room[], rng: Rng, propId: string, count: number): void {
  let placed = 0, tries = 0;
  while (placed < count && tries < 500 && rooms.length > 0) {
    tries++;
    const r = rooms[Math.floor(rng() * rooms.length)];
    const x = r.x + 1 + Math.floor(rng() * Math.max(1, r.w - 2));
    const y = r.y + 1 + Math.floor(rng() * Math.max(1, r.h - 2));
    const c = cellAt(grid, x, y);
    if (c && !c.w && !c.p) { c.p = propId; placed++; }
  }
}

/* ------------------------------------------------------------------ caves */

/**
 * Cellular automata cave: random fill, smooth with the 4-5 rule, keep only the
 * largest connected cavern so every floor cell is reachable, then dress it.
 */
export function generateCave(opts: GeneratorOptions): Grid {
  const { w, h } = opts;
  const grid = createGrid(w, h, 'cave');
  const rng = makeRng(opts.seed);
  const underdark = opts.theme === 'underdark';

  // Room count doubles as openness: more "rooms" = more open cave.
  const fill = Math.min(0.55, Math.max(0.36, 0.55 - opts.roomCount * 0.008));
  let wall = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    wall[y * w + x] = (x === 0 || y === 0 || x === w - 1 || y === h - 1 || rng() < fill) ? 1 : 0;
  }
  const neighbours = (src: Uint8Array, x: number, y: number) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) n++;
      else n += src[ny * w + nx];
    }
    return n;
  };
  for (let it = 0; it < 5; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = neighbours(wall, x, y);
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      next[y * w + x] = (border || n >= 5 || (it < 3 && n <= 1)) ? 1 : 0;
    }
    wall = next;
  }

  // keep the largest connected floor region
  const region = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (wall[i] || region[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    region[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      const cx = cur % w, cy = (cur - cx) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (wall[ni] || region[ni] >= 0) continue;
        region[ni] = id; stack.push(ni);
      }
    }
    sizes.push(size);
  }
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let i = 0; i < w * h; i++) if (!wall[i] && region[i] !== best) wall[i] = 1;

  const floorCells: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const c = grid.cells[i];
    if (wall[i]) { c.w = true; c.t = 'void'; }
    else { c.t = 'cave'; floorCells.push(i); }
  }

  // terrain variety on the floor
  const paintBlob = (terrain: string, count: number, size: number) => {
    for (let k = 0; k < count; k++) {
      if (!floorCells.length) return;
      const start = floorCells[Math.floor(rng() * floorCells.length)];
      const sx = start % w, sy = (start - sx) / w;
      for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dy * dy > size * size + rng() * size) continue;
        const c = cellAt(grid, sx + dx, sy + dy);
        if (c && !c.w) c.t = terrain;
      }
    }
  };
  const area = floorCells.length;
  paintBlob('rough', Math.round(area / 90), 2);
  paintBlob('mud', Math.round(area / 260), 1);
  if (underdark) {
    paintBlob('fungus', Math.round(area / 120), 2);
    paintBlob('moss', Math.round(area / 200), 1);
    paintBlob('faerzress', Math.round(area / 400), 2);
    paintBlob('shallow', Math.round(area / 300), 2);
  } else {
    paintBlob('shallow', Math.round(area / 250), 2);
    paintBlob('moss', Math.round(area / 300), 1);
  }

  // props: stalagmites and mushrooms (pillarDensity), glowing things (torchDensity)
  const passable = new Uint8Array(w * h);
  for (const i of floorCells) passable[i] = 1;
  const openFloor = (i: number) => {
    const x = i % w, y = (i - x) / w;
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && passable[ny * w + nx]) open++;
    }
    return open;
  };
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  /** True if every passable cell stays reachable when cell `blocked` becomes impassable. */
  const staysConnected = (blocked: number): boolean => {
    const total = floorCells.reduce((n, i) => n + passable[i], 0) - 1;
    passable[blocked] = 0;
    reach.fill(0);
    stack.length = 0;
    const bx = blocked % w, by = (blocked - bx) / w;
    let start = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = (by + dy) * w + bx + dx;
      if (passable[ni]) { start = ni; break; }
    }
    let count = 0;
    if (start >= 0) {
      reach[start] = 1; stack.push(start);
      while (stack.length) {
        const cur = stack.pop()!; count++;
        const cx = cur % w, cy = (cur - cx) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (cy + dy) * w + cx + dx;
          if (passable[ni] && !reach[ni]) { reach[ni] = 1; stack.push(ni); }
        }
      }
    }
    if (count === total) return true;
    passable[blocked] = 1;
    return false;
  };
  for (const i of floorCells) {
    const c = grid.cells[i];
    if (c.p) continue;
    const r = rng();
    if (r < opts.pillarDensity * 0.05) {
      // blockers only where they leave the cavern fully connected
      if (openFloor(i) >= 3 && staysConnected(i)) {
        c.p = underdark ? (rng() < 0.5 ? 'bigshroom' : 'stalagmite') : (rng() < 0.7 ? 'stalagmite' : 'boulder');
      }
    } else if (r < opts.pillarDensity * 0.05 + opts.torchDensity * 0.03) {
      c.p = underdark ? (rng() < 0.6 ? 'glowshroom' : 'glowcrystal') : (rng() < 0.5 ? 'glowshroom' : 'crystals');
    } else if (r < opts.pillarDensity * 0.05 + opts.torchDensity * 0.03 + 0.012) {
      c.p = (['rubble', 'bones', 'web', 'shroom', 'crystals'] as const)[Math.floor(rng() * 5)];
    }
  }

  // stairs anywhere on open floor
  const placeStairs = (propId: string, count: number) => {
    let placed = 0, tries = 0;
    while (placed < count && tries < 500 && floorCells.length) {
      tries++;
      const i = floorCells[Math.floor(rng() * floorCells.length)];
      const c = grid.cells[i];
      if (!c.p && openFloor(i) >= 2) { c.p = propId; placed++; }
    }
  };
  placeStairs('stairs_up', opts.stairsUp);
  placeStairs('stairs_down', opts.stairsDown);
  // arrival point: the most open floor cell nearest the left edge
  let entryAt = -1, entryScore = -1;
  for (const i of floorCells) {
    if (grid.cells[i].p) continue;
    const x = i % w;
    const score = openFloor(i) * 100 - x;
    if (score > entryScore) { entryScore = score; entryAt = i; }
  }
  if (entryAt >= 0) grid.cells[entryAt].p = 'entry';
  else placeEntry(grid, null, rng);
  return grid;
}
