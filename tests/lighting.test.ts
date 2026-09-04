import { describe, expect, it } from 'vitest';
import type { Token } from '../src/engine/data';
import { cellAt, createGrid, type Grid } from '../src/engine/grid';
import {
  BRIGHT, DIM, DARK, SEEN_BRIGHT, SEEN_DARKVISION, SEEN_DIM, UNSEEN,
  collectLightSources, computeLightMap, computeScene, computeVision, markExplored, tokenVisibleToParty,
} from '../src/engine/lighting';

function token(partial: Partial<Token>): Token {
  return {
    id: 1, name: 'T', type: 'pc', x: 0, y: 0, color: '#fff', size: 1,
    vision: { radius: 12, darkvision: 0 }, light: null, ...partial,
  };
}
const at = (arr: Uint8Array, grid: Grid, x: number, y: number) => arr[y * grid.w + x];

/** A 1-cell-high corridor with walls above and below, open from x=1..w-2. */
function corridor(w: number): Grid {
  const g = createGrid(w, 3, 'stone');
  for (let x = 0; x < w; x++) { cellAt(g, x, 0)!.w = true; cellAt(g, x, 2)!.w = true; }
  cellAt(g, 0, 1)!.w = true; cellAt(g, w - 1, 1)!.w = true;
  return g;
}

describe('light map', () => {
  it('a torch prop gives bright then dim light, then darkness', () => {
    const g = corridor(24);
    cellAt(g, 11, 1)!.p = 'torch';
    const lm = computeLightMap(g, collectLightSources(g, []));
    const light = lm.level;
    expect(at(light, g, 11, 1)).toBe(BRIGHT);
    expect(at(light, g, 15, 1)).toBe(BRIGHT); // 4 away
    expect(at(light, g, 16, 1)).toBe(DIM);    // 5 away
    expect(at(light, g, 19, 1)).toBe(DIM);    // 8 away
    expect(at(light, g, 20, 1)).toBe(DARK);   // 9 away
    // intensity falls off smoothly through the dim band
    expect(at(lm.intensity as any, g, 15, 1)).toBe(1);
    expect(at(lm.intensity as any, g, 16, 1)).toBeGreaterThan(at(lm.intensity as any, g, 19, 1));
    expect(at(lm.intensity as any, g, 19, 1)).toBeGreaterThan(0);
    expect(at(lm.intensity as any, g, 20, 1)).toBe(0);
  });

  it('overlapping lights take the brightest', () => {
    const g = createGrid(20, 5, 'stone');
    const light = computeLightMap(g, [{ x: 2, y: 2, bright: 2, dim: 10 }, { x: 8, y: 2, bright: 3, dim: 4 }]).level;
    expect(at(light, g, 6, 2)).toBe(BRIGHT); // dim from first, bright from second
  });

  it('walls stop light', () => {
    const g = createGrid(10, 3, 'stone');
    cellAt(g, 5, 1)!.w = true;
    const light = computeLightMap(g, [{ x: 2, y: 1, bright: 8, dim: 8 }]).level;
    expect(at(light, g, 5, 1)).toBe(BRIGHT); // the wall face is lit
    expect(at(light, g, 6, 1)).toBe(DARK);
  });
});

describe('party vision (spec section 4)', () => {
  // Acceptance test 1
  it('a monster with darkvision in an unlit room is not seen by the party', () => {
    const g = createGrid(30, 30, 'stone');
    const pc = token({ id: 1, type: 'pc', x: 2, y: 2, vision: { radius: 12, darkvision: 0 } });
    const monster = token({ id: 2, type: 'monster', x: 20, y: 20, vision: { radius: 12, darkvision: 12 } });
    const scene = computeScene(g, [pc, monster]);
    expect(at(scene.party, g, 20, 20)).toBe(UNSEEN);
    expect(tokenVisibleToParty(monster, scene.party, g.w)).toBe(false);
    // but the DM's monster-vision overlay does show what it sees
    expect(at(scene.monsters, g, 20, 20)).toBe(SEEN_DARKVISION);
  });

  it('a monster is drawn once it stands in a cell the party sees', () => {
    const g = createGrid(30, 30, 'stone');
    const pc = token({ id: 1, type: 'pc', x: 2, y: 2, light: { bright: 4, dim: 8 } });
    const monster = token({ id: 2, type: 'monster', x: 5, y: 2, vision: { radius: 12, darkvision: 12 } });
    const scene = computeScene(g, [pc, monster]);
    expect(tokenVisibleToParty(monster, scene.party, g.w)).toBe(true);
  });

  it('hidden tokens are never drawn for players', () => {
    const g = createGrid(10, 10, 'stone');
    const pc = token({ id: 1, type: 'pc', x: 2, y: 2, light: { bright: 4, dim: 8 } });
    const secret = token({ id: 2, type: 'object', x: 3, y: 2, hidden: true });
    const scene = computeScene(g, [pc, secret]);
    expect(tokenVisibleToParty(secret, scene.party, g.w)).toBe(false);
  });

  // Acceptance test 2
  it('a PC with a torch in a corridor sees 1-4 bright, 5-8 dim, 9 not at all', () => {
    const g = corridor(40);
    const pc = token({ x: 20, y: 1, vision: { radius: 12, darkvision: 0 }, light: { bright: 4, dim: 8 } });
    const party = computeVision(g, [pc], computeLightMap(g, collectLightSources(g, [pc])).level);
    for (const dir of [1, -1]) {
      for (let d = 1; d <= 4; d++) expect(at(party, g, 20 + dir * d, 1), `bright at ${d}`).toBe(SEEN_BRIGHT);
      for (let d = 5; d <= 8; d++) expect(at(party, g, 20 + dir * d, 1), `dim at ${d}`).toBe(SEEN_DIM);
      expect(at(party, g, 20 + dir * 9, 1), 'unseen at 9').toBe(UNSEEN);
    }
  });

  it('vision radius caps how far lit cells are seen', () => {
    const g = corridor(40);
    cellAt(g, 30, 1)!.p = 'torch';
    const pc = token({ x: 20, y: 1, vision: { radius: 6, darkvision: 0 } });
    const scene = computeScene(g, [pc]);
    expect(at(scene.light, g, 26, 1)).toBe(BRIGHT);   // 4 from the torch
    expect(at(scene.party, g, 26, 1)).toBe(SEEN_BRIGHT); // 6 from the PC: in range
    expect(at(scene.light, g, 27, 1)).toBe(BRIGHT);
    expect(at(scene.party, g, 27, 1)).toBe(UNSEEN);      // 7 from the PC: out of range
  });

  // Acceptance test 5
  it('a drow with 24-cell darkvision in a black cave sees 24 cells of grey and nothing beyond', () => {
    const g = createGrid(60, 5, 'stone');
    const drow = token({ x: 30, y: 2, vision: { radius: 30, darkvision: 24 } });
    const scene = computeScene(g, [drow]);
    expect(at(scene.party, g, 54, 2)).toBe(SEEN_DARKVISION);
    expect(at(scene.party, g, 55, 2)).toBe(UNSEEN);
    expect(at(scene.party, g, 6, 2)).toBe(SEEN_DARKVISION);
    expect(at(scene.party, g, 5, 2)).toBe(UNSEEN);
  });

  it('darkvision shows dim light as seen-dim and bright as seen-bright', () => {
    const g = corridor(40);
    cellAt(g, 20, 1)!.p = 'torch';
    const pc = token({ x: 10, y: 1, vision: { radius: 12, darkvision: 12 } });
    const scene = computeScene(g, [pc]);
    expect(at(scene.party, g, 17, 1)).toBe(SEEN_BRIGHT); // 3 from torch
    expect(at(scene.party, g, 13, 1)).toBe(SEEN_DIM);    // 7 from torch
    expect(at(scene.party, g, 4, 1)).toBe(SEEN_DARKVISION);
  });

  it('NPCs and objects never contribute to party vision', () => {
    const g = createGrid(30, 5, 'stone');
    const pc = token({ id: 1, type: 'pc', x: 1, y: 2, vision: { radius: 2, darkvision: 2 } });
    const npc = token({ id: 2, type: 'npc', x: 20, y: 2, vision: { radius: 12, darkvision: 6 } });
    const obj = token({ id: 3, type: 'object', x: 10, y: 2, vision: { radius: 12, darkvision: 6 } });
    const party = computeScene(g, [pc, npc, obj]).party;
    expect(at(party, g, 22, 2)).toBe(UNSEEN);
    expect(at(party, g, 12, 2)).toBe(UNSEEN);
    expect(at(party, g, 2, 2)).toBe(SEEN_DARKVISION);
  });

  it('a secret door blocks sight like a wall until opened', () => {
    const g = corridor(30);
    cellAt(g, 10, 1)!.p = 'torch';
    const sd = cellAt(g, 14, 1)!;
    sd.d = true; sd.secret = true; sd.doOpen = false;
    const pc = token({ x: 12, y: 1 });
    expect(at(computeScene(g, [pc]).party, g, 15, 1)).toBe(UNSEEN);
    sd.doOpen = true;
    expect(at(computeScene(g, [pc]).party, g, 15, 1)).toBe(SEEN_DIM);
  });

  // Acceptance test 7
  it('opening a door extends light and sight through it; closing stops it', () => {
    const g = corridor(30);
    cellAt(g, 10, 1)!.p = 'torch';
    const door = cellAt(g, 14, 1)!;
    door.d = true; door.doOpen = false;
    const pc = token({ x: 12, y: 1, vision: { radius: 12, darkvision: 0 } });
    let scene = computeScene(g, [pc]);
    expect(at(scene.party, g, 14, 1)).toBe(SEEN_BRIGHT); // sees the closed door
    expect(at(scene.party, g, 15, 1)).toBe(UNSEEN);
    door.doOpen = true;
    scene = computeScene(g, [pc]);
    expect(at(scene.party, g, 15, 1)).toBe(SEEN_DIM);    // 5 from torch
    expect(at(scene.party, g, 16, 1)).toBe(SEEN_DIM);
  });
});

describe('touch range (issue #3)', () => {
  it('a PC with no light and no darkvision still sees the cells next to it', () => {
    const g = createGrid(11, 11, 'stone');
    const pc = token({ x: 5, y: 5, vision: { radius: 12, darkvision: 0 } });
    const scene = computeScene(g, [pc]);
    expect(at(scene.party, g, 5, 5)).toBe(SEEN_DARKVISION);
    expect(at(scene.party, g, 6, 5)).toBe(SEEN_DARKVISION);
    expect(at(scene.party, g, 4, 4)).toBe(SEEN_DARKVISION); // diagonal neighbour
    expect(at(scene.party, g, 7, 5)).toBe(UNSEEN);            // two away: still dark
  });

  it('touch range respects walls: you feel the wall, not what is behind it', () => {
    const g = createGrid(5, 3, 'stone');
    cellAt(g, 2, 1)!.w = true;
    const pc = token({ x: 1, y: 1, vision: { radius: 12, darkvision: 0 } });
    const scene = computeScene(g, [pc]);
    expect(at(scene.party, g, 2, 1)).toBe(SEEN_DARKVISION);
    expect(at(scene.party, g, 3, 1)).toBe(UNSEEN);
  });

  it('does not shrink real darkvision', () => {
    const g = createGrid(30, 3, 'stone');
    const pc = token({ x: 5, y: 1, vision: { radius: 30, darkvision: 12 } });
    expect(at(computeScene(g, [pc]).party, g, 17, 1)).toBe(SEEN_DARKVISION);
  });
});

describe('explored memory (spec acceptance test 6)', () => {
  it('computeScene never writes to the grid; markExplored is the only writer', () => {
    const g = createGrid(12, 12, 'stone');
    const pc = token({ x: 5, y: 5, light: { bright: 3, dim: 3 } });
    const before = JSON.stringify(g);
    const scene = computeScene(g, [pc]);
    computeScene(g, [pc]);
    expect(JSON.stringify(g)).toBe(before);

    const added = markExplored(g, scene.party);
    expect(added).toBeGreaterThan(20);
    expect(cellAt(g, 5, 5)!.mem).not.toBeNull();
    expect(cellAt(g, 11, 11)!.mem).toBeNull();
    // idempotent
    expect(markExplored(g, scene.party)).toBe(0);
  });

  it('memory is a snapshot: edits made out of sight are not reflected until seen again', () => {
    const g = createGrid(30, 3, 'stone');
    const pc = token({ x: 3, y: 1, light: { bright: 3, dim: 3 } });
    markExplored(g, computeScene(g, [pc]).party);
    const seenCell = cellAt(g, 6, 1)!;
    expect(seenCell.mem).toEqual({ t: 'stone', w: false, d: false, doOpen: false, p: null, secret: false, rot: 0 });

    // party walks away, DM builds a wall and drops a chest where they used to be
    pc.x = 25;
    markExplored(g, computeScene(g, [pc]).party);
    seenCell.w = true;
    cellAt(g, 5, 1)!.p = 'chest';
    markExplored(g, computeScene(g, [pc]).party);
    expect(seenCell.mem!.w).toBe(false);          // memory still shows floor
    expect(cellAt(g, 5, 1)!.mem!.p).toBeNull();   // and no chest

    // party comes back and looks again
    pc.x = 3;
    markExplored(g, computeScene(g, [pc]).party);
    expect(cellAt(g, 5, 1)!.mem!.p).toBe('chest');
    expect(seenCell.mem!.w).toBe(true);
  });
});

describe('fully lit maps (issue #26)', () => {
  it('every cell is bright and sight is limited only by walls', () => {
    const g = createGrid(40, 5, 'stone');
    cellAt(g, 30, 2)!.w = true;
    const pc = token({ x: 2, y: 2, vision: { radius: 3, darkvision: 0 } });
    const scene = computeScene(g, [pc], true);
    expect(at(scene.light, g, 39, 2)).toBe(BRIGHT);
    expect(at(scene.party, g, 25, 2)).toBe(SEEN_BRIGHT);   // far beyond a 3-cell vision radius
    expect(at(scene.party, g, 30, 2)).toBe(SEEN_BRIGHT);   // the wall itself
    expect(at(scene.party, g, 31, 2)).toBe(UNSEEN);        // behind it
    expect(computeScene(g, [pc], false).party[2 * 40 + 25]).toBe(UNSEEN); // unlit: too far and dark
  });
});

describe('doors on lit maps (issue #28)', () => {
  it('closed doors do not cast shadows in daylight, but walls and secret doors still do', () => {
    const g = corridor(30);
    const door = cellAt(g, 10, 1)!; door.d = true; door.doOpen = false;
    const secret = cellAt(g, 20, 1)!; secret.d = true; secret.secret = true;
    const pc = token({ x: 5, y: 1 });
    const lit = computeScene(g, [pc], true);
    expect(at(lit.party, g, 10, 1)).toBe(SEEN_BRIGHT);
    expect(at(lit.party, g, 15, 1)).toBe(SEEN_BRIGHT);   // beyond the closed door
    expect(at(lit.party, g, 20, 1)).toBe(SEEN_BRIGHT);   // the secret door reads as a wall
    expect(at(lit.party, g, 21, 1)).toBe(UNSEEN);        // nothing behind it
    // the same closed door still blocks on an unlit map
    const dark = computeScene(g, [{ ...pc, light: { bright: 8, dim: 12 } }], false);
    expect(at(dark.party, g, 11, 1)).toBe(UNSEEN);
  });
});
