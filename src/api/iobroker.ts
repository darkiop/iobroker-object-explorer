import type { IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, HistoryOptions } from '../types/iobroker';

const BASE_URL = '/api/v1';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function compilePattern(pattern: string): RegExp {
  return new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
}

export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*');
}

function getNameString(name: string | Record<string, string> | undefined): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return Object.values(name).join(' ');
}

function scoreObject(id: string, obj: IoBrokerObject, query: string): number {
  const q = query.toLowerCase();
  const idLow = id.toLowerCase();
  if (idLow === q) return 100;
  if (idLow.startsWith(q)) return 80;
  if (idLow.includes(q)) return 60;
  const name = getNameString(obj.common?.name).toLowerCase();
  if (name && name.includes(q)) return 50;
  const aliasId = (obj.common?.alias?.id ?? '').toLowerCase();
  if (aliasId && aliasId.includes(q)) return 40;
  const desc = (typeof obj.common?.desc === 'string' ? obj.common.desc : '').toLowerCase();
  if (desc && desc.includes(q)) return 30;
  return 0;
}

// Objects: einmalig laden und cachen (Baum-Struktur + Metadaten)
let objectsCache: Record<string, IoBrokerObject> | null = null;
let objectsCachePromise: Promise<Record<string, IoBrokerObject>> | null = null;

export async function getAllObjects(): Promise<Record<string, IoBrokerObject>> {
  if (objectsCache) return objectsCache;
  if (objectsCachePromise) return objectsCachePromise;

  objectsCachePromise = Promise.all([
    fetchApi<Record<string, IoBrokerObject>>('/objects'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=device'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=channel'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=folder'),
  ]).then(([states, devices, channels, folders]) => {
    objectsCache = { ...states, ...devices, ...channels, ...folders };
    objectsCachePromise = null;
    return objectsCache;
  });

  return objectsCachePromise;
}

export async function getObjectsByPattern(pattern: string, fulltext = true): Promise<Record<string, IoBrokerObject>> {
  const all = await getAllObjects();

  if (isGlobPattern(pattern)) {
    const result: Record<string, IoBrokerObject> = {};
    const regex = compilePattern(pattern);
    for (const [id, obj] of Object.entries(all)) {
      if (obj && obj.type === 'state' && regex.test(id)) {
        result[id] = obj;
      }
    }
    return result;
  }

  if (!fulltext) {
    // Nur ID-Substring-Suche ohne Relevanz-Ranking
    const q = pattern.toLowerCase();
    const result: Record<string, IoBrokerObject> = {};
    for (const [id, obj] of Object.entries(all)) {
      if (obj && obj.type === 'state' && id.toLowerCase().includes(q)) {
        result[id] = obj;
      }
    }
    return result;
  }

  // Volltext-Suche: ID, Name, Beschreibung, Alias-Ziel
  const scored: Array<[string, IoBrokerObject, number]> = [];
  for (const [id, obj] of Object.entries(all)) {
    if (!obj || obj.type !== 'state') continue;
    const score = scoreObject(id, obj, pattern);
    if (score > 0) scored.push([id, obj, score]);
  }
  scored.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));

  const result: Record<string, IoBrokerObject> = {};
  for (const [id, obj] of scored) result[id] = obj;
  return result;
}

// States: immer einzeln laden, nie bulk
export async function getState(id: string): Promise<IoBrokerState> {
  return fetchApi<IoBrokerState>(`/state/${encodeURIComponent(id)}`);
}

// Batch: mehrere States parallel laden (in konfigurierbaren Gruppen)
export async function getStatesBatch(ids: string[], batchSize = 50): Promise<Record<string, IoBrokerState>> {
  const BATCH_SIZE = batchSize;
  const record: Record<string, IoBrokerState> = {};
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const state = await getState(id);
          return [id, state] as const;
        } catch {
          return [id, null] as const;
        }
      })
    );
    for (const [id, state] of results) {
      if (state) record[id] = state;
    }
  }
  return record;
}

export async function getHistory(id: string, options: HistoryOptions): Promise<HistoryEntry[]> {
  const data = await sendToSql('getHistory', {
    id,
    options: {
      start: options.start,
      end: options.end,
      count: options.count ?? 500,
      aggregate: options.aggregate ?? 'none',
    },
  });
  const entries: HistoryEntry[] = Array.isArray(data) ? data : (data as { result?: HistoryEntry[] })?.result ?? [];
  return entries.filter((e) => e.ts >= options.start && e.ts <= options.end);
}

async function sendToSql(command: string, message: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/command/sendTo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adapterInstance: 'sql.0', command, message }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function deleteHistoryEntry(id: string, ts: number): Promise<void> {
  await sendToSql('delete', [{ id, state: { ts } }]);
}

export async function deleteHistoryRange(id: string, start: number, end: number): Promise<void> {
  await sendToSql('deleteRange', [{ id, start, end }]);
}

export async function deleteHistoryAll(id: string): Promise<void> {
  await sendToSql('deleteAll', [{ id }]);
}

export async function getAllUnits(): Promise<string[]> {
  const all = await getAllObjects();
  const units = new Set<string>();
  for (const obj of Object.values(all)) {
    if (obj.common?.unit) units.add(obj.common.unit);
  }
  return [...units].sort();
}

export async function getAllRoles(): Promise<string[]> {
  const all = await getAllObjects();
  const roles = new Set<string>();
  for (const obj of Object.values(all)) {
    if (obj.common?.role) roles.add(obj.common.role);
  }
  return [...roles].sort();
}

export async function getRoomMap(): Promise<Record<string, string>> {
  const all = await getAllObjects();
  const map: Record<string, string> = {};
  for (const [id, obj] of Object.entries(all)) {
    if (!obj.enums) continue;
    for (const [enumId, enumName] of Object.entries(obj.enums)) {
      if (enumId.startsWith('enum.rooms.')) {
        const raw = enumName as unknown;
        let name: string;
        if (typeof raw === 'string') {
          name = raw;
        } else if (raw && typeof raw === 'object') {
          const langs = raw as Record<string, string>;
          name = langs.de || langs.en || Object.values(langs)[0] || '';
        } else {
          name = '';
        }
        map[id] = name;
        break;
      }
    }
  }
  return map;
}

/**
 * Builds a reverse alias map: for each non-alias data point, lists which alias.0.* IDs point to it.
 * alias.0.xxx { common.alias.id: 'source.id' }  →  map.get('source.id') === ['alias.0.xxx']
 */
export function buildAliasReverseMap(allObjects: Record<string, IoBrokerObject>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [id, obj] of Object.entries(allObjects)) {
    if (!id.startsWith('alias.0.')) continue;
    const targetId = obj.common?.alias?.id ?? obj.common?.alias?.read;
    if (!targetId) continue;
    if (!map.has(targetId)) map.set(targetId, []);
    map.get(targetId)!.push(id);
  }
  return map;
}

export function hasHistory(obj: IoBrokerObject): boolean {
  return obj.common?.custom?.['sql.0']?.enabled === true;
}

export function hasSmartName(obj: IoBrokerObject): boolean {
  const sn = obj.common?.smartName;
  if (!sn) return false;
  if (typeof sn === 'string') return sn.trim().length > 0;
  if (typeof sn === 'object') return Object.values(sn).some((v) => v && String(v).trim().length > 0);
  return false;
}

export async function createObject(id: string, common: Partial<IoBrokerObjectCommon>): Promise<void> {
  const res = await fetch(`${BASE_URL}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'state', common, native: {} }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  objectsCache = null;
}

export async function deleteObject(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/object/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  objectsCache = null;
}

export async function putFullObject(id: string, obj: IoBrokerObject): Promise<void> {
  const res = await fetch(`${BASE_URL}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  objectsCache = null;
}

export async function extendObject(id: string, obj: { common: Partial<IoBrokerObject['common']> }): Promise<void> {
  const res = await fetch(`${BASE_URL}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  // Invalidate objects cache since we changed an object
  objectsCache = null;
}

export async function getObject(id: string): Promise<IoBrokerObject> {
  const all = await getAllObjects();
  if (all[id]) return all[id];
  return fetchApi<IoBrokerObject>(`/object/${encodeURIComponent(id)}`);
}

export async function getFunctionMap(): Promise<Record<string, string>> {
  const all = await getAllObjects();
  const map: Record<string, string> = {};
  for (const [id, obj] of Object.entries(all)) {
    if (!obj.enums) continue;
    for (const [enumId, enumName] of Object.entries(obj.enums)) {
      if (enumId.startsWith('enum.functions.')) {
        const raw = enumName as unknown;
        let name: string;
        if (typeof raw === 'string') {
          name = raw;
        } else if (raw && typeof raw === 'object') {
          const langs = raw as Record<string, string>;
          name = langs.de || langs.en || Object.values(langs)[0] || '';
        } else {
          name = '';
        }
        map[id] = name;
        break;
      }
    }
  }
  return map;
}

export async function getFunctionEnums(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');
  const fns: Array<{ id: string; name: string }> = [];
  for (const [id, obj] of Object.entries(res)) {
    if (!id.startsWith('enum.functions.')) continue;
    const raw = obj.common?.name;
    let name = '';
    if (typeof raw === 'string') name = raw;
    else if (raw && typeof raw === 'object') {
      const langs = raw as Record<string, string>;
      name = langs.de || langs.en || Object.values(langs)[0] || id;
    }
    fns.push({ id, name });
  }
  return fns.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateFunctionMembership(objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null): Promise<void> {
  if (oldFnEnumId === newFnEnumId) return;
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');

  if (oldFnEnumId && res[oldFnEnumId]) {
    const obj = res[oldFnEnumId];
    const members = (obj.common?.members ?? []).filter((m) => m !== objectId);
    await putFullObject(oldFnEnumId, { ...obj, common: { ...obj.common, members } });
  }
  if (newFnEnumId && res[newFnEnumId]) {
    const obj = res[newFnEnumId];
    const members = [...new Set([...(obj.common?.members ?? []), objectId])];
    await putFullObject(newFnEnumId, { ...obj, common: { ...obj.common, members } });
  }
  objectsCache = null;
}

export async function updateFunctionMembershipBatch(objectIds: string[], newFnEnumId: string | null): Promise<void> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');
  const objectIdSet = new Set(objectIds);

  // Remove selected IDs from all function enums they currently belong to
  for (const [enumId, enumObj] of Object.entries(res)) {
    if (!enumId.startsWith('enum.functions.') || enumId === newFnEnumId) continue;
    const currentMembers = enumObj.common?.members ?? [];
    if (currentMembers.some((m) => objectIdSet.has(m))) {
      const members = currentMembers.filter((m) => !objectIdSet.has(m));
      await putFullObject(enumId, { ...enumObj, common: { ...enumObj.common, members } });
    }
  }

  // Add all to the new function enum in one write
  if (newFnEnumId && res[newFnEnumId]) {
    const obj = res[newFnEnumId];
    const members = [...new Set([...(obj.common?.members ?? []), ...objectIds])];
    await putFullObject(newFnEnumId, { ...obj, common: { ...obj.common, members } });
  }
  objectsCache = null;
}

export async function getRoomEnums(): Promise<Array<{ id: string; name: string }>> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');
  const rooms: Array<{ id: string; name: string }> = [];
  for (const [id, obj] of Object.entries(res)) {
    if (!id.startsWith('enum.rooms.')) continue;
    const raw = obj.common?.name;
    let name = '';
    if (typeof raw === 'string') name = raw;
    else if (raw && typeof raw === 'object') {
      const langs = raw as Record<string, string>;
      name = langs.de || langs.en || Object.values(langs)[0] || id;
    }
    rooms.push({ id, name });
  }
  return rooms.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateRoomMembership(objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null): Promise<void> {
  if (oldRoomEnumId === newRoomEnumId) return;
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');

  if (oldRoomEnumId && res[oldRoomEnumId]) {
    const obj = res[oldRoomEnumId];
    const members = (obj.common?.members ?? []).filter((m) => m !== objectId);
    await putFullObject(oldRoomEnumId, { ...obj, common: { ...obj.common, members } });
  }
  if (newRoomEnumId && res[newRoomEnumId]) {
    const obj = res[newRoomEnumId];
    const members = [...new Set([...(obj.common?.members ?? []), objectId])];
    await putFullObject(newRoomEnumId, { ...obj, common: { ...obj.common, members } });
  }
  objectsCache = null;
}

export async function updateRoomMembershipBatch(objectIds: string[], newRoomEnumId: string | null): Promise<void> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');
  const objectIdSet = new Set(objectIds);

  // Remove selected IDs from all room enums they currently belong to
  for (const [enumId, enumObj] of Object.entries(res)) {
    if (!enumId.startsWith('enum.rooms.') || enumId === newRoomEnumId) continue;
    const currentMembers = enumObj.common?.members ?? [];
    if (currentMembers.some((m) => objectIdSet.has(m))) {
      const members = currentMembers.filter((m) => !objectIdSet.has(m));
      await putFullObject(enumId, { ...enumObj, common: { ...enumObj.common, members } });
    }
  }

  // Add all to the new room enum in one write
  if (newRoomEnumId && res[newRoomEnumId]) {
    const obj = res[newRoomEnumId];
    const members = [...new Set([...(obj.common?.members ?? []), ...objectIds])];
    await putFullObject(newRoomEnumId, { ...obj, common: { ...obj.common, members } });
  }
  objectsCache = null;
}

export async function setState(id: string, val: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}/state/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ val }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
}
