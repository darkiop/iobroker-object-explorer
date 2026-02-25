import { useState, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import ObjectEditModal from './components/ObjectEditModal';
import HistoryModal from './components/HistoryModal';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap, useFunctionMap, useRoomEnums, useFunctionEnums, useAliasMap } from './hooks/useStates';
import { hasHistory, hasSmartName } from './api/iobroker';
import type { SortKey } from './components/StateList';
import { Database, Mic2, ChevronDown, ChevronRight, Home, Zap, RotateCcw, Layers } from 'lucide-react';

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
  const [treeFilter, setTreeFilter] = useState<string | null>(null);
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [functionFilter, setFunctionFilter] = useState<string | null>(null);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);

  const { data: stateObjects, error: objectsError } = useFilteredObjects(pattern);
  const { data: allObjects } = useAllObjects();
  const { data: roomMap } = useRoomMap();
  const { data: functionMap } = useFunctionMap();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: functionEnums = [] } = useFunctionEnums();

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
  // Cached in QueryClient via useAliasMap (select on ['objects','all'])
  const { data: aliasMap = new Map() } = useAliasMap();

  const objectIds = useMemo(() => {
    let ids = stateObjects ? Object.keys(stateObjects).sort() : [];
    if (historyOnly) ids = ids.filter((id) => historyIds.has(id));
    if (smartOnly) ids = ids.filter((id) => smartIds.has(id));
    const rm = roomMap || {};
    const fm = functionMap || {};
    if (colFilters.id?.trim())       { const f = colFilters.id.trim().toLowerCase();       ids = ids.filter((id) => id.toLowerCase().includes(f)); }
    if (colFilters.name?.trim())     { const f = colFilters.name.trim().toLowerCase();      ids = ids.filter((id) => { const n = stateObjects![id]?.common?.name; const s = typeof n === 'string' ? n : (n && (n.de || n.en || Object.values(n)[0])) || ''; return s.toLowerCase().includes(f); }); }
    if (colFilters.room?.trim())     { const f = colFilters.room.trim().toLowerCase();      ids = ids.filter((id) => (rm[id] || '').toLowerCase().includes(f)); }
    if (colFilters.function?.trim()) { const f = colFilters.function.trim().toLowerCase();  ids = ids.filter((id) => (fm[id] || '').toLowerCase().includes(f)); }
    if (colFilters.role?.trim())     { const f = colFilters.role.trim().toLowerCase();      ids = ids.filter((id) => (stateObjects![id]?.common?.role || '').toLowerCase().includes(f)); }
    if (colFilters.unit?.trim())     { const f = colFilters.unit.trim().toLowerCase();      ids = ids.filter((id) => (stateObjects![id]?.common?.unit || '').toLowerCase().includes(f)); }
    if (colFilters.write === '1')   ids = ids.filter((id) => stateObjects![id]?.common?.write === false);
    if (colFilters.history === '1') ids = ids.filter((id) => historyIds.has(id));
    if (colFilters.smart === '1')   ids = ids.filter((id) => smartIds.has(id));
    if (colFilters.alias === '1')   ids = ids.filter((id) => aliasMap.has(id) || !!(stateObjects![id]?.common?.alias?.id));
    if (roomFilter) ids = ids.filter((id) => (roomMap || {})[id] === roomFilter);
    if (functionFilter) ids = ids.filter((id) => (functionMap || {})[id] === functionFilter);
    return ids;
  }, [stateObjects, historyOnly, historyIds, smartOnly, smartIds, colFilters, roomMap, functionMap, aliasMap, roomFilter, functionFilter]);

  const tableIds = useMemo(
    () => treeFilter ? objectIds.filter((id) => id.startsWith(treeFilter)) : objectIds,
    [objectIds, treeFilter]
  );

  const totalCount = tableIds.length;
  const pageStart = page * pageSize;
  const pageIds = useMemo(
    () => tableIds.slice(pageStart, pageStart + pageSize),
    [tableIds, pageStart, pageSize]
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
    setRoomFilter(null);
    setFunctionFilter(null);
  };

  function handleColFilterChange(filters: Partial<Record<SortKey, string>>) {
    setColFilters(filters);
    setPage(0);
  }

  const hasAnyFilter = pattern !== '*' || historyOnly || smartOnly || !!roomFilter || !!functionFilter || !!treeFilter || Object.values(colFilters).some((v) => v.trim() !== '');

  function resetAllFilters() {
    setPattern('*');
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setRoomFilter(null);
    setFunctionFilter(null);
    setTreeFilter(null);
    setColFilters({});
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
            {hasAnyFilter && (
              <button
                onClick={resetAllFilters}
                className="flex items-center justify-center gap-1.5 w-full px-2 py-1 text-xs rounded text-red-500 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 transition-colors"
                title="Alle Filter zurücksetzen"
              >
                <RotateCcw size={11} />
                Filter zurücksetzen
              </button>
            )}
          </div>
          <div className="border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setQuickOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Layers size={12} />
                Schnellfilter
                {(['alias.0.*', 'javascript.0.*', '0_userdata.0.*'].includes(pattern)) && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] truncate max-w-[80px]">{pattern}</span>
                )}
                {historyOnly && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">History</span>}
                {smartOnly && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">Smart</span>}
              </span>
              {quickOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {quickOpen && (
              <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5">
                {(['alias.0.*', 'javascript.0.*', '0_userdata.0.*'] as const).map((q) => (
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
                <button
                  onClick={() => { setHistoryOnly(!historyOnly); setPage(0); }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1 ${
                    historyOnly
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <Database size={11} /> History {historyIds.size}
                </button>
                <button
                  onClick={() => { setSmartOnly(!smartOnly); setPage(0); }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1 ${
                    smartOnly
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <Mic2 size={11} /> SmartName {smartIds.size}
                </button>
              </div>
            )}
          </div>
          {roomEnums.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setRoomsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Home size={12} />
                  Räume
                  {roomFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{roomFilter}</span>}
                </span>
                {roomsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {roomsOpen && (
                <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5">
                  {roomEnums.map(({ name }) => (
                    <button
                      key={name}
                      onClick={() => { setRoomFilter(roomFilter === name ? null : name); setPage(0); }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        roomFilter === name
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {functionEnums.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setFunctionsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Zap size={12} />
                  Funktionen
                  {functionFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{functionFilter}</span>}
                </span>
                {functionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {functionsOpen && (
                <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5">
                  {functionEnums.map(({ name }) => (
                    <button
                      key={name}
                      onClick={() => { setFunctionFilter(functionFilter === name ? null : name); setPage(0); }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        functionFilter === name
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1">
            <StateTree
              stateIds={objectIds}
              allObjects={allObjects || {}}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearch={handleSearch}
              onTreeSelect={(prefix) => { setTreeFilter(prefix); setPage(0); }}
              historyOnly={historyOnly}
              smartOnly={smartOnly}
              historyIds={historyIds}
              smartIds={smartIds}
              expandToDepth={treeExpandSignal}
              treeFilter={treeFilter}
              onClearTreeFilter={() => setTreeFilter(null)}
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

        {selectedId && allObjects?.[selectedId] && (
          <ObjectEditModal
            id={selectedId}
            obj={allObjects[selectedId]}
            onClose={() => setSelectedId(null)}
            onOpenHistory={hasHistory(allObjects[selectedId]) ? () => setHistoryModalId(selectedId) : undefined}
          />
        )}
        {historyModalId && (
          <HistoryModal
            stateId={historyModalId}
            unit={allObjects?.[historyModalId]?.common?.unit}
            objects={allObjects ?? undefined}
            onClose={() => setHistoryModalId(null)}
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <StateList
            ids={pageIds}
            totalCount={totalCount}
            states={stateValues || {}}
            objects={stateObjects || {}}
            roomMap={roomMap || {}}
            functionMap={functionMap || {}}
            selectedId={selectedId}
            onSelect={setSelectedId}
            colFilters={colFilters}
            onColFilterChange={handleColFilterChange}
            pattern={pattern}
            aliasMap={aliasMap}
            onNavigateTo={handleNavigateTo}
            exportIds={tableIds}
            treeFilter={treeFilter}
            onClearTreeFilter={() => setTreeFilter(null)}
          />
        </div>

        <div className="grid grid-cols-3 items-center py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
          {/* Left: Zurück + Zeilenauswahl */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || totalPages <= 1}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Zurück
            </button>
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
          </div>
          {/* Center: Paginierungsinfo */}
          <div className="text-center">
            {totalPages > 1 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Seite {page + 1} von {totalPages} ({pageStart + 1}–{Math.min(pageStart + pageSize, totalCount)} von {totalCount})
              </span>
            )}
          </div>
          {/* Right: Weiter */}
          <div className="flex justify-end">
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || totalPages <= 1}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Weiter
            </button>
          </div>
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
