/* The map grid: a row-major array of cells. Pure data, no DOM. */

/** What a cell looked like the last time the party saw it. */
export interface CellMemory {
  t: string;
  w: boolean;
  d: boolean;
  doOpen: boolean;
  p: string | null;
}

export interface Cell {
  t: string;                // terrain id
  w: boolean;               // wall
  d: boolean;               // door
  doOpen: boolean;          // door open
  p: string | null;         // prop id
  mem: CellMemory | null;   // fog memory: null = never seen by the party
}

export function rememberCell(c: Cell): void {
  c.mem = { t: c.t, w: c.w, d: c.d, doOpen: c.doOpen, p: c.p };
}

export interface Grid {
  w: number;
  h: number;
  cells: Cell[];
}

export function newCell(terrain: string = 'void'): Cell {
  return { t: terrain, w: false, d: false, doOpen: false, p: null, mem: null };
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
