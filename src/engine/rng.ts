/* Seeded PRNG (mulberry32). Same seed string always yields the same sequence. */

export type Rng = () => number;

export function makeRng(seedStr?: string | null): Rng {
  let seed: number;
  if (seedStr === undefined || seedStr === null || seedStr === '') {
    seed = (Math.random() * 4294967296) >>> 0;
  } else {
    seed = 0;
    const s = String(seedStr);
    for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  }
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
