/* Named-map persistence in IndexedDB.
   Prototype 1 called a `window.storage` API that only exists inside the
   claude.ai sandbox (spec B6); this gives it a real backing store. */

import { del, get, keys, set } from 'idb-keyval';

const PREFIX = 'maps:';

export async function saveMap(name: string, json: string): Promise<void> {
  await set(PREFIX + name, json);
}

export async function loadMap(name: string): Promise<string | undefined> {
  return get<string>(PREFIX + name);
}

export async function deleteMap(name: string): Promise<void> {
  await del(PREFIX + name);
}

export async function listMaps(): Promise<string[]> {
  const all = await keys();
  return all
    .filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
    .map(k => k.slice(PREFIX.length))
    .sort();
}
