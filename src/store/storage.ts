/* Campaign persistence in IndexedDB. One record per campaign, holding all its maps. */

import { del, get, keys, set } from 'idb-keyval';
import { parseCampaign, parseMap, serializeCampaign, type Campaign, type CampaignFile, type MapFile } from './json';

const CAMPAIGN_PREFIX = 'campaign:';
const LAST_KEY = 'lastCampaignId';
const LEGACY_MAP_PREFIX = 'maps:';

export interface CampaignSummary { id: string; name: string; updatedAt: number; mapCount: number }

export async function saveCampaign(c: Campaign): Promise<void> {
  await set(CAMPAIGN_PREFIX + c.id, JSON.stringify(serializeCampaign(c)));
}

export async function loadCampaign(id: string): Promise<Campaign | null> {
  const raw = await get<string>(CAMPAIGN_PREFIX + id);
  if (!raw) return null;
  return parseCampaign(JSON.parse(raw) as CampaignFile);
}

export async function deleteCampaign(id: string): Promise<void> {
  await del(CAMPAIGN_PREFIX + id);
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const all = await keys();
  const out: CampaignSummary[] = [];
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(CAMPAIGN_PREFIX)) continue;
    const raw = await get<string>(k);
    if (!raw) continue;
    try {
      const f = JSON.parse(raw) as CampaignFile;
      out.push({ id: f.campaign.id, name: f.campaign.name, updatedAt: f.campaign.updatedAt, mapCount: f.campaign.maps.length });
    } catch { /* skip unreadable record */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getLastCampaignId(): Promise<string | null> {
  return (await get<string>(LAST_KEY)) || null;
}
export async function setLastCampaignId(id: string): Promise<void> {
  await set(LAST_KEY, id);
}

/** Phase 0/1 saved single maps under "maps:<name>". Fold them into a campaign once. */
export async function importLegacyMaps(): Promise<Campaign | null> {
  const all = (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(LEGACY_MAP_PREFIX));
  if (all.length === 0) return null;
  const maps = [];
  for (const k of all) {
    const raw = await get<string>(k);
    if (!raw) continue;
    try { maps.push(parseMap(JSON.parse(raw) as MapFile, k.slice(LEGACY_MAP_PREFIX.length))); } catch { /* skip */ }
  }
  if (maps.length === 0) return null;
  const now = Date.now();
  const c: Campaign = { id: 'legacy-' + now.toString(36), name: 'Saved maps', createdAt: now, updatedAt: now, activeMapId: maps[0].id, maps };
  await saveCampaign(c);
  for (const k of all) await del(k);
  return c;
}
