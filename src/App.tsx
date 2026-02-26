import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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

const QUICK_COLORS: Record<string, string> = {
  'alias.0.*':       'text-green-600 dark:text-green-400',
  'javascript.0.*':  'text-yellow-600 dark:text-yellow-500',
  '0_userdata.0.*':  'text-indigo-600 dark:text-indigo-400',
};
const ENUM_COLORS = [
  'text-sky-600 dark:text-sky-400',
  'text-violet-600 dark:text-violet-400',
  'text-pink-600 dark:text-pink-400',
  'text-teal-600 dark:text-teal-400',
  'text-orange-600 dark:text-orange-400',
  'text-rose-600 dark:text-rose-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-lime-600 dark:text-lime-500',
];

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
  const [sidebarToggleSeq, setSidebarToggleSeq] = useState(0);
  const [treeFilter, setTreeFilter] = useState<string | null>(null);
  const [roomFilters, setRoomFilters] = useState<Set<string>>(new Set());
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [functionFilters, setFunctionFilters] = useState<Set<string>>(new Set());
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [quickPatterns, setQuickPatterns] = useState<Set<string>>(new Set());
  const [quickOpen, setQuickOpen] = useState(false);
  const [fulltextEnabled, setFulltextEnabled] = useState(true);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const prevTreeFilterRef = useRef<string | null>(null);

  const { data: stateObjects, error: objectsError } = useFilteredObjects(pattern, fulltextEnabled);
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
    if (roomFilters.size > 0) ids = ids.filter((id) => roomFilters.has((roomMap || {})[id]));
    if (functionFilters.size > 0) ids = ids.filter((id) => functionFilters.has((functionMap || {})[id]));
    if (quickPatterns.size > 0) { const pfx = [...quickPatterns].map(q => q.slice(0, -1)); ids = ids.filter(id => pfx.some(p => id.startsWith(p))); }
    return ids;
  }, [stateObjects, historyOnly, historyIds, smartOnly, smartIds, colFilters, roomMap, functionMap, aliasMap, roomFilters, functionFilters, quickPatterns]);

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

  const handleSearch = useCallback((newPattern: string) => {
    setPattern(newPattern);
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setRoomFilters(new Set());
    setFunctionFilters(new Set());
    setQuickPatterns(new Set());
  }, []);

  const handleColFilterChange = useCallback((filters: Partial<Record<SortKey, string>>) => {
    setColFilters(filters);
    setPage(0);
  }, []);

  const hasAnyFilter = pattern !== '*' || historyOnly || smartOnly || roomFilters.size > 0 || functionFilters.size > 0 || quickPatterns.size > 0 || !!treeFilter || Object.values(colFilters).some((v) => v.trim() !== '');

  const resetAllFilters = useCallback(() => {
    setPattern('*');
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setRoomFilters(new Set());
    setFunctionFilters(new Set());
    setQuickPatterns(new Set());
    setTreeFilter(null);
    setColFilters({});
  }, []);

  const handleNavigateTo = useCallback((ids: string[]) => {
    const pat = ids.length === 1 ? ids[0] : 'alias.0.*';
    setPattern(pat);
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setColFilters({});
  }, []);

  const handleClearTreeFilter = useCallback(() => {
    setTreeFilter(null);
    setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
  }, []);
  const handleSidebarToggle = useCallback(() => setSidebarToggleSeq((s) => s + 1), []);

  useEffect(() => {
    const prev = prevTreeFilterRef.current;
    if (prev && !treeFilter) {
      setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
    }
    prevTreeFilterRef.current = treeFilter;
  }, [treeFilter]);

  return (
    <Layout
      onSidebarToggle={handleSidebarToggle}
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <SearchBar onSearch={handleSearch} initialPattern={pattern} onReset={resetAllFilters} fulltextEnabled={fulltextEnabled} onFulltextChange={setFulltextEnabled} />
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
                {quickPatterns.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] truncate max-w-[80px]">{quickPatterns.size === 1 ? [...quickPatterns][0] : quickPatterns.size}</span>
                )}
                {historyOnly && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">History</span>}
                {smartOnly && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">Smart</span>}
              </span>
              {quickOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {quickOpen && (
              <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5 justify-center">
                {(['alias.0.*', 'javascript.0.*', '0_userdata.0.*'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => { const adding = !quickPatterns.has(q); setQuickPatterns(prev => { const n = new Set(prev); adding ? n.add(q) : n.delete(q); return n; }); setPage(0); if (adding) setTreeExpandSignal(s => ({ depth: 2, seq: (s?.seq ?? 0) + 1 })); }}
                    className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                      quickPatterns.has(q)
                        ? `bg-gray-200 dark:bg-gray-700 ${QUICK_COLORS[q]} hover:bg-gray-300 dark:hover:bg-gray-600`
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {q}
                  </button>
                ))}
                <button
                  onClick={() => { setHistoryOnly(!historyOnly); setPage(0); }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1 ${
                    historyOnly
                      ? 'bg-gray-200 dark:bg-gray-700 text-purple-600 dark:text-purple-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  <Database size={11} /> History {historyIds.size}
                </button>
                <button
                  onClick={() => { setSmartOnly(!smartOnly); setPage(0); }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1 ${
                    smartOnly
                      ? 'bg-gray-200 dark:bg-gray-700 text-orange-600 dark:text-orange-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
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
                  {roomFilters.size > 0 && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{roomFilters.size === 1 ? [...roomFilters][0] : roomFilters.size}</span>}
                </span>
                {roomsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {roomsOpen && (
                <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5 justify-center">
                  {roomEnums.map(({ name }, i) => (
                    <button
                      key={name}
                      onClick={() => { setRoomFilters(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; }); setPage(0); }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        roomFilters.has(name)
                          ? `bg-gray-200 dark:bg-gray-700 ${ENUM_COLORS[i % ENUM_COLORS.length]} hover:bg-gray-300 dark:hover:bg-gray-600`
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
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
                  {functionFilters.size > 0 && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{functionFilters.size === 1 ? [...functionFilters][0] : functionFilters.size}</span>}
                </span>
                {functionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {functionsOpen && (
                <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-1.5 justify-center">
                  {functionEnums.map(({ name }, i) => (
                    <button
                      key={name}
                      onClick={() => { setFunctionFilters(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; }); setPage(0); }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        functionFilters.has(name)
                          ? `bg-gray-200 dark:bg-gray-700 ${ENUM_COLORS[i % ENUM_COLORS.length]} hover:bg-gray-300 dark:hover:bg-gray-600`
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
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
              historyOnly={historyOnly}
              smartOnly={smartOnly}
              historyIds={historyIds}
              smartIds={smartIds}
              expandToDepth={treeExpandSignal}
              treeFilter={treeFilter}
              onClearTreeFilter={handleClearTreeFilter}
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
            onClearTreeFilter={handleClearTreeFilter}
            sidebarToggleSeq={sidebarToggleSeq}
            fulltextEnabled={fulltextEnabled}
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
