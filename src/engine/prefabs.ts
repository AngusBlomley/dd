/* Prefab rooms the DM can stamp onto a map: taverns, homes, shops, a fishing
   dock, a shrine, a campsite. Each is an ASCII sketch with a legend. */

import type { Grid } from './grid';
import { cellAt } from './grid';

export interface Prefab {
  id: string;
  name: string;
  icon: string;
  rows: string[];
}

/*
  Legend (all prefabs):
    #  wall              .  floor (prefab's floor terrain)   ,  keep existing terrain
    +  door              =  secret door                      space  leave cell untouched
    T  table   B  bed    b  barrel   C  chest   c  crate     A  anvil/forge   K  cauldron
    S  bookshelf         L  lantern  t  torch   f  campfire  ^  tent   a  altar   n  candle
    ~  deep water        -  shallow water       o  boat      r  rope   W  well
    E  entry (arrival)   X  exit
*/
/* Floor terrain per prefab; prefabs without one (the campsite) keep the terrain they are placed on. */
const FLOOR: Record<string, string | undefined> = { tavern: 'wood', home: 'wood', shop: 'wood', dock: 'wood', shrine: 'tile', smithy: 'stone', inn: 'wood' };

const PROP_LEGEND: Record<string, string> = {
  T: 'table', B: 'bed', b: 'barrel', C: 'chest', c: 'crate', A: 'anvil', K: 'cauldron', S: 'bookshelf',
  L: 'lantern', t: 'torch', f: 'campfire', '^': 'tent', a: 'altar', n: 'candle', o: 'boat', r: 'rope', W: 'well',
  E: 'entry', X: 'exit',
};

export const PREFABS: Prefab[] = [
  { id: 'tavern', name: 'Tavern', icon: '\u{1F37A}', rows: [
    '#########',
    '#L.....L#',
    '#.T...T.#',
    '#.......#',
    '#.T...T.#',
    '#.......#',
    '#bbb..K.#',
    '####+####',
  ] },
  { id: 'home', name: 'Small home', icon: '\u{1F3E0}', rows: [
    '######',
    '#B..C#',
    '#....#',
    '#.T.n#',
    '###+##',
  ] },
  { id: 'shop', name: 'Shop', icon: '\u{1F6D2}', rows: [
    '########',
    '#cc...S#',
    '#......#',
    '#.TT..L#',
    '#......#',
    '###+####',
  ] },
  { id: 'smithy', name: 'Smithy', icon: '\u{2692}\u{FE0F}', rows: [
    '#######',
    '#A...b#',
    '#..T..#',
    '#t...c#',
    '###+###',
  ] },
  { id: 'dock', name: 'Fishing dock', icon: '\u{1F3A3}', rows: [
    ',,,.....,,,',
    ',,,..L..,,,',
    '---.....---',
    '~~~..o..~~~',
    '~~~..r..~~~',
    '~~~~~~~~~~~',
  ] },
  { id: 'shrine', name: 'Shrine', icon: '\u{26E9}\u{FE0F}', rows: [
    '#######',
    '#n.a.n#',
    '#.....#',
    '#.....#',
    '###+###',
  ] },
  { id: 'camp', name: 'Campsite', icon: '\u{1F3D5}\u{FE0F}', rows: [
    ',^,,,^,',
    ',,,f,,,',
    ',^,,,c,',
  ] },
  { id: 'inn', name: 'Inn (two rooms)', icon: '\u{1F6CF}\u{FE0F}', rows: [
    '###########',
    '#B.n#L....#',
    '#...+..T..#',
    '#C..#.....#',
    '###########',
  ] },
];
export const PREFAB_MAP: Record<string, Prefab> = Object.fromEntries(PREFABS.map(p => [p.id, p]));

/** The same prefab turned 90° clockwise `quarterTurns` times. */
export function rotatePrefab(p: Prefab, quarterTurns: number): Prefab {
  let rows = p.rows;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const padded = rows.map(r => r.padEnd(w, ' '));
    const out: string[] = [];
    for (let x = 0; x < w; x++) {
      let line = '';
      for (let y = h - 1; y >= 0; y--) line += padded[y][x];
      out.push(line);
    }
    rows = out;
  }
  return { ...p, rows };
}

export function prefabSize(p: Prefab): { w: number; h: number } {
  return { w: Math.max(...p.rows.map(r => r.length)), h: p.rows.length };
}

/**
 * Writes the prefab onto the grid with its top-left at (ox, oy). Cells off the
 * map are skipped. Returns how many cells changed.
 */
export function stampPrefab(grid: Grid, prefab: Prefab, ox: number, oy: number): number {
  const floor = FLOOR[prefab.id];
  const setFloor = (c: { t: string }) => { if (floor) c.t = floor; };
  let n = 0;
  for (let ry = 0; ry < prefab.rows.length; ry++) {
    const row = prefab.rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === ' ') continue;
      const c = cellAt(grid, ox + rx, oy + ry);
      if (!c) continue;
      c.w = false; c.d = false; c.secret = false; c.doOpen = false; c.p = null; c.link = null;
      switch (ch) {
        case '#': c.w = true; setFloor(c); break;
        case '.': setFloor(c); break;
        case ',': break;
        case '+': c.d = true; setFloor(c); break;
        case '=': c.d = true; c.secret = true; setFloor(c); break;
        case '~': c.t = 'water'; break;
        case '-': c.t = 'shallow'; break;
        default: {
          const p = PROP_LEGEND[ch];
          if (p) { c.p = p; if (ch === 'o' || ch === 'r') c.t = 'water'; else setFloor(c); }
        }
      }
      n++;
    }
  }
  return n;
}
