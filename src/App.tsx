import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import ObjectEditModal from './components/ObjectEditModal';
import HistoryModal from './components/HistoryModal';
import NewDatapointModal from './components/NewDatapointModal';
import LanguageDropdown from './components/LanguageDropdown';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap, useFunctionMap, useRoomEnums, useFunctionEnums, useAliasMap } from './hooks/useStates';
import { hasHistory, hasSmartName } from './api/iobroker';
import type { SortKey, DateFormatSetting } from './components/StateList';
import { ALL_COLUMNS, DEFAULT_COLS, getColumnLabel } from './components/StateList';
import type { IoBrokerObject, IoBrokerState } from './types/iobroker';
import { Database, Mic2, ChevronDown, ChevronRight, Home, Zap, RotateCcw, Layers, X } from 'lucide-react';

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
const LS_APP_SETTINGS = 'iobroker-app-settings';
const DEFAULT_QUICK_PATTERNS = ['alias.0.*', 'javascript.0.*', '0_userdata.0.*'] as const;
const EMPTY_OBJECTS: Record<string, IoBrokerObject> = {};
const EMPTY_STATES: Record<string, IoBrokerState> = {};
const EMPTY_STRING_MAP: Record<string, string> = {};
const EMPTY_ALIAS_MAP = new Map<string, string[]>();

interface AppSettings {
  language: 'en' | 'de';
  dateFormat: DateFormatSetting;
  visibleCols: SortKey[];
  extraQuickFilters: string[];
}

function getDefaultAppSettings(): AppSettings {
  return {
    language: 'en',
    dateFormat: 'de',
    visibleCols: DEFAULT_COLS,
    extraQuickFilters: [],
  };
}

function normalizeQuickPattern(input: string): string {
  let v = input.trim();
  if (!v) return '';
  if (!v.endsWith('*')) v = `${v.replace(/\.+$/, '')}.*`;
  if (v.endsWith('*') && !v.endsWith('.*')) v = `${v.replace(/\*+$/, '')}.*`;
  return v;
}

function quickPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function loadAppSettings(): AppSettings {
  const fallback: AppSettings = getDefaultAppSettings();
  try {
    const raw = localStorage.getItem(LS_APP_SETTINGS);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const validLanguage = parsed.language === 'de' || parsed.language === 'en' ? parsed.language : 'en';
    const validCols = (parsed.visibleCols ?? []).filter((k): k is SortKey => ALL_COLUMNS.some((c) => c.key === k));
    const validDate = parsed.dateFormat === 'de' || parsed.dateFormat === 'us' || parsed.dateFormat === 'iso' ? parsed.dateFormat : 'de';
    const validExtra = (parsed.extraQuickFilters ?? []).map(normalizeQuickPattern).filter(Boolean);
    return {
      language: validLanguage,
      dateFormat: validDate,
      visibleCols: validCols.length > 0 ? validCols : DEFAULT_COLS,
      extraQuickFilters: [...new Set(validExtra.filter((p) => !DEFAULT_QUICK_PATTERNS.includes(p as typeof DEFAULT_QUICK_PATTERNS[number])))],
    };
  } catch {
    return fallback;
  }
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newQuickFilter, setNewQuickFilter] = useState('');
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => loadAppSettings());
  const [fulltextEnabled, setFulltextEnabled] = useState(false);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [newDatapointInitialId, setNewDatapointInitialId] = useState<string | null>(null);
  const prevTreeFilterRef = useRef<string | null>(null);

  const { data: stateObjectsData, error: objectsError } = useFilteredObjects(pattern, fulltextEnabled);
  const { data: allObjectsData } = useAllObjects();
  const { data: roomMapData } = useRoomMap();
  const { data: functionMapData } = useFunctionMap();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: functionEnums = [] } = useFunctionEnums();
  const stateObjects = stateObjectsData ?? EMPTY_OBJECTS;
  const allObjects = allObjectsData ?? EMPTY_OBJECTS;
  const roomMap = roomMapData ?? EMPTY_STRING_MAP;
  const functionMap = functionMapData ?? EMPTY_STRING_MAP;

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
  const { data: aliasMapData } = useAliasMap();
  const aliasMap = aliasMapData ?? EMPTY_ALIAS_MAP;
  const existingIds = useMemo(() => new Set(Object.keys(allObjects)), [allObjects]);
  const quickPatternOptions = useMemo(
    () => [...new Set([...DEFAULT_QUICK_PATTERNS, ...appSettings.extraQuickFilters])],
    [appSettings.extraQuickFilters]
  );
  const isEn = appSettings.language === 'en';

  const objectIds = useMemo(() => {
    let ids = Object.keys(stateObjects).sort();
    if (historyOnly) ids = ids.filter((id) => historyIds.has(id));
    if (smartOnly) ids = ids.filter((id) => smartIds.has(id));
    const rm = roomMap;
    const fm = functionMap;
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
    if (roomFilters.size > 0) ids = ids.filter((id) => roomFilters.has(roomMap[id]));
    if (functionFilters.size > 0) ids = ids.filter((id) => functionFilters.has(functionMap[id]));
    if (quickPatterns.size > 0) {
      const quickRegexes = [...quickPatterns].map(quickPatternToRegex);
      ids = ids.filter((id) => quickRegexes.some((rx) => rx.test(id)));
    }
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

  const openSettings = useCallback(() => {
    const latest = loadAppSettings();
    try {
      const rawCols = localStorage.getItem('iobroker-visible-cols');
      if (rawCols) {
        const parsed = JSON.parse(rawCols) as SortKey[];
        const valid = parsed.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
        if (valid.length > 0) latest.visibleCols = valid;
      }
    } catch {
      // ignore
    }
    setSettingsDraft(latest);
    setNewQuickFilter('');
    setSettingsOpen(true);
  }, []);

  const saveSettings = useCallback(() => {
    const nextCols = settingsDraft.visibleCols.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
    const normalizedExtra = [...new Set(settingsDraft.extraQuickFilters.map(normalizeQuickPattern).filter(Boolean))]
      .filter((p) => !DEFAULT_QUICK_PATTERNS.includes(p as typeof DEFAULT_QUICK_PATTERNS[number]));
    const next: AppSettings = {
      language: settingsDraft.language,
      dateFormat: settingsDraft.dateFormat,
      visibleCols: nextCols.length > 0 ? nextCols : DEFAULT_COLS,
      extraQuickFilters: normalizedExtra,
    };
    setAppSettings(next);
    localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
    localStorage.setItem('iobroker-visible-cols', JSON.stringify(next.visibleCols));
    const allowed = new Set([...DEFAULT_QUICK_PATTERNS, ...next.extraQuickFilters]);
    setQuickPatterns((prev) => new Set([...prev].filter((p) => allowed.has(p))));
    setSettingsOpen(false);
  }, [settingsDraft]);

  const handleLanguageChange = useCallback((language: 'en' | 'de') => {
    setAppSettings((prev) => {
      if (prev.language === language) return prev;
      const next = { ...prev, language };
      localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
      return next;
    });
    setSettingsDraft((prev) => ({ ...prev, language }));
  }, []);

  const addExtraQuickFilter = useCallback(() => {
    const normalized = normalizeQuickPattern(newQuickFilter);
    if (!normalized) return;
    if (DEFAULT_QUICK_PATTERNS.includes(normalized as typeof DEFAULT_QUICK_PATTERNS[number])) {
      setNewQuickFilter('');
      return;
    }
    setSettingsDraft((prev) => ({
      ...prev,
      extraQuickFilters: prev.extraQuickFilters.includes(normalized)
        ? prev.extraQuickFilters
        : [...prev.extraQuickFilters, normalized],
    }));
    setNewQuickFilter('');
  }, [newQuickFilter]);

  const resetSettingsToDefault = useCallback(() => {
    const defaults = getDefaultAppSettings();
    setSettingsDraft(defaults);
    setAppSettings(defaults);
    localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(defaults));
    localStorage.setItem('iobroker-visible-cols', JSON.stringify(defaults.visibleCols));
    setQuickPatterns(new Set());
    setNewQuickFilter('');
  }, []);

  const hasAnyFilter = useMemo(
    () =>
      pattern !== '*' ||
      historyOnly ||
      smartOnly ||
      roomFilters.size > 0 ||
      functionFilters.size > 0 ||
      quickPatterns.size > 0 ||
      !!treeFilter ||
      Object.values(colFilters).some((v) => v.trim() !== ''),
    [pattern, historyOnly, smartOnly, roomFilters, functionFilters, quickPatterns, treeFilter, colFilters]
  );

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
    setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
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

  const handleTreeScope = useCallback((prefix: string) => { setTreeFilter(prefix); setPage(0); }, []);
  const handleCreateDatapointAtPath = useCallback((prefix: string) => {
    setNewDatapointInitialId(prefix);
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
      onOpenSettings={openSettings}
      onLanguageChange={handleLanguageChange}
      language={appSettings.language}
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <SearchBar onSearch={handleSearch} initialPattern={pattern} onReset={resetAllFilters} fulltextEnabled={fulltextEnabled} onFulltextChange={setFulltextEnabled} language={appSettings.language} />
            {hasAnyFilter && (
              <button
                onClick={resetAllFilters}
                className="flex items-center justify-center gap-1.5 w-full px-2 py-1 text-xs rounded text-red-500 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 transition-colors"
                title={isEn ? 'Reset all filters' : 'Alle Filter zurücksetzen'}
              >
                <RotateCcw size={11} />
                {isEn ? 'Reset filters' : 'Filter zurücksetzen'}
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
                {isEn ? 'Quick filters' : 'Schnellfilter'}
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
                {quickPatternOptions.map((q) => (
                  <button
                    key={q}
                    onClick={() => { const adding = !quickPatterns.has(q); setQuickPatterns(prev => { const n = new Set(prev); adding ? n.add(q) : n.delete(q); return n; }); setPage(0); if (adding) setTreeExpandSignal(s => ({ depth: 2, seq: (s?.seq ?? 0) + 1 })); }}
                    className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                      quickPatterns.has(q)
                        ? `bg-gray-200 dark:bg-gray-700 ${(QUICK_COLORS[q] ?? 'text-blue-600 dark:text-blue-400')} hover:bg-gray-300 dark:hover:bg-gray-600`
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
                  {isEn ? 'Rooms' : 'Räume'}
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
                  {isEn ? 'Functions' : 'Funktionen'}
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
              allObjects={allObjects}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearch={handleSearch}
              onTreeScope={handleTreeScope}
              onCreateAtPath={handleCreateDatapointAtPath}
              historyOnly={historyOnly}
              smartOnly={smartOnly}
              historyIds={historyIds}
              smartIds={smartIds}
              expandToDepth={treeExpandSignal}
              treeFilter={treeFilter}
              onClearTreeFilter={handleClearTreeFilter}
              language={appSettings.language}
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

        {selectedId && allObjects[selectedId] && (
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
            unit={allObjects[historyModalId]?.common?.unit}
            objects={allObjects}
            language={appSettings.language}
            onClose={() => setHistoryModalId(null)}
          />
        )}
        {newDatapointInitialId !== null && (
          <NewDatapointModal
            onClose={() => setNewDatapointInitialId(null)}
            existingIds={existingIds}
            initialId={newDatapointInitialId}
            language={appSettings.language}
          />
        )}
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSettingsOpen(false)}>
            <div
              className="w-full max-w-2xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'Settings' : 'Einstellungen'}</h3>
                <button onClick={() => setSettingsOpen(false)} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X size={14} />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Language' : 'Sprache'}</span>
                  <LanguageDropdown value={settingsDraft.language} onChange={(language) => setSettingsDraft((prev) => ({ ...prev, language }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Date format' : 'Datumsformat'}</span>
                  <select
                    value={settingsDraft.dateFormat}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, dateFormat: e.target.value as DateFormatSetting }))}
                    className="w-56 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="de">DD.MM.YYYY HH:mm:ss</option>
                    <option value="us">MM/DD/YYYY HH:mm:ss</option>
                    <option value="iso">YYYY-MM-DD HH:mm:ss</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Visible columns' : 'Angezeigte Spalten'}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_COLUMNS.map(({ key }) => {
                      const checked = settingsDraft.visibleCols.includes(key);
                      return (
                        <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSettingsDraft((prev) => {
                              const next = checked
                                ? prev.visibleCols.filter((k) => k !== key)
                                : [...prev.visibleCols, key];
                              return { ...prev, visibleCols: next.length > 0 ? next : prev.visibleCols };
                            })}
                            className="w-3.5 h-3.5 accent-blue-500"
                          />
                          <span>{getColumnLabel(key, appSettings.language)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Additional quick filters' : 'Zusätzliche Schnellfilter'}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newQuickFilter}
                      onChange={(e) => setNewQuickFilter(e.target.value)}
                      placeholder={isEn ? 'e.g. hm-rpc.0.*' : 'z.B. hm-rpc.0.*'}
                      className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                    />
                    <button
                      onClick={addExtraQuickFilter}
                      className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      {isEn ? 'Add' : 'Hinzufügen'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {settingsDraft.extraQuickFilters.length === 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{isEn ? 'No additional filters' : 'Keine zusätzlichen Filter'}</span>
                    )}
                    {settingsDraft.extraQuickFilters.map((patternItem) => (
                      <span key={patternItem} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-200/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
                        {patternItem}
                        <button
                          onClick={() => setSettingsDraft((prev) => ({ ...prev, extraQuickFilters: prev.extraQuickFilters.filter((p) => p !== patternItem) }))}
                          className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                <button
                  onClick={resetSettingsToDefault}
                  className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {isEn ? 'Reset settings' : 'Einstellungen zurücksetzen'}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isEn ? 'Cancel' : 'Abbrechen'}
                  </button>
                  <button
                    onClick={saveSettings}
                    className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    {isEn ? 'Save' : 'Speichern'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <StateList
            ids={pageIds}
            states={stateValues ?? EMPTY_STATES}
            objects={stateObjects}
            roomMap={roomMap}
            functionMap={functionMap}
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
            dateFormat={appSettings.dateFormat}
            settingsVisibleCols={appSettings.visibleCols}
            language={appSettings.language}
          />
        </div>

        <div className="py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full gap-2">
            <div className="flex items-center justify-start">
              {totalPages > 1 && (
                <div className="flex items-center justify-start gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    {isEn ? 'Previous' : 'Zurück'}
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {isEn ? 'Page' : 'Seite'} {page + 1} {isEn ? 'of' : 'von'} {totalPages} ({pageStart + 1}–{Math.min(pageStart + pageSize, totalCount)} {isEn ? 'of' : 'von'} {totalCount})
                  </span>
                </div>
              )}
            </div>
            <div className="text-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isEn ? 'Datapoints' : 'Datenpunkte'}: <span className="text-gray-700 dark:text-gray-200">{pageIds.length}</span> {isEn ? 'of' : 'von'} <span className="text-gray-700 dark:text-gray-200">{totalCount}</span>
              </span>
            </div>
            <div className="flex items-center justify-end gap-2">
              {totalPages > 1 && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{isEn ? 'Rows:' : 'Zeilen:'}</span>
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
                  <div className="flex justify-end">
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      {isEn ? 'Next' : 'Weiter'}
                    </button>
                  </div>
                </>
              )}
            </div>
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
