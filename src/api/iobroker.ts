import type { IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, HistoryOptions } from '../types/iobroker';
import { getLocalizedName, getAllNamesForSearch } from '../utils/i18n';

const LS_HOST_KEY = 'ioBrokerHost';

export function getBaseUrl(): string {
  if (window.location.protocol === 'https:') {
    return '/api/v1';
  }
  const raw = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost;
  if (raw) {
    if (/^[\w.-]+(:\d{1,5})?$/.test(raw)) {
      return `http://${raw}/v1`;
    }
    localStorage.removeItem(LS_HOST_KEY);
  }
  return '/api/v1';
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function compilePattern(pattern: string): RegExp {
  return new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
}

export function isGlobPattern(pattern: string): boolean {
  return pattern.includes('*');
}


export function scoreObject(id: string, obj: IoBrokerObject, query: string): number {
  const q = query.toLowerCase();
  const idLow = id.toLowerCase();
  if (idLow === q) return 100;
  if (idLow.startsWith(q)) return 80;
  if (idLow.includes(q)) return 60;
  const name = getAllNamesForSearch(obj.common?.name).toLowerCase();
  if (name && name.includes(q)) return 50;
  const rawAliasId = obj.common?.alias?.id;
  const aliasId = (typeof rawAliasId === 'object'
    ? [rawAliasId?.read, rawAliasId?.write].filter(Boolean).join(' ')
    : (rawAliasId ?? '')
  ).toLowerCase();
  if (aliasId && aliasId.includes(q)) return 40;
  const desc = (typeof obj.common?.desc === 'string' ? obj.common.desc : '').toLowerCase();
  if (desc && desc.includes(q)) return 30;
  return 0;
}


// ── Search index ─────────────────────────────────────────────────────────────
// `getObjectsByPattern` re-scans on every keystroke. Without an index this means
// re-running getAllNamesForSearch()/lowercasing/alias-shape-normalization for
// every object on every render — O(n) string work per keystroke even though the
// underlying object set rarely changes. We build the per-object search strings
// once (keyed on the `all` object reference returned by getAllObjects' cache —
// new reference only after an actual refetch/invalidation) and reuse them.
interface ObjectSearchIndex {
  source: Record<string, IoBrokerObject>;
  ids: string[];
  idLower: string[];
  names: string[];
  aliasIds: string[];
  descs: string[];
}

let _searchIndex: ObjectSearchIndex | null = null;

function getSearchIndex(all: Record<string, IoBrokerObject>): ObjectSearchIndex {
  if (_searchIndex && _searchIndex.source === all) return _searchIndex;
  const entries = Object.entries(all);
  const n = entries.length;
  const idx: ObjectSearchIndex = {
    source: all,
    ids: new Array(n),
    idLower: new Array(n),
    names: new Array(n),
    aliasIds: new Array(n),
    descs: new Array(n),
  };
  for (let i = 0; i < n; i++) {
    const [id, obj] = entries[i];
    idx.ids[i] = id;
    idx.idLower[i] = id.toLowerCase();
    idx.names[i] = getAllNamesForSearch(obj?.common?.name).toLowerCase();
    const rawAliasId = obj?.common?.alias?.id;
    idx.aliasIds[i] = (typeof rawAliasId === 'object'
      ? [rawAliasId?.read, rawAliasId?.write].filter(Boolean).join(' ')
      : (rawAliasId ?? '')
    ).toLowerCase();
    idx.descs[i] = (typeof obj?.common?.desc === 'string' ? obj.common.desc : '').toLowerCase();
  }
  _searchIndex = idx;
  return idx;
}

function scoreIndexed(idLower: string, name: string, aliasId: string, desc: string, q: string): number {
  if (idLower === q) return 100;
  if (idLower.startsWith(q)) return 80;
  if (idLower.includes(q)) return 60;
  if (name && name.includes(q)) return 50;
  if (aliasId && aliasId.includes(q)) return 40;
  if (desc && desc.includes(q)) return 30;
  return 0;
}

let _objectsFetchPromise: Promise<Record<string, IoBrokerObject>> | null = null;
let _fastObjectsPromise: Promise<Record<string, IoBrokerObject>> | null = null;

export async function getStateObjectsFast(): Promise<Record<string, IoBrokerObject>> {
  if (_fastObjectsPromise) return _fastObjectsPromise;
  _fastObjectsPromise = fetchApi<Record<string, IoBrokerObject>>('/objects?type=state')
    .catch(err => { _fastObjectsPromise = null; throw err; });
  return _fastObjectsPromise;
}

export async function getAllObjects(): Promise<Record<string, IoBrokerObject>> {
  if (_objectsFetchPromise) return _objectsFetchPromise;
  // `/objects` returns every object on modern adapters, but on some REST-API
  // versions it omits whole categories (folder/device/channel/enum) rather than
  // just leaving them untyped — e.g. plain `/objects` can come back with zero
  // `enum.*` entries (or zero `device`/`channel`/`folder` entries, even though
  // the objects exist and ARE typed) even though `?type=X` has them. Detecting
  // "untyped objects present" alone misses that "category absent entirely"
  // case (this is what broke the Enum-Manager, and also hid e.g. an
  // `alias.0.*` device-type object from the StateList). So: always merge in
  // `?type=enum/folder/device/channel` explicitly rather than relying on
  // heuristics to decide whether the legacy fetches are needed.
  _objectsFetchPromise = Promise.all([
    fetchApi<Record<string, IoBrokerObject>>('/objects'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=folder'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=device'),
    fetchApi<Record<string, IoBrokerObject>>('/objects?type=channel'),
  ])
    .then(([baseAll, enums, folders, devices, channels]) => {
      const foldersTyped = Object.fromEntries(
        Object.entries(folders).map(([k, v]) => [k, { ...v, type: v.type ?? 'folder' }])
      ) as Record<string, IoBrokerObject>;
      const all = { ...baseAll, ...enums, ...foldersTyped, ...devices, ...channels };
      _objectsFetchPromise = null;
      _fastObjectsPromise = null;
      return all;
    })
    .catch(err => {
      _objectsFetchPromise = null;
      throw err;
    });
  return _objectsFetchPromise;
}

export async function getObjectsByPattern(pattern: string, fulltext = true, exact = false, fieldFilters?: { id?: string; name?: string; desc?: string }): Promise<Record<string, IoBrokerObject>> {
  const all = await getAllObjects();

  // Helper: apply field-specific filters as AND conditions
  function matchesFieldFilters(id: string, obj: IoBrokerObject): boolean {
    if (!fieldFilters) return true;
    if (fieldFilters.id) {
      const q = fieldFilters.id.toLowerCase();
      const idLow = id.toLowerCase();
      const matched = isGlobPattern(fieldFilters.id) ? compilePattern(fieldFilters.id).test(id) : idLow.includes(q);
      if (!matched) return false;
    }
    if (fieldFilters.name) {
      const q = fieldFilters.name.toLowerCase();
      const name = getAllNamesForSearch(obj.common?.name).toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (fieldFilters.desc) {
      const q = fieldFilters.desc.toLowerCase();
      const desc = (typeof obj.common?.desc === 'string' ? obj.common.desc : '').toLowerCase();
      if (!desc.includes(q)) return false;
    }
    return true;
  }

  if (isGlobPattern(pattern)) {
    const result: Record<string, IoBrokerObject> = {};
    const regex = compilePattern(pattern);
    for (const [id, obj] of Object.entries(all)) {
      if (!!obj && regex.test(id) && matchesFieldFilters(id, obj)) {
        result[id] = obj;
      }
    }
    return result;
  }

  if (!fulltext) {
    if (exact) {
      const q = pattern.toLowerCase();
      const result: Record<string, IoBrokerObject> = {};
      for (const [id, obj] of Object.entries(all)) {
        if (!!obj && id.toLowerCase() === q) {
          result[id] = obj;
          break;
        }
      }
      return result;
    }
    // Nur ID-Substring-Suche ohne Relevanz-Ranking
    const q = pattern.toLowerCase();
    const result: Record<string, IoBrokerObject> = {};
    for (const [id, obj] of Object.entries(all)) {
      if (!!obj && id.toLowerCase().includes(q) && matchesFieldFilters(id, obj)) {
        result[id] = obj;
      }
    }
    return result;
  }

  if (exact) {
    const q = pattern.toLowerCase();
    const result: Record<string, IoBrokerObject> = {};
    for (const [id, obj] of Object.entries(all)) {
      if (!obj) continue;
      if (id.toLowerCase() === q) {
        result[id] = obj;
        break;
      }
    }
    return result;
  }

  // Volltext-Suche: ID, Name, Beschreibung, Alias-Ziel — uses the precomputed
  // search index (lowercased id/name/alias/desc strings) instead of recomputing
  // getAllNamesForSearch()/alias-shape-normalization for every object on every
  // keystroke. Index is rebuilt only when `all` changes (new object reference).
  const q = pattern.toLowerCase();
  const idx = getSearchIndex(all);
  const scored: Array<[string, IoBrokerObject, number]> = [];
  for (let i = 0; i < idx.ids.length; i++) {
    const id = idx.ids[i];
    const obj = all[id];
    if (!obj) continue;
    if (!matchesFieldFilters(id, obj)) continue;
    const score = pattern === '*' ? 1 : scoreIndexed(idx.idLower[i], idx.names[i], idx.aliasIds[i], idx.descs[i], q);
    if (score > 0) scored.push([id, obj, score]);
  }
  scored.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));

  const result: Record<string, IoBrokerObject> = {};
  for (const [id, obj] of scored) result[id] = obj;
  return result;
}

export async function getState(id: string): Promise<IoBrokerState> {
  return fetchApi<IoBrokerState>(`/state/${encodeURIComponent(id)}`);
}

let _bulkStatesSupported: boolean | null = null;
let _commandStatesSupported: boolean | null = null;

// Max encoded URL length for the bulk-by-id endpoint — keeps the request line
// under typical reverse-proxy header-size limits (~8KB). Count-based chunking
// breaks down when adapters (homeconnect, mercedesme, ...) emit very long IDs,
// so chunks are sized by accumulated encoded length instead of item count.
const BULK_MAX_URL_LEN = 4000;

function chunkIdsByLength(ids: string[], baseLen: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = baseLen;
  for (const id of ids) {
    const encodedLen = encodeURIComponent(id).length + 1; // +1 for separator comma
    if (current.length > 0 && len + encodedLen > BULK_MAX_URL_LEN) {
      chunks.push(current);
      current = [];
      len = baseLen;
    }
    current.push(id);
    len += encodedLen;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function getStatesBulkSmall(ids: string[]): Promise<Record<string, IoBrokerState> | null> {
  // /v1/states only takes a `filter` pattern (not explicit ids — unknown query
  // params are ignored and it falls back to dumping the whole DB). The real
  // bulk-by-id endpoint is /v1/state/<comma,separated,ids> (readState splits on ',').
  const url = `${getBaseUrl()}/state/${ids.map(encodeURIComponent).join(',')}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: unknown = await res.json();
  const list = Array.isArray(data) ? data : [data];
  const result: Record<string, IoBrokerState> = {};
  for (const entry of list) {
    if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') {
      const state = entry as IoBrokerState;
      result[state.id] = state;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

async function getStatesViaCommand(ids: string[]): Promise<Record<string, IoBrokerState> | null> {
  if (_commandStatesSupported === false) return null;
  try {
    const url = `${getBaseUrl()}/command/getStates?pattern=*`;
    const res = await fetch(url);
    if (!res.ok) { _commandStatesSupported = false; return null; }
    const envelope: unknown = await res.json();
    if (typeof envelope !== 'object' || envelope === null) { _commandStatesSupported = false; return null; }
    const allData = (envelope as { result?: unknown }).result;
    if (typeof allData !== 'object' || allData === null || Array.isArray(allData)) { _commandStatesSupported = false; return null; }
    _commandStatesSupported = true;
    const all = allData as Record<string, IoBrokerState>;
    const result: Record<string, IoBrokerState> = {};
    for (const id of ids) {
      if (id in all) result[id] = all[id];
    }
    return result;
  } catch {
    _commandStatesSupported = false;
    return null;
  }
}

export async function getStatesBatch(ids: string[]): Promise<Record<string, IoBrokerState>> {
  if (ids.length === 0) return {};

  // Bulk-by-id endpoint (/state/id1,id2,...): chunk into URL-safe groups and fetch
  // in parallel. Payload scales with the number of *requested* IDs, not with the
  // size of the whole DB — unlike the pattern=* command fallback below.
  if (_bulkStatesSupported !== false) {
    try {
      const baseLen = `${getBaseUrl()}/state/`.length;
      const chunks = chunkIdsByLength(ids, baseLen);
      const chunkResults = await Promise.all(chunks.map((chunk) => getStatesBulkSmall(chunk)));
      if (chunkResults.every((r) => r !== null)) {
        _bulkStatesSupported = true;
        const merged: Record<string, IoBrokerState> = {};
        for (const r of chunkResults) Object.assign(merged, r);
        return merged;
      }
    } catch { /* fall through */ }
    if (_bulkStatesSupported === null) _bulkStatesSupported = false;
  }

  // Bulk endpoint unsupported by this adapter version: fetch all states in one
  // request, then filter to the requested IDs. One request beats hundreds of
  // individual ones (though it transfers the whole DB — only used as fallback).
  const commandResult = await getStatesViaCommand(ids);
  if (commandResult !== null) return commandResult;

  // Last-resort fallback: parallel individual requests in batches of 50
  const BATCH_SIZE = 50;
  const record: Record<string, IoBrokerState> = {};
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return [id, await getState(id)] as const;
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
  const res = await fetch(`${getBaseUrl()}/command/sendTo`, {
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
        map[id] = getLocalizedName(enumName);
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
    const aliasIdField = obj.common?.alias?.id;
    const targets: string[] = [];
    if (typeof aliasIdField === 'object') {
      if (aliasIdField?.read) targets.push(aliasIdField.read);
      if (aliasIdField?.write && aliasIdField.write !== aliasIdField.read) targets.push(aliasIdField.write);
    } else {
      const t = aliasIdField ?? obj.common?.alias?.read;
      if (t) targets.push(t);
    }
    for (const targetId of targets) {
      if (!map.has(targetId)) map.set(targetId, []);
      map.get(targetId)!.push(id);
    }
  }
  return map;
}

export function hasHistory(obj: IoBrokerObject): boolean {
  return obj.common?.custom?.['sql.0']?.enabled === true;
}

export function hasCustomEnabled(obj: IoBrokerObject | undefined): boolean {
  if (!obj?.common?.custom) return false;
  return Object.values(obj.common.custom).some((c) => c?.enabled === true);
}

export function hasSmartName(obj: IoBrokerObject | undefined): boolean {
  if (!obj) return false;
  const sn = obj.common?.smartName;
  if (!sn) return false;
  if (typeof sn === 'string') return sn.trim().length > 0;
  if (typeof sn === 'object') return Object.values(sn).some((v) => v && String(v).trim().length > 0);
  return false;
}

export async function createObject(id: string, common: Partial<IoBrokerObjectCommon>, objectType: 'state' | 'folder' | 'device' | 'channel' = 'state'): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: objectType, common, native: {} }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

export async function deleteObject(id: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

export async function deleteObjectsMany(ids: string[]): Promise<void> {
  const CHUNK = 8;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await Promise.all(
      ids.slice(i, i + CHUNK).map(id =>
        fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )
    );
  }
}

export async function renameDatapoint(oldId: string, newId: string, obj: IoBrokerObject, currentVal?: { val: unknown; ack?: boolean }): Promise<void> {
  await putFullObject(newId, { ...obj, _id: newId });
  if (currentVal !== undefined && currentVal.val !== null) {
    try { await setState(newId, currentVal.val, currentVal.ack); } catch { /* best effort */ }
  }
  await deleteObject(oldId);
}

export async function putFullObject(id: string, obj: IoBrokerObject): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

export type ImportItemResult = { id: string; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string };
export type ImportResult = { items: ImportItemResult[]; created: number; updated: number; skipped: number; errors: number };

export async function importDatapoints(data: Record<string, IoBrokerObject>, existingIds?: Set<string>): Promise<ImportResult> {
  const items: ImportItemResult[] = [];
  for (const [id, obj] of Object.entries(data)) {
    const isExisting = existingIds ? existingIds.has(id) : false;
    try {
      await fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...obj, _id: id }),
      }).then((res) => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); });
      items.push({ id, status: isExisting ? 'updated' : 'created' });
    } catch (e) {
      items.push({ id, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    items,
    created: items.filter((i) => i.status === 'created').length,
    updated: items.filter((i) => i.status === 'updated').length,
    skipped: 0,
    errors:  items.filter((i) => i.status === 'error').length,
  };
}

export async function extendObject(id: string, obj: { common: Partial<IoBrokerObject['common']> }): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
}

export async function getObject(id: string): Promise<IoBrokerObject> {
  const all = await getAllObjects();
  if (all[id]) return all[id];
  return fetchApi<IoBrokerObject>(`/object/${encodeURIComponent(id)}`);
}

export async function getObjectFresh(id: string): Promise<IoBrokerObject> {
  return fetchApi<IoBrokerObject>(`/object/${encodeURIComponent(id)}`);
}

export async function getFunctionMap(): Promise<Record<string, string>> {
  const all = await getAllObjects();
  const map: Record<string, string> = {};
  for (const [id, obj] of Object.entries(all)) {
    if (!obj.enums) continue;
    for (const [enumId, enumName] of Object.entries(obj.enums)) {
      if (enumId.startsWith('enum.functions.')) {
        map[id] = getLocalizedName(enumName);
        break;
      }
    }
  }
  return map;
}

export async function getCustomSupportedInstances(): Promise<Array<{ id: string; adapterName: string }>> {
  const all = await getAllObjects(); // cached — avoids a redundant /objects?type=instance round trip
  return Object.entries(all)
    .filter(([id, o]) => id.startsWith('system.adapter.') && o.common?.enabled === true && o.common?.supportCustoms === true)
    .map(([id]) => {
      const instanceId = id.replace('system.adapter.', '');
      return { id: instanceId, adapterName: instanceId.replace(/\.\d+$/, '') };
    });
}

export async function getFunctionEnums(): Promise<Array<{ id: string; name: string }>> {
  const res = await getAllObjects(); // cached — avoids a redundant /objects?type=enum round trip
  const fns: Array<{ id: string; name: string }> = [];
  for (const [id, obj] of Object.entries(res)) {
    if (!id.startsWith('enum.functions.')) continue;
    const raw = obj.common?.name;
    const name = raw ? getLocalizedName(raw) || id : id;
    fns.push({ id, name });
  }
  return fns.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateFunctionMembership(objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null): Promise<void> {
  if (oldFnEnumId === newFnEnumId) return;
  const res = await getAllObjects();

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
}

export async function updateFunctionMembershipBatch(objectIds: string[], newFnEnumId: string | null): Promise<void> {
  const res = await getAllObjects();
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
}

export async function getRoomEnums(): Promise<Array<{ id: string; name: string }>> {
  const res = await getAllObjects(); // cached — avoids a redundant /objects?type=enum round trip
  const rooms: Array<{ id: string; name: string }> = [];
  for (const [id, obj] of Object.entries(res)) {
    if (!id.startsWith('enum.rooms.')) continue;
    const raw = obj.common?.name;
    const name = raw ? getLocalizedName(raw) || id : id;
    rooms.push({ id, name });
  }
  return rooms.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateRoomMembership(objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null): Promise<void> {
  if (oldRoomEnumId === newRoomEnumId) return;
  const res = await getAllObjects();

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
}

export async function updateRoomMembershipBatch(objectIds: string[], newRoomEnumId: string | null): Promise<void> {
  const res = await getAllObjects();
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
}

export async function createEnumObject(enumId: string, name: string): Promise<void> {
  await putFullObject(enumId, {
    _id: enumId,
    type: 'enum',
    common: { name, members: [] },
    native: {},
  } as IoBrokerObject);
}

export async function renameEnumObject(enumId: string, newName: string): Promise<void> {
  const all = await getAllObjects();
  const obj = all[enumId];
  if (!obj) throw new Error(`Enum not found: ${enumId}`);
  await putFullObject(enumId, { ...obj, common: { ...obj.common, name: newName } });
}

const LS_SCRIPT_IDS_KEY = 'iob-script-used-ids-v1';
const LS_SCRIPT_IDS_TS_KEY = 'iob-script-used-ids-ts';
const SCRIPT_IDS_TTL = 60 * 60 * 1000; // 1 hour

async function fetchScriptSources(): Promise<string> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=script');
  return Object.entries(res)
    .filter(([id, obj]) => id.startsWith('script.js.') && obj.type === 'script')
    .map(([, obj]) => obj.common?.source ?? '')
    .join('\n');
}

export async function getScriptUsedIds(allObjectIds: string[], forceRefresh = false): Promise<Set<string>> {
  if (!forceRefresh) {
    const ts = localStorage.getItem(LS_SCRIPT_IDS_TS_KEY);
    if (ts && Date.now() - parseInt(ts) < SCRIPT_IDS_TTL) {
      const raw = localStorage.getItem(LS_SCRIPT_IDS_KEY);
      if (raw) {
        try { return new Set<string>(JSON.parse(raw)); } catch { /* fallthrough */ }
      }
    }
  }
  const sources = await fetchScriptSources();
  const used: string[] = [];
  const BATCH = 200;
  for (let i = 0; i < allObjectIds.length; i += BATCH) {
    for (const id of allObjectIds.slice(i, i + BATCH)) {
      if (new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(sources)) used.push(id);
    }
    if (i + BATCH < allObjectIds.length) await new Promise<void>(r => setTimeout(r, 0));
  }
  try {
    localStorage.setItem(LS_SCRIPT_IDS_KEY, JSON.stringify(used));
    localStorage.setItem(LS_SCRIPT_IDS_TS_KEY, String(Date.now()));
  } catch { /* ignore storage quota errors */ }
  return new Set<string>(used);
}

export function clearScriptUsedIdsCache(): void {
  localStorage.removeItem(LS_SCRIPT_IDS_KEY);
  localStorage.removeItem(LS_SCRIPT_IDS_TS_KEY);
}

export async function getAllScriptSources(): Promise<string> {
  return fetchScriptSources();
}

export interface ScriptUsage {
  scriptId: string;
  scriptName: string;
  enabled: boolean;
  engineType: string;
}

export async function findScriptsUsingObject(objectId: string): Promise<ScriptUsage[]> {
  const res = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=script');
  const results: ScriptUsage[] = [];
  for (const [scriptId, obj] of Object.entries(res)) {
    if (!scriptId.startsWith('script.js.') || obj.type !== 'script') continue;
    const source = obj.common?.source ?? '';
    if (!source.includes(objectId)) continue;
    results.push({
      scriptId,
      scriptName: getLocalizedName(obj.common?.name) || scriptId,
      enabled: Boolean(obj.common?.enabled),
      engineType: String(obj.common?.engineType ?? ''),
    });
  }
  return results.sort((a, b) => a.scriptId.localeCompare(b.scriptId));
}

export async function setState(id: string, val: unknown, ack?: boolean): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/state/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ack === undefined ? { val } : { val, ack }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
}
