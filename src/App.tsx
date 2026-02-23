import { useState, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import StateDetail from './components/StateDetail';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap } from './hooks/useStates';
import { hasHistory, hasSmartName, buildAliasReverseMap } from './api/iobroker';
import type { SortKey } from './components/StateList';
import { Database, Mic2, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];
const LS_PAGE_SIZE = 'iobroker-page-size';

function AppContent() {
  const [pattern, setPattern] = useState('*');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem(LS_PAGE_SIZE) ?? '', 10);
    return PAGE_SIZE_OPTIONS.includes(stored) ? stored : 50;
  });
  const [historyOnly, setHistoryOnly] = useState(false);
  const [smartOnly, setSmartOnly] = useState(false);
  const [colFilters, setColFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [treeExpandSignal, setTreeExpandSignal] = useState<{ depth: number; seq: number } | undefined>(undefined);

  const { data: stateObjects, error: objectsError } = useFilteredObjects(pattern);
  const { data: allObjects } = useAllObjects();
  const { data: roomMap } = useRoomMap();

  const historyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(stateObjects ?? {})) {
      if (hasHistory(obj)) set.add(id);
    }
    return set;
  }, [stateObjects]);

  const smartIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(stateObjects ?? {})) {
      if (hasSmartName(obj)) set.add(id);
    }
    return set;
  }, [stateObjects]);

  // Reverse alias map: non-alias data point ID → [alias.0.* IDs that point to it]
  const aliasMap = useMemo(() => buildAliasReverseMap(allObjects ?? {}), [allObjects]);

  const objectIds = useMemo(() => {
    let ids = stateObjects ? Object.keys(stateObjects).sort() : [];
    if (historyOnly) ids = ids.filter((id) => historyIds.has(id));
    if (smartOnly) ids = ids.filter((id) => smartIds.has(id));
    const rm = roomMap || {};
    if (colFilters.id?.trim())   { const f = colFilters.id.trim().toLowerCase();   ids = ids.filter((id) => id.toLowerCase().includes(f)); }
    if (colFilters.name?.trim()) { const f = colFilters.name.trim().toLowerCase();  ids = ids.filter((id) => { const n = stateObjects![id]?.common?.name; const s = typeof n === 'string' ? n : (n && (n.de || n.en || Object.values(n)[0])) || ''; return s.toLowerCase().includes(f); }); }
    if (colFilters.room?.trim()) { const f = colFilters.room.trim().toLowerCase();  ids = ids.filter((id) => (rm[id] || '').toLowerCase().includes(f)); }
    if (colFilters.role?.trim()) { const f = colFilters.role.trim().toLowerCase();  ids = ids.filter((id) => (stateObjects![id]?.common?.role || '').toLowerCase().includes(f)); }
    if (colFilters.unit?.trim()) { const f = colFilters.unit.trim().toLowerCase();  ids = ids.filter((id) => (stateObjects![id]?.common?.unit || '').toLowerCase().includes(f)); }
    if (colFilters.write === '1')   ids = ids.filter((id) => stateObjects![id]?.common?.write === false);
    if (colFilters.history === '1') ids = ids.filter((id) => historyIds.has(id));
    if (colFilters.smart === '1')   ids = ids.filter((id) => smartIds.has(id));
    if (colFilters.alias === '1')   ids = ids.filter((id) => aliasMap.has(id) || !!(stateObjects![id]?.common?.alias?.id));
    return ids;
  }, [stateObjects, historyOnly, historyIds, smartOnly, smartIds, colFilters, roomMap, aliasMap]);

  const totalCount = objectIds.length;
  const pageStart = page * pageSize;
  const pageIds = useMemo(
    () => objectIds.slice(pageStart, pageStart + pageSize),
    [objectIds, pageStart, pageSize]
  );
  const totalPages = Math.ceil(totalCount / pageSize);

  const { data: stateValues } = useStateValues(pageIds);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = (newPattern: string) => {
    setPattern(newPattern);
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
  };

  function handleColFilterChange(filters: Partial<Record<SortKey, string>>) {
    setColFilters(filters);
    setPage(0);
  }

  function handleNavigateTo(ids: string[]) {
    // Navigate to show specific alias ID(s) or source data point
    const pattern = ids.length === 1 ? ids[0] : 'alias.0.*';
    setPattern(pattern);
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setColFilters({});
  }

  return (
    <Layout
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <SearchBar onSearch={handleSearch} initialPattern={pattern} />
            <div className="flex items-center gap-1.5 flex-wrap">
              {['alias.0.*', 'javascript.0.*', '0_userdata.0.*'].map((q) => (
                <button
                  key={q}
                  onClick={() => { handleSearch(pattern === q ? '*' : q); if (pattern !== q) setTreeExpandSignal(s => ({ depth: 2, seq: (s?.seq ?? 0) + 1 })); }}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                    pattern === q
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setHistoryOnly(!historyOnly); setPage(0); }}
                className={`flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded ${
                  historyOnly
                    ? 'bg-blue-600/20 text-blue-600 border border-blue-500/40 dark:text-blue-300'
                    : 'bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700'
                }`}
              >
                <Database size={12} className="shrink-0" />
                <span className="truncate">History</span>
                <span className={`shrink-0 ${historyOnly ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{historyIds.size}</span>
              </button>
              <button
                onClick={() => { setSmartOnly(!smartOnly); setPage(0); }}
                className={`flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded ${
                  smartOnly
                    ? 'bg-violet-600/20 text-violet-600 border border-violet-500/40 dark:text-violet-300'
                    : 'bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700'
                }`}
              >
                <Mic2 size={12} className="shrink-0" />
                <span className="truncate">SmartName</span>
                <span className={`shrink-0 ${smartOnly ? 'text-violet-500 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`}>{smartIds.size}</span>
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setTreeExpandSignal(s => ({ depth: 9999, seq: (s?.seq ?? 0) + 1 }))}
                className="flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700"
                title="Alle aufklappen"
              >
                <ChevronsUpDown size={13} />
                Aufklappen
              </button>
              <button
                onClick={() => setTreeExpandSignal(s => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }))}
                className="flex items-center justify-center gap-1 flex-1 px-2 py-1 text-xs rounded bg-gray-200/50 text-gray-500 border border-gray-300/50 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700"
                title="Alle zuklappen"
              >
                <ChevronsDownUp size={13} />
                Zuklappen
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <StateTree
              stateIds={objectIds}
              allObjects={allObjects || {}}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearch={handleSearch}
              historyOnly={historyOnly}
              smartOnly={smartOnly}
              historyIds={historyIds}
              smartIds={smartIds}
              expandToDepth={treeExpandSignal}
            />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        {objectsError && (
          <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg p-3 text-sm dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
            Fehler: {objectsError.message}
          </div>
        )}

        {selectedId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedId(null)}
          >
            <div
              className="w-full max-w-5xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <StateDetail stateId={selectedId} onClose={() => setSelectedId(null)} />
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <StateList
            ids={pageIds}
            totalCount={totalCount}
            states={stateValues || {}}
            objects={stateObjects || {}}
            roomMap={roomMap || {}}
            selectedId={selectedId}
            onSelect={setSelectedId}
            colFilters={colFilters}
            onColFilterChange={handleColFilterChange}
            pattern={pattern}
            aliasMap={aliasMap}
            onNavigateTo={handleNavigateTo}
          />
        </div>

        <div className="flex items-center justify-between py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">Zeilen:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setPageSize(v);
                setPage(0);
                localStorage.setItem(LS_PAGE_SIZE, String(v));
              }}
              className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Zurück
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Seite {page + 1} von {totalPages} ({pageStart + 1}–{Math.min(pageStart + pageSize, totalCount)} von {totalCount})
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Weiter
              </button>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
