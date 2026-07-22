import type { IoBrokerState, IoBrokerObject, IoBrokerObjectCommon, HistoryEntry, HistoryOptions } from '../types/iobroker';
import { getLocalizedName, getAllNamesForSearch } from '../utils/i18n';
import { derivePatterns } from '../utils/idPatterns';
import type { DumpRow, DumpTable } from './dbBackup';

const LS_HOST_KEY = 'ioBrokerHost';
const LS_CONNECTIONS_KEY = 'iob-connections';
const LS_ACTIVE_CONNECTION_ID = 'iob-active-connection-id';

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  socketHost?: string;
  realtimeTransport?: 'longpolling' | 'socketio';
  adminPort?: number;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(LS_CONNECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedConnection[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // Migrate existing host to default connection
  const host = localStorage.getItem(LS_HOST_KEY) ?? window.__CONFIG__?.ioBrokerHost ?? '';
  if (host) {
    const conn: SavedConnection = { id: genId(), name: 'Default', host };
    try { localStorage.setItem(LS_CONNECTIONS_KEY, JSON.stringify([conn])); } catch { /* ignore */ }
    try { localStorage.setItem(LS_ACTIVE_CONNECTION_ID, conn.id); } catch { /* ignore */ }
    return [conn];
  }
  return [];
}

export function setConnections(connections: SavedConnection[]): void {
  try { localStorage.setItem(LS_CONNECTIONS_KEY, JSON.stringify(connections)); } catch { /* ignore */ }
}

export function getActiveConnectionId(): string | null {
  return localStorage.getItem(LS_ACTIVE_CONNECTION_ID);
}

export async function switchToConnection(conn: SavedConnection): Promise<void> {
  localStorage.setItem(LS_HOST_KEY, conn.host);
  localStorage.setItem(LS_ACTIVE_CONNECTION_ID, conn.id);
  // Apply per-connection AppSettings overrides so they're ready after reload
  try {
    const raw = localStorage.getItem('iobroker-app-settings');
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (conn.realtimeTransport !== undefined) current['realtimeTransport'] = conn.realtimeTransport;
    if (conn.socketHost !== undefined) current['socketHost'] = conn.socketHost;
    if (conn.adminPort !== undefined) current['adminPort'] = conn.adminPort;
    localStorage.setItem('iobroker-app-settings', JSON.stringify(current));
  } catch { /* ignore */ }
  await clearObjectsCache();
  window.location.reload();
}

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

// ── Persisted bulk-objects cache (IndexedDB) ────────────────────────────────
// `/objects`, `/objects?type=state` and `/objects?type=script` each return
// 12-15MB on real-world installs. React Query's `staleTime: Infinity` only
// avoids refetching within a session — a browser reload still re-downloads
// all three. This cache persists the raw payloads across reloads and reuses
// them across reloads, gated by two independent, configurable settings —
// whichever fires first forces a fresh fetch (and resets the reload counter):
//   - `AppSettings.objectsCacheReloads`: reuse the cache for at most N loads
//   - `AppSettings.objectsCacheTTL`: treat the cache as stale once it's older
//     than this, regardless of the reload counter
// The manual refresh button always bypasses both (see *Cached wrappers below —
// the gate is consulted only once per page lifetime, subsequent refetches
// always hit the network and refresh the persisted entry).
const OBJECTS_CACHE_DB = 'iobroker-explorer-cache';
const OBJECTS_CACHE_STORE = 'bulk-objects';
const LS_OBJECTS_CACHE_LOADCOUNT = 'iob-objects-cache-loadcount';
const OBJECTS_CACHE_TTL_MS_MAP: Record<string, number | null> = {
  off: null, '1h': 3600_000, '6h': 6 * 3600_000, '24h': 24 * 3600_000, '7d': 7 * 24 * 3600_000,
};

interface BulkObjectsCacheEntry { data: Record<string, IoBrokerObject> | string; ts: number; }

function openObjectsCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OBJECTS_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OBJECTS_CACHE_STORE)) {
        req.result.createObjectStore(OBJECTS_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readObjectsCacheEntry(key: string): Promise<BulkObjectsCacheEntry | null> {
  try {
    const db = await openObjectsCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECTS_CACHE_STORE, 'readonly');
      const req = tx.objectStore(OBJECTS_CACHE_STORE).get(key);
      req.onsuccess = () => resolve((req.result as BulkObjectsCacheEntry | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

async function writeObjectsCacheEntry(key: string, data: BulkObjectsCacheEntry['data']): Promise<void> {
  try {
    const db = await openObjectsCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECTS_CACHE_STORE, 'readwrite');
      tx.objectStore(OBJECTS_CACHE_STORE).put({ data, ts: Date.now() } as BulkObjectsCacheEntry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore quota/availability errors — cache is best-effort */ }
}

export async function clearObjectsCache(): Promise<void> {
  try {
    const db = await openObjectsCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECTS_CACHE_STORE, 'readwrite');
      tx.objectStore(OBJECTS_CACHE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
  try { localStorage.removeItem(LS_OBJECTS_CACHE_LOADCOUNT); } catch { /* ignore */ }
}

function getObjectsCacheSettings(): { reloadThreshold: number; ttlMs: number | null } {
  try {
    const raw = localStorage.getItem('iobroker-app-settings');
    if (!raw) return { reloadThreshold: 0, ttlMs: null };
    const parsed = JSON.parse(raw) as { objectsCacheReloads?: string; objectsCacheTTL?: string };
    const n = parseInt(parsed.objectsCacheReloads ?? '', 10);
    const reloadThreshold = Number.isFinite(n) && n > 0 ? n : 0;
    const ttlMs = OBJECTS_CACHE_TTL_MS_MAP[parsed.objectsCacheTTL ?? ''] ?? OBJECTS_CACHE_TTL_MS_MAP['24h'];
    return { reloadThreshold, ttlMs };
  } catch { return { reloadThreshold: 0, ttlMs: null }; }
}

// Decided once per page lifetime (module load): "is the persisted cache fresh
// enough to reuse for this load?" Both gates must pass to reuse the cache —
// whichever fires first forces a fresh fetch (and resets the reload counter):
//   - reload counter: cache reused for at most `objectsCacheReloads` loads
//   - TTL: cache older than `objectsCacheTTL` is always considered stale
// Either set to 'off' disables that particular gate. Subsequent calls within
// the same session (manual refresh, auto-refresh interval) always bypass this
// and hit the network directly.
let _objectsCacheGateDecision: boolean | null = null;

async function shouldUsePersistedObjectsCache(): Promise<boolean> {
  if (_objectsCacheGateDecision !== null) return _objectsCacheGateDecision;
  const { reloadThreshold, ttlMs } = getObjectsCacheSettings();
  let useCache = false;
  if (reloadThreshold > 0) {
    const ref = await readObjectsCacheEntry('allObjects');
    const withinTtl = ref !== null && (ttlMs === null || (Date.now() - ref.ts) < ttlMs);
    const count = parseInt(localStorage.getItem(LS_OBJECTS_CACHE_LOADCOUNT) ?? '0', 10) || 0;
    useCache = withinTtl && count < reloadThreshold;
  }
  try { localStorage.setItem(LS_OBJECTS_CACHE_LOADCOUNT, useCache ? String((parseInt(localStorage.getItem(LS_OBJECTS_CACHE_LOADCOUNT) ?? '0', 10) || 0) + 1) : '0'); } catch { /* ignore */ }
  _objectsCacheGateDecision = useCache;
  return useCache;
}

let _objectsFetchPromise: Promise<Record<string, IoBrokerObject>> | null = null;
let _fastObjectsPromise: Promise<Record<string, IoBrokerObject>> | null = null;

// ── Namespace inclusion filter ────────────────────────────────────────────────
let _includeNamespaces: string[] = [];

export function setIncludeNamespaces(namespaces: string[]): void {
  const prev = _includeNamespaces.slice().sort().join('\0');
  const next = namespaces.slice().sort().join('\0');
  if (prev === next) return;
  _includeNamespaces = namespaces;
  _objectsFetchPromise = null;
  _fastObjectsPromise = null;
  _allObjectsCacheChecked = false;
  _stateObjectsFastCacheChecked = false;
}

async function fetchObjectView(type: string, namespacePrefix: string): Promise<Record<string, IoBrokerObject>> {
  const res = await fetch(`${getBaseUrl()}/command/getObjectView`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ design: 'system', search: type, params: { startkey: namespacePrefix, endkey: namespacePrefix + '￿' } }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  const envelope = await res.json() as { result?: { rows?: Array<{ id: string; value: IoBrokerObject }> } };
  const rows = envelope?.result?.rows ?? [];
  return Object.fromEntries(rows.map((r) => [r.id, r.value ?? {}]));
}

async function getStateObjectsForNamespaces(namespaces: string[]): Promise<Record<string, IoBrokerObject>> {
  const results = await Promise.all(namespaces.map((ns) => fetchObjectView('state', ns)));
  return Object.assign({}, ...results) as Record<string, IoBrokerObject>;
}

async function getAllObjectsForNamespaces(namespaces: string[]): Promise<Record<string, IoBrokerObject>> {
  const types = ['state', 'channel', 'device', 'folder'] as const;
  const namespacedFetches = namespaces.flatMap((ns) => types.map((t) => fetchObjectView(t, ns)));
  const enumFetch = fetchApi<Record<string, IoBrokerObject>>('/objects?type=enum');
  const [enums, ...rest] = await Promise.all([enumFetch, ...namespacedFetches]);
  return Object.assign({}, enums, ...rest) as Record<string, IoBrokerObject>;
}

export async function getStateObjectsFast(): Promise<Record<string, IoBrokerObject>> {
  if (_fastObjectsPromise) return _fastObjectsPromise;
  const fetcher = _includeNamespaces.length > 0
    ? getStateObjectsForNamespaces(_includeNamespaces)
    : fetchApi<Record<string, IoBrokerObject>>('/objects?type=state');
  _fastObjectsPromise = (fetcher as Promise<Record<string, IoBrokerObject>>)
    .catch(err => { _fastObjectsPromise = null; throw err; });
  return _fastObjectsPromise;
}

let _stateObjectsFastCacheChecked = false;

// Gated by the persisted bulk-objects cache on the first call per page lifetime
// (browser load); every later call (manual refresh, refetch) hits the network
// directly and refreshes the persisted entry.
export async function getStateObjectsFastCached(): Promise<Record<string, IoBrokerObject>> {
  if (!_stateObjectsFastCacheChecked) {
    _stateObjectsFastCacheChecked = true;
    if (await shouldUsePersistedObjectsCache()) {
      const cached = await readObjectsCacheEntry('stateObjectsFast');
      if (cached && typeof cached.data === 'object') return cached.data as Record<string, IoBrokerObject>;
    }
  }
  const fresh = await getStateObjectsFast();
  void writeObjectsCacheEntry('stateObjectsFast', fresh);
  return fresh;
}

export async function getAllObjects(): Promise<Record<string, IoBrokerObject>> {
  if (_objectsFetchPromise) return _objectsFetchPromise;

  if (_includeNamespaces.length > 0) {
    _objectsFetchPromise = getAllObjectsForNamespaces(_includeNamespaces)
      .then((all) => { _objectsFetchPromise = null; _fastObjectsPromise = null; return all; })
      .catch((err) => { _objectsFetchPromise = null; throw err; });
    return _objectsFetchPromise;
  }

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

let _allObjectsCacheChecked = false;

// See `getStateObjectsFastCached` — same gate-once-per-page-lifetime pattern.
export async function getAllObjectsCached(): Promise<Record<string, IoBrokerObject>> {
  if (!_allObjectsCacheChecked) {
    _allObjectsCacheChecked = true;
    if (await shouldUsePersistedObjectsCache()) {
      const cached = await readObjectsCacheEntry('allObjects');
      if (cached && typeof cached.data === 'object') return cached.data as Record<string, IoBrokerObject>;
    }
  }
  const fresh = await getAllObjects();
  void writeObjectsCacheEntry('allObjects', fresh);
  return fresh;
}

export async function getObjectsByPattern(pattern: string, fulltext = true, exact = false, fieldFilters?: { id?: string; name?: string; desc?: string }): Promise<Record<string, IoBrokerObject>> {
  const all = await getAllObjectsCached();

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
      if (!!obj && obj.type !== 'enum' && regex.test(id) && matchesFieldFilters(id, obj)) {
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
        if (!!obj && obj.type !== 'enum' && id.toLowerCase() === q) {
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
      if (!!obj && obj.type !== 'enum' && id.toLowerCase().includes(q) && matchesFieldFilters(id, obj)) {
        result[id] = obj;
      }
    }
    return result;
  }

  if (exact) {
    const q = pattern.toLowerCase();
    const result: Record<string, IoBrokerObject> = {};
    for (const [id, obj] of Object.entries(all)) {
      if (!obj || obj.type === 'enum') continue;
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
    if (!obj || obj.type === 'enum') continue;
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

async function fetchStatesForPattern(pattern: string): Promise<Record<string, IoBrokerState> | null> {
  const url = `${getBaseUrl()}/command/getStates?pattern=${encodeURIComponent(pattern)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const envelope: unknown = await res.json();
  if (typeof envelope !== 'object' || envelope === null) return null;
  const data = (envelope as { result?: unknown }).result;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return data as Record<string, IoBrokerState>;
}

async function getStatesViaCommand(ids: string[]): Promise<Record<string, IoBrokerState> | null> {
  if (_commandStatesSupported === false) return null;
  try {
    const patterns = derivePatterns(ids);
    const perPattern = await Promise.all(patterns.map(fetchStatesForPattern));
    if (perPattern.some((r) => r === null)) {
      _commandStatesSupported = false;
      return null;
    }
    _commandStatesSupported = true;
    const all = Object.assign({}, ...perPattern) as Record<string, IoBrokerState>;
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
        for (const r of chunkResults) {
          Object.assign(merged, r);
          // Yield to let the browser handle pending input events between chunks.
          // Prevents the merge loop from becoming a long task that delays clicks.
          const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
          if (typeof sched?.yield === 'function') {
            await sched.yield();
          }
        }
        return merged;
      }
    } catch { /* fall through */ }
    if (_bulkStatesSupported === null) _bulkStatesSupported = false;
  }

  // Bulk endpoint unsupported by this adapter version: fetch per-namespace
  // patterns derived from the requested IDs (adapter.instance.* subtrees)
  // instead of the whole DB, then filter to the requested IDs.
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

export interface DpOverviewRow {
  id: string;
  [key: string]: unknown;
}

// POC: list datapoints stored in the sql.0 database (independent of current history config).
export async function getDpOverview(): Promise<DpOverviewRow[]> {
  const data = await sendToSql('getDpOverview', {});
  console.debug('[getDpOverview] raw', data);

  // Response shape (sql.0): { success, result: { "<dp id>": { type, ts }, ... } }.
  // Also tolerate a plain array or other envelopes.
  const toRows = (v: unknown): DpOverviewRow[] => {
    if (Array.isArray(v)) {
      return v
        .filter((r) => r && typeof r === 'object')
        .map((r) => {
          const row = r as Record<string, unknown>;
          return { ...row, id: String(row.id ?? row._id ?? row.name ?? '') };
        });
    }
    if (v && typeof v === 'object') {
      // object keyed by datapoint id → attach the key as id
      return Object.entries(v as Record<string, unknown>).map(([id, val]) =>
        val && typeof val === 'object'
          ? { ...(val as Record<string, unknown>), id }
          : { id, value: val }
      );
    }
    return [];
  };

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const nested = o.result ?? o.data ?? o.rows ?? o.list ?? o.dps ?? o.datapoints;
    if (nested !== undefined) return toRows(nested);
  }
  return toRows(data);
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

// The sql adapter gates its range branch on `if (message.start)` and builds the
// SQL only when `start && end` — both truthy. A start of 0 is silently skipped
// (adapter logs "Invalid state" and still answers success), so clamp to >= 1.
// ts values are epoch ms, so 1 is effectively "from the beginning".
export async function deleteHistoryRange(id: string, start: number, end: number): Promise<void> {
  const s = Math.max(1, Math.floor(start));
  const e = Math.floor(end);
  await sendToSql('deleteRange', [{ id, start: s, end: e }]);
}

export async function deleteHistoryAll(id: string): Promise<void> {
  await sendToSql('deleteAll', [{ id }]);
}

// Database name of the sql.0 backend. Default for the SQL adapter is `iobroker`;
// adjust here if the adapter is configured with a different database name.
const SQL_DB_NAME = 'iobroker';

function sqlQuote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

// Runs a raw SQL query via sql.0 `query` sendTo. Response envelope: { error, result }.
async function querySql(sql: string): Promise<unknown[]> {
  const res = (await sendToSql('query', sql)) as { error?: unknown; result?: unknown[] } | null;
  if (res && typeof res === 'object' && res.error) {
    throw new Error(String(res.error));
  }
  return (res?.result ?? []) as unknown[];
}

export interface DbStats {
  totalValues: number;    // approx. sum of rows across ts_* tables
  sizeBytes: number;      // data + index size of the whole database
  tables: { name: string; rows: number; bytes: number }[];
}

// Database-wide stats via information_schema (instant — no full-table COUNT).
// Row counts are InnoDB estimates (good enough for a header summary).
export async function getDbStats(): Promise<DbStats> {
  const rows = await querySql(
    `SELECT table_name AS name, table_rows AS rowcount, (data_length + index_length) AS bytes ` +
    `FROM information_schema.TABLES WHERE table_schema = ${sqlQuote(SQL_DB_NAME)}`
  );
  const tables = rows.map((r) => {
    const o = r as Record<string, unknown>;
    return { name: String(o.name ?? ''), rows: Number(o.rowcount ?? 0), bytes: Number(o.bytes ?? 0) };
  });
  const totalValues = tables.filter((t) => t.name.startsWith('ts_')).reduce((s, t) => s + t.rows, 0);
  const sizeBytes = tables.reduce((s, t) => s + t.bytes, 0);
  return { totalValues, sizeBytes, tables };
}

// Maps ioBroker state id (datapoints.name) → numeric datapoints.id (the "real" DB id).
export async function getDpNumericIdMap(): Promise<Record<string, number>> {
  const rows = await querySql(`SELECT id, name FROM ${SQL_DB_NAME}.datapoints`);
  const map: Record<string, number> = {};
  for (const r of rows) {
    const o = r as { id?: unknown; name?: unknown };
    if (o.name != null) map[String(o.name)] = Number(o.id);
  }
  return map;
}

// The three value tables sql.0 writes to, keyed by datapoint type.
const TS_TABLES = ['ts_number', 'ts_string', 'ts_bool'] as const;
export type TsTable = (typeof TS_TABLES)[number];

export interface OrphanValueGroup {
  table: TsTable;
  dbId: number;     // numeric id referenced by the value rows
  count: number;    // how many rows carry that id
  firstTs: number;
  lastTs: number;
}

// Hard cap on how many candidate ids we probe. Beyond this the datapoints table
// has so many gaps that the scan degenerates into the full-table variant again.
const ORPHAN_MAX_CANDIDATES = 20000;
// Candidate ids per IN(...) query — keeps single statements short enough for the
// sendTo transport while still batching aggressively.
const ORPHAN_CHUNK = 500;

// Finds value rows whose numeric id has no matching row in `datapoints` — left
// behind when a datapoint was removed from `datapoints` without purging its
// history. One group per (table, id).
//
// A LEFT JOIN over the whole ts_* table is unusable on large databases (full
// index scan per table). Instead: orphan ids can only be *gaps* in the
// AUTO_INCREMENT sequence of `datapoints`, so we derive the candidate ids from
// that (tiny) table and probe only those via the (id, ts) index.
export async function getOrphanValueRows(
  onProgress?: (done: number, total: number) => void
): Promise<OrphanValueGroup[]> {
  const liveRows = await querySql(`SELECT id FROM ${SQL_DB_NAME}.datapoints`);
  const live = new Set<number>();
  for (const r of liveRows) live.add(Number((r as { id?: unknown }).id));

  // Highest id actually present in the value tables — bounds the gap search and
  // catches orphans above max(datapoints.id) (tail of the sequence deleted).
  const maxRows = await querySql(
    TS_TABLES.map((t) => `SELECT MAX(id) AS m FROM ${SQL_DB_NAME}.${t}`).join(' UNION ALL ')
  );
  let maxId = 0;
  for (const r of maxRows) maxId = Math.max(maxId, Number((r as { m?: unknown }).m ?? 0) || 0);
  if (!maxId) return [];

  const candidates: number[] = [];
  for (let id = 1; id <= maxId; id++) {
    if (live.has(id)) continue;
    candidates.push(id);
    if (candidates.length > ORPHAN_MAX_CANDIDATES) {
      throw new Error(
        `Too many candidate ids (> ${ORPHAN_MAX_CANDIDATES}) — the datapoints table is too sparse for a fast scan.`
      );
    }
  }
  if (candidates.length === 0) return [];

  const chunks: number[][] = [];
  for (let i = 0; i < candidates.length; i += ORPHAN_CHUNK) {
    chunks.push(candidates.slice(i, i + ORPHAN_CHUNK));
  }

  const groups: OrphanValueGroup[] = [];
  const total = chunks.length * TS_TABLES.length;
  let done = 0;
  for (const table of TS_TABLES) {
    for (const chunk of chunks) {
      const rows = await querySql(
        `SELECT id AS dbId, COUNT(*) AS cnt, MIN(ts) AS firstTs, MAX(ts) AS lastTs ` +
        `FROM ${SQL_DB_NAME}.${table} WHERE id IN (${chunk.join(',')}) GROUP BY id`
      );
      for (const r of rows) {
        const o = r as Record<string, unknown>;
        groups.push({
          table,
          dbId: Number(o.dbId ?? 0),
          count: Number(o.cnt ?? 0),
          firstTs: Number(o.firstTs ?? 0),
          lastTs: Number(o.lastTs ?? 0),
        });
      }
      onProgress?.(++done, total);
    }
  }
  return groups.sort((a, b) => b.count - a.count);
}

// Deletes all value rows of one orphan group. The table name comes from our own
// whitelist (never from the response) so it can't be smuggled into the statement.
export async function deleteOrphanValueRows(table: string, dbId: number): Promise<void> {
  if (!(TS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown value table: ${table}`);
  }
  const numId = Math.floor(Number(dbId));
  if (!Number.isFinite(numId)) throw new Error(`Invalid db id: ${dbId}`);
  await querySql(buildOrphanDeleteSql(table, numId));
}

// Value-history table for a datapoint type (as reported by getDpOverview).
export function tsTableForType(type: unknown): string {
  switch (String(type)) {
    case 'string': return 'ts_string';
    case 'boolean': return 'ts_bool';
    default: return 'ts_number';
  }
}

// Counts how many stored values a datapoint has in the sql.0 database.
// Counting on demand per datapoint: a type-specific indexed lookup (fast),
// unlike a full GROUP BY over the whole ts table (too slow on large DBs).
// Optional startTs/endTs narrow the count to a timestamp range (inclusive),
// e.g. to preview how many rows a range delete would remove.
export async function getDpValueCount(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<number> {
  const rows = await querySql(
    `SELECT COUNT(*) c FROM ${SQL_DB_NAME}.${tsTableForType(type)} n ` +
    `JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id ` +
    `WHERE ${dpValueWhere(id, startTs, endTs)}`
  );
  const first = rows[0] as { c?: unknown } | undefined;
  return Number(first?.c ?? 0);
}

// Shared WHERE for the per-datapoint value queries: name match plus the optional
// inclusive timestamp range.
function dpValueWhere(id: string, startTs?: number | null, endTs?: number | null): string {
  let where = `d.name = ${sqlQuote(id)}`;
  if (startTs != null && !Number.isNaN(startTs)) where += ` AND n.ts >= ${Math.floor(startTs)}`;
  if (endTs != null && !Number.isNaN(endTs)) where += ` AND n.ts <= ${Math.floor(endTs)}`;
  return where;
}

export interface DpValueSpan {
  count: number;
  firstTs: number | null;  // oldest stored timestamp, null when there are no rows
  lastTs: number | null;
}

// Row count plus the time span of one datapoint, in a single query. Same shape
// as getDpValueCount (indexed range over one datapoint), so it stays cheap even
// on datapoints with a lot of history.
export async function getDpValueSpan(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<DpValueSpan> {
  const rows = await querySql(
    `SELECT COUNT(*) c, MIN(n.ts) f, MAX(n.ts) l FROM ${SQL_DB_NAME}.${tsTableForType(type)} n ` +
    `JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id ` +
    `WHERE ${dpValueWhere(id, startTs, endTs)}`
  );
  const r = rows[0] as { c?: unknown; f?: unknown; l?: unknown } | undefined;
  const num = (v: unknown) => (v == null ? null : Number(v) || null);
  return { count: Number(r?.c ?? 0), firstTs: num(r?.f), lastTs: num(r?.l) };
}

export interface DpValueRow {
  ts: number;
  val: unknown;
  ack: number;
  q: number;
  src: string | null;
}

// Resolves the numeric datapoints.id for an ioBroker state id (name).
export async function resolveDpNumericId(id: string): Promise<number | null> {
  const rows = await querySql(
    `SELECT id FROM ${SQL_DB_NAME}.datapoints WHERE name = ${sqlQuote(id)} LIMIT 1`
  );
  const first = rows[0] as { id?: unknown } | undefined;
  if (first?.id == null) return null;
  return Number(first.id);
}

// Fetches a page of stored value rows for a datapoint, newest first.
// Two-step (resolve numeric id, then index scan on the ts table) keeps deep
// pagination fast — the PK index (id, ts) avoids a filesort.
export async function getDpValues(
  id: string,
  type: unknown,
  limit: number,
  offset: number,
  startTs?: number | null,
  endTs?: number | null,
): Promise<DpValueRow[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) return [];
  const table = tsTableForType(type);
  const lim = Math.max(1, Math.floor(limit));
  const off = Math.max(0, Math.floor(offset));
  let where = `n.id = ${numId}`;
  if (startTs != null && !Number.isNaN(startTs)) where += ` AND n.ts >= ${Math.floor(startTs)}`;
  if (endTs != null && !Number.isNaN(endTs)) where += ` AND n.ts <= ${Math.floor(endTs)}`;
  const rows = await querySql(
    `SELECT n.ts, n.val, n.ack, n.q, s.name AS src ` +
    `FROM ${SQL_DB_NAME}.${table} n ` +
    `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from ` +
    `WHERE ${where} ORDER BY n.ts DESC LIMIT ${lim} OFFSET ${off}`
  );
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      ts: Number(o.ts ?? 0),
      val: o.val,
      ack: Number(o.ack ?? 0),
      q: Number(o.q ?? 0),
      src: o.src == null ? null : String(o.src),
    };
  });
}

// --- Backup: chunked raw row fetch -------------------------------------------

// Rows per request when streaming a datapoint out of the database. Large enough
// to keep the roundtrip count sane, small enough that a single sendTo response
// stays manageable.
const BACKUP_FETCH_CHUNK = 10_000;

export interface ChunkedFetchOptions {
  startTs?: number | null;
  endTs?: number | null;
  // Stop after this many rows (newest first).
  cap: number;
  // Called after every chunk with the running total.
  onProgress?: (fetched: number) => void;
  signal?: AbortSignal;
}

async function fetchRowsChunked(
  table: string,
  numId: number,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  let where = `n.id = ${numId}`;
  if (opts.startTs != null && !Number.isNaN(opts.startTs)) where += ` AND n.ts >= ${Math.floor(opts.startTs)}`;
  if (opts.endTs != null && !Number.isNaN(opts.endTs)) where += ` AND n.ts <= ${Math.floor(opts.endTs)}`;

  const out: DumpRow[] = [];
  let offset = 0;
  for (;;) {
    if (opts.signal?.aborted) throw new Error('Export aborted');
    const remaining = opts.cap - out.length;
    if (remaining <= 0) break;
    const limit = Math.min(BACKUP_FETCH_CHUNK, remaining);
    const rows = await querySql(
      `SELECT n.ts, n.val, n.ack, n.q, s.name AS src ` +
      `FROM ${SQL_DB_NAME}.${table} n ` +
      `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from ` +
      `WHERE ${where} ORDER BY n.ts DESC LIMIT ${limit} OFFSET ${offset}`
    );
    for (const r of rows) {
      const o = r as Record<string, unknown>;
      out.push([
        Number(o.ts ?? 0),
        o.val,
        Number(o.ack ?? 0) === 1 ? 1 : 0,
        Number(o.q ?? 0),
        o.src == null ? null : String(o.src),
      ]);
    }
    opts.onProgress?.(out.length);
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

// Streams the raw stored rows of a datapoint, newest first.
export async function fetchDpRowsChunked(
  id: string,
  type: unknown,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  return fetchRowsChunked(tsTableForType(type), numId, opts);
}

// Counts a datapoint's stored rows across ALL three value tables.
// A datapoint's type can change over its lifetime, and sql.0 then starts writing
// to a different ts_* table without moving the old rows — so a single-table count
// understates what a full delete would remove.
export async function getDpValueCountAllTables(id: string): Promise<number> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) return 0;
  const rows = await querySql(
    TS_TABLES.map((t) => `SELECT COUNT(*) c FROM ${SQL_DB_NAME}.${t} WHERE id = ${numId}`).join(' UNION ALL ')
  );
  return rows.reduce<number>((sum, r) => sum + Number((r as { c?: unknown }).c ?? 0), 0);
}

// Streams a datapoint's raw rows from every value table that holds any, so a
// backup taken before a full delete covers the same ground the delete does.
export async function fetchDpRowsAllTables(
  id: string,
  opts: ChunkedFetchOptions,
): Promise<{ table: DumpTable; rows: DumpRow[] }[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  const out: { table: DumpTable; rows: DumpRow[] }[] = [];
  let fetched = 0;
  for (const table of TS_TABLES) {
    // The cap spans the whole datapoint, not each table, so later tables get
    // whatever budget the earlier ones left.
    const remaining = opts.cap - fetched;
    if (remaining <= 0) break;
    const rows = await fetchRowsChunked(table, numId, {
      ...opts,
      cap: remaining,
      onProgress: (n) => opts.onProgress?.(fetched + n),
    });
    fetched += rows.length;
    if (rows.length > 0) out.push({ table, rows });
  }
  return out;
}

// Rows per DELETE statement when clearing a datapoint. Bounded so a datapoint
// with millions of rows does not become one long-running locking statement that
// the sendTo call times out on.
const FULL_DELETE_CHUNK = 50_000;

// Removes a datapoint from the database entirely: every value row in every ts_*
// table, then the `datapoints` row itself.
//
// Deleting the datapoints row frees its numeric id, and MariaDB reuses
// AUTO_INCREMENT gaps — a later datapoint can inherit it. That is why the
// values-only delete (sql.0 `deleteAll`) keeps the row: it holds the id down so
// a restore can never write into a series that has since been reassigned.
export async function deleteDpCompletely(id: string): Promise<number> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  let deleted = 0;
  for (const table of TS_TABLES) {
    for (;;) {
      const res = (await sendToSql(
        'query',
        `DELETE FROM ${SQL_DB_NAME}.${table} WHERE id = ${numId} LIMIT ${FULL_DELETE_CHUNK}`
      )) as { error?: unknown; result?: { affectedRows?: number } } | null;
      if (res && typeof res === 'object' && res.error) throw new Error(String(res.error));
      const n = Number(res?.result?.affectedRows ?? 0);
      deleted += n;
      if (n < FULL_DELETE_CHUNK) break;
    }
  }
  await querySql(`DELETE FROM ${SQL_DB_NAME}.datapoints WHERE id = ${numId}`);
  return deleted;
}

// Streams the raw rows of an orphan group. Orphans have no name left, so the
// lookup goes through the numeric id directly instead of datapoints.name.
export async function fetchOrphanRowsChunked(
  table: DumpTable,
  dbId: number,
  opts: ChunkedFetchOptions,
): Promise<DumpRow[]> {
  if (!(TS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown value table: ${table}`);
  }
  const numId = Math.floor(Number(dbId));
  if (!Number.isFinite(numId)) throw new Error(`Invalid db id: ${dbId}`);
  return fetchRowsChunked(table, numId, opts);
}

// --- Dedupe (consecutive duplicate values) ----------------------------------

// Normalizes a stored value for equality comparison, per datapoint type.
// The DB returns bools as 0/1 and numbers sometimes as strings, so compare
// on a canonical form instead of the raw driver value.
function normalizeVal(val: unknown, type: unknown): string | number {
  switch (String(type)) {
    case 'boolean':
      return val === true || val === 1 || String(val).trim().toLowerCase() === 'true' || String(val).trim() === '1' ? 1 : 0;
    case 'string':
      return val == null ? '' : String(val);
    default:
      return Number(val);
  }
}

export interface DedupeScanRow {
  ts: number;
  val: unknown;
  ack?: number;
  q?: number;
  src?: string | null;
}

// Picks the full row tuples of rows whose value equals the previous row's value.
// `rows` must be sorted by ts ascending; the first row of a run is kept, so a
// step chart drawn from the remaining rows is identical.
// `prev` carries the last value of the preceding chunk across chunk borders.
// Returning whole tuples (not just ts) lets the dedupe backup dump the deleted
// rows without a second pass over the table.
export function pickDuplicateRows(
  rows: DedupeScanRow[],
  type: unknown,
  prev?: { val: string | number } | null,
): { rows: DumpRow[]; last: { val: string | number } | null } {
  const dupes: DumpRow[] = [];
  let last = prev ?? null;
  for (const r of rows) {
    const v = normalizeVal(r.val, type);
    const same = last != null && (v === last.val || (typeof v === 'number' && typeof last.val === 'number' && Number.isNaN(v) && Number.isNaN(last.val)));
    if (same) dupes.push([r.ts, r.val, r.ack === 1 ? 1 : 0, Number(r.q ?? 0), r.src ?? null]);
    else last = { val: v };
  }
  return { rows: dupes, last };
}

const DEDUPE_SCAN_CHUNK = 50000;
const DEDUPE_DELETE_CHUNK = 1000;

// Scans the stored values of a datapoint (ts ascending) and returns the full
// rows of every entry that merely repeats the previous value.
// Pages via the PK index (id, ts) — no filesort, no window functions (the sql.0
// backend may run MariaDB < 10.2). Selects ack/q/source as well so a backup of
// the deleted rows needs no second pass over the table.
export async function findConsecutiveDuplicateRows(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<DumpRow[]> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) return [];
  const table = tsTableForType(type);
  let where = `n.id = ${numId}`;
  if (startTs != null && !Number.isNaN(startTs)) where += ` AND n.ts >= ${Math.floor(startTs)}`;
  if (endTs != null && !Number.isNaN(endTs)) where += ` AND n.ts <= ${Math.floor(endTs)}`;

  const all: DumpRow[] = [];
  let prev: { val: string | number } | null = null;
  let offset = 0;
  for (;;) {
    const rows = await querySql(
      `SELECT n.ts, n.val, n.ack, n.q, s.name AS src FROM ${SQL_DB_NAME}.${table} n ` +
      `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from ` +
      `WHERE ${where} ORDER BY n.ts ASC LIMIT ${DEDUPE_SCAN_CHUNK} OFFSET ${offset}`
    );
    if (rows.length === 0) break;
    const mapped: DedupeScanRow[] = rows.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        ts: Number(o.ts ?? 0),
        val: o.val,
        ack: Number(o.ack ?? 0),
        q: Number(o.q ?? 0),
        src: o.src == null ? null : String(o.src),
      };
    });
    const res = pickDuplicateRows(mapped, type, prev);
    all.push(...res.rows);
    prev = res.last;
    if (rows.length < DEDUPE_SCAN_CHUNK) break;
    offset += DEDUPE_SCAN_CHUNK;
  }
  return all;
}

// Timestamp-only view of findConsecutiveDuplicateRows, kept for the existing
// dedupe confirm/verify flow in DpValuesModal.
export async function findConsecutiveDuplicateTs(
  id: string,
  type: unknown,
  startTs?: number | null,
  endTs?: number | null,
): Promise<number[]> {
  return (await findConsecutiveDuplicateRows(id, type, startTs, endTs)).map((r) => r[0]);
}

// Deletes stored value rows of a datapoint by exact timestamp, in chunks.
// Raw DELETE via the sql.0 `query` command (same path as updateDpValue): the
// adapter's per-row delete sendTo needs a roundtrip per row and reports success
// even when it discarded the request.
export async function deleteDpValuesByTs(id: string, type: unknown, tsList: number[]): Promise<number> {
  if (tsList.length === 0) return 0;
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  const table = tsTableForType(type);
  for (let i = 0; i < tsList.length; i += DEDUPE_DELETE_CHUNK) {
    const chunk = tsList.slice(i, i + DEDUPE_DELETE_CHUNK).map((t) => Math.floor(t));
    await querySql(
      `DELETE FROM ${SQL_DB_NAME}.${table} WHERE id = ${numId} AND ts IN (${chunk.join(',')})`
    );
  }
  return tsList.length;
}

// --- SQL query builders -----------------------------------------------------
// Exposed so the UI can show/copy the query behind a view. These return a
// runnable, standalone statement — the live fetch may take a faster path
// (e.g. resolving the numeric id first) but the result set is identical.

// Standalone query reproducing the paginated value view of a datapoint.
// Joins on datapoints.name so it runs as-is (no pre-resolved numeric id).
export function buildDpValuesSql(
  id: string,
  type: unknown,
  limit: number,
  offset: number,
  startTs?: number | null,
  endTs?: number | null,
): string {
  const table = tsTableForType(type);
  const lim = Math.max(1, Math.floor(limit));
  const off = Math.max(0, Math.floor(offset));
  let where = `d.name = ${sqlQuote(id)}`;
  if (startTs != null && !Number.isNaN(startTs)) where += ` AND n.ts >= ${Math.floor(startTs)}`;
  if (endTs != null && !Number.isNaN(endTs)) where += ` AND n.ts <= ${Math.floor(endTs)}`;
  return (
    `SELECT n.ts, n.val, n.ack, n.q, s.name AS src\n` +
    `FROM ${SQL_DB_NAME}.${table} n\n` +
    `JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id\n` +
    `LEFT JOIN ${SQL_DB_NAME}.sources s ON s.id = n._from\n` +
    `WHERE ${where}\n` +
    `ORDER BY n.ts DESC LIMIT ${lim} OFFSET ${off}`
  );
}

// Standalone DELETE reproducing the "purge values older than cutoff" action.
// The live delete goes through the sql.0 `deleteRange` sendTo command; this is
// the equivalent statement, shown in the confirm dialog so the user can see
// exactly what will be removed.
export function buildDpPurgeSql(id: string, type: unknown, cutoffTs: number): string {
  const table = tsTableForType(type);
  const end = Math.floor(cutoffTs);
  return (
    `-- Equivalent statement (live delete uses the sql.0 deleteRange sendTo command)\n` +
    `DELETE n FROM ${SQL_DB_NAME}.${table} n\n` +
    `JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id\n` +
    `WHERE d.name = ${sqlQuote(id)}\n` +
    `  AND n.ts >= 1 AND n.ts <= ${end}`
  );
}

// Standalone statement reproducing the dedupe delete. The live delete resolves
// the numeric datapoints.id first and runs in chunks of DEDUPE_DELETE_CHUNK
// timestamps; this joins on datapoints.name so it runs as-is. Long ts lists are
// truncated for display — `maxTs` caps how many are spelled out.
export function buildDpDedupeSql(id: string, type: unknown, tsList: number[], maxTs = 20): string {
  const table = tsTableForType(type);
  const shown = tsList.slice(0, maxTs).map((t) => Math.floor(t));
  const rest = tsList.length - shown.length;
  const list = shown.join(', ') + (rest > 0 ? `, /* … +${rest} more */` : '');
  return (
    `-- Equivalent statement (live delete runs in chunks of ${DEDUPE_DELETE_CHUNK} timestamps)\n` +
    `DELETE n FROM ${SQL_DB_NAME}.${table} n\n` +
    `JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id\n` +
    `WHERE d.name = ${sqlQuote(id)}\n` +
    `  AND n.ts IN (${list})`
  );
}

// Best-effort standalone SQL reproducing the DB overview table. The live view
// is fetched via the adapter's `getDpOverview` sendTo command (not raw SQL);
// this query returns the same shape (id, type, last ts, value count) by
// aggregating the ts_* value tables.
export function buildDpOverviewSql(): string {
  return (
    `-- Equivalent query (live view uses the sql.0 getDpOverview sendTo command)\n` +
    `SELECT d.id AS dbId, d.name AS id, d.type,\n` +
    `       MAX(v.ts) AS ts, COUNT(*) AS count\n` +
    `FROM ${SQL_DB_NAME}.datapoints d\n` +
    `JOIN (\n` +
    `  SELECT id, ts FROM ${SQL_DB_NAME}.ts_number\n` +
    `  UNION ALL SELECT id, ts FROM ${SQL_DB_NAME}.ts_bool\n` +
    `  UNION ALL SELECT id, ts FROM ${SQL_DB_NAME}.ts_string\n` +
    `) v ON v.id = d.id\n` +
    `GROUP BY d.id, d.name, d.type\n` +
    `ORDER BY d.name`
  );
}

// Standalone query reproducing the orphan scan — same statement the live scan
// runs, just formatted for reading.
// Equivalent single-statement form of the scan, for pasting into a DB client.
// getOrphanValueRows() does NOT run this — it probes candidate ids instead,
// because this version needs a full index scan per ts_* table.
export function buildOrphanValuesSql(): string {
  const parts = TS_TABLES.map(
    (t) =>
      `SELECT '${t}' AS tbl, n.id AS dbId, COUNT(*) AS cnt,\n` +
      `       MIN(n.ts) AS firstTs, MAX(n.ts) AS lastTs\n` +
      `FROM ${SQL_DB_NAME}.${t} n\n` +
      `LEFT JOIN ${SQL_DB_NAME}.datapoints d ON d.id = n.id\n` +
      `WHERE d.id IS NULL\n` +
      `GROUP BY n.id`
  );
  return `${parts.join('\nUNION ALL\n')}\nORDER BY cnt DESC`;
}

// Statement behind "delete orphan group". The NOT EXISTS guard re-checks the
// missing datapoints row at delete time, so a datapoint recreated between scan
// and confirm keeps its history instead of losing it to a stale scan result.
export function buildOrphanDeleteSql(table: string, dbId: number): string {
  return (
    `DELETE n FROM ${SQL_DB_NAME}.${table} n\n` +
    `WHERE n.id = ${Math.floor(dbId)}\n` +
    `  AND NOT EXISTS (\n` +
    `    SELECT 1 FROM ${SQL_DB_NAME}.datapoints d WHERE d.id = n.id\n` +
    `  )`
  );
}

// Coerces a value to the SQL literal matching the datapoint type.
export function dpValueSql(type: unknown, val: unknown): string {
  switch (String(type)) {
    case 'boolean': {
      const truthy = val === true || val === 1 || String(val).trim().toLowerCase() === 'true' || String(val).trim() === '1';
      return truthy ? '1' : '0';
    }
    case 'string':
      return sqlQuote(String(val));
    default: {
      const n = Number(val);
      if (Number.isNaN(n)) throw new Error(`Invalid number: ${String(val)}`);
      return String(n);
    }
  }
}

// Updates a single stored value row (identified by datapoint + exact ts).
// Raw UPDATE via the sql.0 `query` command; value is coerced/quoted per type.
export async function updateDpValue(
  id: string,
  type: unknown,
  ts: number,
  val: unknown,
): Promise<void> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  const table = tsTableForType(type);
  await querySql(
    `UPDATE ${SQL_DB_NAME}.${table} SET val = ${dpValueSql(type, val)} WHERE id = ${numId} AND ts = ${Math.floor(ts)}`
  );
}

// Standalone INSERT reproducing the "add row" action, shown in the dialog.
// `_from` is 0 (no source) and `q` is 0 (good quality).
export function buildDpInsertSql(id: string, type: unknown, ts: number, val: unknown, ack: boolean): string {
  const table = tsTableForType(type);
  return (
    `INSERT INTO ${SQL_DB_NAME}.${table} (id, ts, val, ack, _from, q)\n` +
    `SELECT d.id, ${Math.floor(ts)}, ${dpValueSql(type, val)}, ${ack ? 1 : 0}, 0, 0\n` +
    `FROM ${SQL_DB_NAME}.datapoints d WHERE d.name = ${sqlQuote(id)}`
  );
}

// Inserts a new stored value row for a datapoint.
// The ts_* tables are keyed by (id, ts), so an existing timestamp is rejected
// up front with a clear message instead of a raw duplicate-key error.
export async function insertDpValue(
  id: string,
  type: unknown,
  ts: number,
  val: unknown,
  ack: boolean,
): Promise<void> {
  const numId = await resolveDpNumericId(id);
  if (numId == null || Number.isNaN(numId)) {
    throw new Error(`Datapoint not found in database: ${id}`);
  }
  const table = tsTableForType(type);
  const t = Math.floor(ts);
  const existing = await querySql(
    `SELECT ts FROM ${SQL_DB_NAME}.${table} WHERE id = ${numId} AND ts = ${t}`
  );
  if (existing.length > 0) {
    throw new Error(`A value already exists at this timestamp (${t})`);
  }
  await querySql(
    `INSERT INTO ${SQL_DB_NAME}.${table} (id, ts, val, ack, _from, q) ` +
    `VALUES (${numId}, ${t}, ${dpValueSql(type, val)}, ${ack ? 1 : 0}, 0, 0)`
  );
}

// --- Backup: restore -----------------------------------------------------------

// Rows per INSERT statement during a restore.
const RESTORE_INSERT_CHUNK = 5_000;

// Maps sources.name → sources.id, so a dump's source names can be written back
// as _from. Names missing from the table fall back to 0 — the restore never
// inserts into `sources`, that stays the adapter's business.
export async function getSourceIdMap(): Promise<Record<string, number>> {
  const rows = await querySql(`SELECT id, name FROM ${SQL_DB_NAME}.sources`);
  const map: Record<string, number> = {};
  for (const r of rows) {
    const o = r as { id?: unknown; name?: unknown };
    if (o.name != null) map[String(o.name)] = Number(o.id);
  }
  return map;
}

// Live datapoints index used to classify dump series before restoring.
export async function getLiveDpIndex(): Promise<{ names: Set<string>; ids: Set<number> }> {
  const rows = await querySql(`SELECT id, name FROM ${SQL_DB_NAME}.datapoints`);
  const names = new Set<string>();
  const ids = new Set<number>();
  for (const r of rows) {
    const o = r as { id?: unknown; name?: unknown };
    if (o.name != null) names.add(String(o.name));
    ids.add(Number(o.id));
  }
  return { names, ids };
}

export interface BatchInsertResult {
  inserted: number;
  skipped: number;
}

// Writes dump rows back into a value table.
//
// INSERT IGNORE relies on the (id, ts) primary key: rows that already exist stay
// untouched and are reported as skipped. That gives skip-and-report semantics
// atomically per block, without pulling half a million timestamps into the
// browser first and without a check-then-insert race in between.
//
// `rows` carry a source *name*; the caller resolves it to a numeric _from via
// getSourceIdMap() and passes the resolved map in.
export async function insertDpValuesBatch(
  table: DumpTable,
  type: unknown,
  numId: number,
  rows: DumpRow[],
  sourceIds: Record<string, number>,
  onProgress?: (done: number) => void,
  signal?: AbortSignal,
): Promise<BatchInsertResult & { unresolvedSources: number }> {
  if (!(TS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown value table: ${table}`);
  }
  const id = Math.floor(Number(numId));
  if (!Number.isFinite(id)) throw new Error(`Invalid db id: ${numId}`);

  let inserted = 0;
  let unresolvedSources = 0;

  for (let i = 0; i < rows.length; i += RESTORE_INSERT_CHUNK) {
    if (signal?.aborted) throw new Error('Restore aborted');
    const chunk = rows.slice(i, i + RESTORE_INSERT_CHUNK);
    const values = chunk.map((r) => {
      const src = r[4];
      let from = 0;
      if (src != null) {
        const resolved = sourceIds[src];
        if (resolved == null) unresolvedSources += 1;
        else from = resolved;
      }
      // dpValueSql quotes strings and coerces per type; it throws on values that
      // cannot be represented, which is what we want for untrusted file input.
      return `(${id}, ${Math.floor(r[0])}, ${dpValueSql(type, r[1])}, ${r[2] === 1 ? 1 : 0}, ${from}, ${Math.floor(r[3])})`;
    });
    const res = (await sendToSql(
      'query',
      `INSERT IGNORE INTO ${SQL_DB_NAME}.${table} (id, ts, val, ack, _from, q) VALUES ${values.join(', ')}`
    )) as { error?: unknown; result?: { affectedRows?: number } } | null;
    if (res && typeof res === 'object' && res.error) throw new Error(String(res.error));
    // MariaDB reports how many rows the statement actually wrote; the rest hit
    // the primary key and were ignored.
    const affected = Number(res?.result?.affectedRows ?? 0);
    inserted += affected;
    onProgress?.(i + chunk.length);
  }

  return { inserted, skipped: rows.length - inserted, unresolvedSources };
}

// Renames a datapoint in the sql.0 database by updating datapoints.name.
// History is preserved (ts_* tables reference the numeric datapoints.id, not the name).
// This only touches the DB — it does NOT rename the ioBroker object/state.
export async function renameDpInDb(oldId: string, newId: string): Promise<void> {
  // Guard: refuse if target name already exists (would create ambiguous rows).
  const existing = await querySql(
    `SELECT id FROM ${SQL_DB_NAME}.datapoints WHERE name = ${sqlQuote(newId)} LIMIT 1`
  );
  if (existing.length > 0) {
    throw new Error(`Target id already exists in database: ${newId}`);
  }
  await querySql(
    `UPDATE ${SQL_DB_NAME}.datapoints SET name = ${sqlQuote(newId)} WHERE name = ${sqlQuote(oldId)}`
  );
}

export async function getAllUnits(): Promise<string[]> {
  const all = await getAllObjectsCached();
  const units = new Set<string>();
  for (const obj of Object.values(all)) {
    if (obj.common?.unit) units.add(obj.common.unit);
  }
  return [...units].sort();
}

export async function getAllRoles(): Promise<string[]> {
  const all = await getAllObjectsCached();
  const roles = new Set<string>();
  for (const obj of Object.values(all)) {
    if (obj.common?.role) roles.add(obj.common.role);
  }
  return [...roles].sort();
}

export async function getRoomMap(): Promise<Record<string, string>> {
  const all = await getAllObjectsCached();
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
    const results = await Promise.all(
      ids.slice(i, i + CHUNK).map(id =>
        fetch(`${getBaseUrl()}/object/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )
    );
    for (const res of results) {
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
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
  const all = await getAllObjectsCached();
  if (all[id]) return all[id];
  return fetchApi<IoBrokerObject>(`/object/${encodeURIComponent(id)}`);
}

export async function getObjectFresh(id: string): Promise<IoBrokerObject> {
  return fetchApi<IoBrokerObject>(`/object/${encodeURIComponent(id)}`);
}

export async function getFunctionMap(): Promise<Record<string, string>> {
  const all = await getAllObjectsCached();
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
  // Fetch instances directly — getAllObjectsCached() omits system.adapter.* when includeIdPrefixes is set
  const instances = await fetchApi<Record<string, IoBrokerObject>>('/objects?type=instance');
  return Object.entries(instances)
    .filter(([id, o]) => id.startsWith('system.adapter.') && o.common?.enabled === true && o.common?.supportCustoms === true)
    .map(([id]) => {
      const instanceId = id.replace('system.adapter.', '');
      return { id: instanceId, adapterName: instanceId.replace(/\.\d+$/, '') };
    });
}

export async function getFunctionEnums(): Promise<Array<{ id: string; name: string }>> {
  const res = await getAllObjectsCached(); // cached — avoids a redundant /objects?type=enum round trip
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
  const res = await getAllObjectsCached();

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
  const res = await getAllObjectsCached();
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
  const res = await getAllObjectsCached(); // cached — avoids a redundant /objects?type=enum round trip
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
  const res = await getAllObjectsCached();

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
  const res = await getAllObjectsCached();
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
  const all = await getAllObjectsCached();
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

let _scriptSourcesCacheChecked = false;

// See `getStateObjectsFastCached` — same gate-once-per-page-lifetime pattern,
// caching the raw `/objects?type=script` payload (also large on real installs).
export async function getAllScriptSourcesCached(): Promise<string> {
  if (!_scriptSourcesCacheChecked) {
    _scriptSourcesCacheChecked = true;
    if (await shouldUsePersistedObjectsCache()) {
      const cached = await readObjectsCacheEntry('scriptSources');
      if (cached && typeof cached.data === 'string') return cached.data;
    }
  }
  const fresh = await fetchScriptSources();
  void writeObjectsCacheEntry('scriptSources', fresh);
  return fresh;
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
