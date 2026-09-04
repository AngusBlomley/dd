/* The map grid: a row-major array of cells. Pure data, no DOM. */

/** What a cell looked like the last time the party saw it. */
export interface CellMemory {
  t: string;
  w: boolean;
  d: boolean;
  doOpen: boolean;
  p: string | null;
  secret: boolean;
  rot: number;
}

/** Where an exit prop leads: a cell on another (or the same) map. */
export interface MapLink { mapId: string; x: number; y: number }

/** DM-written description for a chest or treasure, and whether players may take it. */
export interface Loot { title: string; text: string; pickup: boolean }

export interface Cell {
  t: string;                // terrain id
  w: boolean;               // wall
  d: boolean;               // door
  doOpen: boolean;          // door open
  secret: boolean;          // secret door: looks like a wall to players until revealed
  p: string | null;         // prop id
  link?: MapLink | null;    // for p === 'exit': where it leads
  loot?: Loot | null;       // for chests and treasure: what it is
  rot?: number;             // props: quarter turns clockwise; doors: 0 auto, 1 across, 2 up-down
  mem: CellMemory | null;   // fog memory: null = never seen by the party
}

export interface Grid {
  w: number;
  h: number;
  cells: Cell[];
}

export function newCell(terrain: string = 'void'): Cell {
  return { t: terrain, w: false, d: false, doOpen: false, secret: false, p: null, mem: null };
}

export function rememberCell(c: Cell): void {
  c.mem = { t: c.t, w: c.w, d: c.d, doOpen: c.doOpen, p: c.p, secret: c.secret, rot: c.rot ?? 0 };
}

export function createGrid(w: number, h: number, fillTerrain: string = 'void'): Grid {
  const cells: Cell[] = new Array(w * h);
  for (let i = 0; i < w * h; i++) cells[i] = newCell(fillTerrain);
  return { w, h, cells };
}

export function idx(grid: Grid, x: number, y: number): number {
  return y * grid.w + x;
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.w && y < grid.h;
}

export function cellAt(grid: Grid, x: number, y: number): Cell | null {
  return inBounds(grid, x, y) ? grid.cells[idx(grid, x, y)] : null;
}

/** Keeps the top-left area of the old grid, clips or extends the rest with void. */
export function resizeGrid(grid: Grid, w: number, h: number): Grid {
  const cells: Cell[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cells[y * w + x] = (x < grid.w && y < grid.h) ? grid.cells[y * grid.w + x] : newCell('void');
    }
  }
  return { w, h, cells };
}

export function cloneGrid(grid: Grid): Grid {
  return JSON.parse(JSON.stringify(grid));
}
