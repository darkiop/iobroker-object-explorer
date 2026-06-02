import { useMemo, useEffect, useCallback, useRef, lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import ObjectEditModal from './components/ObjectEditModal';
const HistoryModal = lazy(() => import('./components/HistoryModal'));
import NewDatapointModal from './components/NewDatapointModal';
import HelpModal from './components/HelpModal';
import EnumManagerModal from './components/EnumManagerModal';
import AliasReplaceModal from './components/AliasReplaceModal';
import AutoCreateAliasModal from './components/AutoCreateAliasModal';
import HostConnectedButton from './components/HostConnectedButton';
import SettingsModal from './components/SettingsModal';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap, useFunctionMap, useRoomEnums, useFunctionEnums, useAliasMap } from './hooks/useStates';
import { useApiConnectivity } from './hooks/useApiConnectivity';
import { hasHistory, hasSmartName, hasCustomEnabled } from './api/iobroker';
import type { StateListHandle } from './components/StateList';
import { filterObjectIds } from './utils/filterObjectIds';
import type { IoBrokerObject, IoBrokerState } from './types/iobroker';
import { Database, Mic2, ChevronDown, ChevronRight, Home, Zap, RotateCcw, RefreshCw, Layers, X, Check, Bookmark, AlertTriangle, Tag, ArrowLeft, ArrowRight } from 'lucide-react';
import { getTypeColor } from './utils/typeColor';
import { FilterContextProvider, useFilterContext } from './context/FilterContext';
import { SelectionContextProvider, useSelectionContext } from './context/SelectionContext';
import { UIContextProvider, useUIContext, DEFAULT_QUICK_PATTERNS } from './context/UIContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

const EMPTY_OBJECTS: Record<string, IoBrokerObject> = {};
const EMPTY_STATES: Record<string, IoBrokerState> = {};
const EMPTY_STRING_MAP: Record<string, string> = {};
const EMPTY_ALIAS_MAP = new Map<string, string[]>();

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
  const stateListRef = useRef<StateListHandle>(null);

  // ── Filter Context ───────────────────────────────────────────────────────
  const {
    pattern, page, setPage, historyOnly, setHistoryOnly, smartOnly, setSmartOnly,
    danglingAliasFilter, setDanglingAliasFilter,
    colFilters, roomFilters, functionFilters, quickPatterns,
    treeFilter,
    fulltextEnabled, exactEnabled, idSuggestEnabled, setIdSuggestEnabled,
    idFilter, nameFilter, descFilter,
    savedFiltersList, savedFiltersOpen, setSavedFiltersOpen,
    saveFilterPromptOpen, setSaveFilterPromptOpen, saveFilterName, setSaveFilterName,
    quickOpen, setQuickOpen, roomsOpen, setRoomsOpen, functionsOpen, setFunctionsOpen,
    typesOpen, setTypesOpen,
    basePattern, roomFilter, functionFilter, typeFilter, hasAnyFilter,
    handleSearch,
    resetAllFilters, handleRoomToggle, handleFunctionToggle, handleTypeToggle,
    handleTreeScope, handleLoadSavedFilter, handleDeleteSavedFilter,
    handleSaveCurrentFilter, handleNavigateTo,
    setFulltextEnabled, setExactEnabled,
    canGoBack, canGoForward, goBack, goForward,
  } = useFilterContext();

  // ── Selection Context ────────────────────────────────────────────────────
  const {
    selectedId, setSelectedId, editInitialTab, setEditInitialTab,
    historyModalId, setHistoryModalId, newDatapointInitialId, setNewDatapointInitialId,
    enumManagerOpen, setEnumManagerOpen, aliasReplaceInitialStr, setAliasReplaceInitialStr,
    autoAliasDeviceId, setAutoAliasDeviceId,
  } = useSelectionContext();

  // ── UI Context ───────────────────────────────────────────────────────────
  const {
    appSettings, settingsOpen, setSettingsOpen, shortcutsOpen, setShortcutsOpen,
    handleScriptRefreshConfirmed,
  } = useUIContext();

  // ── Connectivity ─────────────────────────────────────────────────────────
  const { isOnline, browserOnline } = useApiConnectivity();

  // ── React Query ──────────────────────────────────────────────────────────
  const fieldFilters = (idFilter || nameFilter || descFilter) ? { id: idFilter ?? undefined, name: nameFilter ?? undefined, desc: descFilter ?? undefined } : undefined;
  const { data: stateObjectsData, error: objectsError, refetch: refetchFilteredObjects, isPlaceholderData: objectsIsPartial } = useFilteredObjects(basePattern, fulltextEnabled, exactEnabled, fieldFilters);
  const objectsRefetchMs = useMemo(() => {
    const map: Record<string, number | false> = { 'off': false, '30s': 30_000, '1m': 60_000, '5m': 300_000, '10m': 600_000 };
    return map[appSettings.objectsRefreshInterval] ?? false;
  }, [appSettings.objectsRefreshInterval]);
  const { data: allObjectsData, refetch: refetchAllObjects } = useAllObjects(objectsRefetchMs);
  const { data: roomMapData, refetch: refetchRoomMap } = useRoomMap();
  const { data: functionMapData, refetch: refetchFunctionMap } = useFunctionMap();
  const { data: roomEnums = [], refetch: refetchRoomEnums } = useRoomEnums();
  const { data: functionEnums = [], refetch: refetchFunctionEnums } = useFunctionEnums();

  const stateObjects = stateObjectsData ?? EMPTY_OBJECTS;
  const allObjects = allObjectsData ?? EMPTY_OBJECTS;
  const roomMap = roomMapData ?? EMPTY_STRING_MAP;
  const functionMap = functionMapData ?? EMPTY_STRING_MAP;

  // ── Derived from Query Data ──────────────────────────────────────────────
  const historyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(stateObjects)) { if (hasHistory(obj)) set.add(id); }
    return set;
  }, [stateObjects]);

  const smartIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(stateObjects)) { if (hasSmartName(obj)) set.add(id); }
    return set;
  }, [stateObjects]);

  const customIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(stateObjects)) { if (hasCustomEnabled(obj)) set.add(id); }
    return set;
  }, [stateObjects]);

  const allStateIds = useMemo(
    () => Object.keys(allObjects).filter(id => allObjects[id]?.type === 'state').sort(),
    [allObjects]
  );
  const treeHistoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasHistory(obj)) set.add(id); }
    return set;
  }, [allObjects]);
  const treeSmartIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) { if (hasSmartName(obj)) set.add(id); }
    return set;
  }, [allObjects]);

  const allRoleNames = useMemo(() => {
    const set = new Set<string>();
    for (const obj of Object.values(allObjects)) {
      const role = obj?.common?.role;
      if (role) set.add(role);
    }
    return [...set].sort();
  }, [allObjects]);

  const { data: aliasMapData } = useAliasMap();
  const aliasMap = aliasMapData ?? EMPTY_ALIAS_MAP;
  const existingIds = useMemo(() => new Set(Object.keys(allObjects)), [allObjects]);

  const quickPatternOptions = useMemo(
    () => [...new Set([...DEFAULT_QUICK_PATTERNS, ...appSettings.extraQuickFilters])],
    [appSettings.extraQuickFilters]
  );
  const isEn = appSettings.language === 'en';

  const danglingAliasCount = useMemo(() => {
    let count = 0;
    for (const [id, obj] of Object.entries(allObjects)) {
      if (!id.startsWith('alias.0.')) continue;
      if (obj?.type === 'folder' || obj?.type === 'channel' || obj?.type === 'device') continue;
      const rawId = obj?.common?.alias?.id;
      const targets: string[] = typeof rawId === 'object'
        ? [rawId?.read, rawId?.write].filter((t): t is string => !!t)
        : rawId ? [rawId] : [];
      if (targets.length === 0 || targets.every((t) => !existingIds.has(t))) count++;
    }
    return count;
  }, [allObjects, existingIds]);

  const objectIds = useMemo(() => {
    const sourceObjects = danglingAliasFilter ? allObjects : stateObjects;
    let ids = danglingAliasFilter
      ? Object.keys(allObjects).filter((id) => id.startsWith('alias.0.')).sort()
      : Object.keys(stateObjects).sort();
    if (!danglingAliasFilter) {
      if (historyOnly) ids = ids.filter((id) => historyIds.has(id));
      if (smartOnly) ids = ids.filter((id) => smartIds.has(id));
    }
    return filterObjectIds({
      ids, objects: sourceObjects, roomMap, functionMap, historyIds, customIds, smartIds, aliasMap,
      colFilters, roomFilters, functionFilters, quickPatterns,
      patternRoomFilter: roomFilter, patternFunctionFilter: functionFilter,
      patternTypeFilter: typeFilter, patternRoleFilter: null,
      danglingAliases: danglingAliasFilter, allObjectIds: existingIds,
    });
  }, [stateObjects, allObjects, historyOnly, historyIds, customIds, smartOnly, smartIds, colFilters, roomMap, functionMap, aliasMap, roomFilters, functionFilters, quickPatterns, roomFilter, functionFilter, typeFilter, danglingAliasFilter, existingIds]);

  const tableIds = useMemo(
    () => treeFilter ? objectIds.filter((id) => id.startsWith(treeFilter)) : objectIds,
    [objectIds, treeFilter]
  );

  const isFilterActive = pattern !== '*' || historyOnly || smartOnly ||
    Object.keys(colFilters).length > 0 || roomFilters.size > 0 ||
    functionFilters.size > 0 || quickPatterns.size > 0 ||
    treeFilter !== null || danglingAliasFilter;
  const paginationDisabled = !isFilterActive || appSettings.groupByPath;
  const totalCount = tableIds.length;
  const pageStart = paginationDisabled ? 0 : page * appSettings.pageSize;
  const pageIds = useMemo(
    () => paginationDisabled ? tableIds : tableIds.slice(pageStart, pageStart + appSettings.pageSize),
    [tableIds, pageStart, appSettings.pageSize, paginationDisabled]
  );
  const totalPages = paginationDisabled ? 1 : Math.ceil(totalCount / appSettings.pageSize);

  const { data: stateValues, refetch: refetchStateValues, dataUpdatedAt: statesUpdatedAt } = useStateValues(pageIds);
  const lastValidUpdatedAt = useRef<number>(0);
  if (statesUpdatedAt > 0) lastValidUpdatedAt.current = statesUpdatedAt;

  // ── Cross-context handlers ───────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    const timeout = setTimeout(() => setIsRefreshing(false), 6_000);
    void Promise.allSettled([
      refetchFilteredObjects(), refetchAllObjects(), refetchRoomMap(),
      refetchFunctionMap(), refetchStateValues(), refetchRoomEnums(), refetchFunctionEnums(),
    ]).finally(() => { clearTimeout(timeout); setIsRefreshing(false); });
  }, [refetchFilteredObjects, refetchAllObjects, refetchRoomMap, refetchFunctionMap, refetchStateValues, refetchRoomEnums, refetchFunctionEnums]);

  const handleCreateDatapointAtPath = useCallback((prefix: string) => {
    setNewDatapointInitialId(prefix);
  }, [setNewDatapointInitialId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (settingsOpen) { setSettingsOpen(false); return; }
        setSelectedId(null);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (settingsOpen || selectedId) return;
        if (totalPages <= 1) return;
        e.preventDefault();
        stateListRef.current?.fitToContainer();
        if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
        else setPage((p) => Math.min(totalPages - 1, p + 1));
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, selectedId, totalPages, setSettingsOpen, setSelectedId, setPage]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <Layout
      apiConnected={!objectsError && isOnline}
      browserOffline={!browserOnline}
      lastUpdated={lastValidUpdatedAt.current > 0 ? lastValidUpdatedAt.current : undefined}
      onManualRefresh={handleManualRefresh}
      onConfirmScriptRefresh={() => handleScriptRefreshConfirmed(Object.keys(allObjects))}
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <SearchBar
              onSearch={handleSearch}
              initialPattern={pattern}
              onReset={resetAllFilters}
              fulltextEnabled={fulltextEnabled}
              onFulltextChange={setFulltextEnabled}
              exactEnabled={exactEnabled}
              onExactChange={setExactEnabled}
              language={appSettings.language}
              roomNames={roomEnums.map((r) => r.name)}
              functionNames={functionEnums.map((f) => f.name)}
              roleNames={allRoleNames}
              idSuggestEnabled={idSuggestEnabled}
              onIdSuggestChange={setIdSuggestEnabled}
              allObjectIds={idSuggestEnabled ? Object.keys(allObjects) : undefined}
            />
            {hasAnyFilter && (
              <div className="flex gap-1">
                <button
                  onClick={resetAllFilters}
                  className="flex items-center justify-center gap-1.5 flex-1 px-2 py-1 text-xs rounded text-red-500 hover:text-red-700 hover:bg-red-500/10 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 transition-colors"
                  title={isEn ? 'Reset all filters' : 'Alle Filter zurücksetzen'}
                >
                  <RotateCcw size={11} />
                  {isEn ? 'Reset filters' : 'Filter zurücksetzen'}
                </button>
                {!saveFilterPromptOpen && (
                  <button
                    onClick={() => { setSaveFilterPromptOpen(true); setSaveFilterName(''); }}
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs rounded text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10 transition-colors"
                    title={isEn ? 'Save current filter' : 'Filter speichern'}
                  >
                    <Bookmark size={11} />
                    {isEn ? 'Save' : 'Speichern'}
                  </button>
                )}
              </div>
            )}
            {saveFilterPromptOpen && (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCurrentFilter(saveFilterName);
                    if (e.key === 'Escape') setSaveFilterPromptOpen(false);
                  }}
                  placeholder={isEn ? 'Filter name…' : 'Filtername…'}
                  className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => handleSaveCurrentFilter(saveFilterName)}
                  disabled={!saveFilterName.trim()}
                  className="p-1 rounded text-green-600 hover:bg-green-500/10 dark:text-green-400 disabled:opacity-40 transition-colors"
                  title={isEn ? 'Save' : 'Speichern'}
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => setSaveFilterPromptOpen(false)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title={isEn ? 'Cancel' : 'Abbrechen'}
                >
                  <X size={13} />
                </button>
              </div>
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
              <div className="pt-0.5 pb-1 flex flex-col">
                {quickPatternOptions.map((q) => {
                  const active = basePattern === q;
                  const color = QUICK_COLORS[q] ?? 'text-blue-600 dark:text-blue-400';
                  return (
                    <button key={q} onClick={() => handleSearch(q)}
                      className={`px-3 py-1 text-left text-xs font-mono transition-colors ${color} ${active ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                      {q}
                    </button>
                  );
                })}
                <button
                  onClick={() => { setHistoryOnly(!historyOnly); setPage(0); }}
                  className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-purple-600 dark:text-purple-400 ${historyOnly ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                >
                  <Database size={11} /> History <span className="opacity-70">{historyIds.size}</span>
                </button>
                <button
                  onClick={() => { setSmartOnly(!smartOnly); setPage(0); }}
                  className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-orange-600 dark:text-orange-400 ${smartOnly ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                >
                  <Mic2 size={11} /> SmartName <span className="opacity-70">{smartIds.size}</span>
                </button>
                {danglingAliasCount > 0 && (
                  <button
                    onClick={() => { setDanglingAliasFilter((v) => !v); setPage(0); }}
                    className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-amber-600 dark:text-amber-400 ${danglingAliasFilter ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                  >
                    <AlertTriangle size={11} /> {isEn ? 'Dangling Aliases' : 'Verwaiste Aliase'} <span className="opacity-70">{danglingAliasCount}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {roomEnums.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setRoomsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <span className="flex items-center gap-1.5 font-medium">
                  <Home size={12} />
                  {isEn ? 'Rooms' : 'Räume'}
                  {roomFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{roomFilter}</span>}
                </span>
                {roomsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {roomsOpen && (
                <div className="pt-0.5 pb-1 flex flex-col">
                  {roomEnums.map(({ name }, i) => {
                    const active = roomFilter?.toLowerCase() === name.toLowerCase();
                    return (
                      <button key={name} onClick={() => handleRoomToggle(name)}
                        className={`px-3 py-1 text-left text-xs transition-colors ${ENUM_COLORS[i % ENUM_COLORS.length]} ${active ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {functionEnums.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setFunctionsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <span className="flex items-center gap-1.5 font-medium">
                  <Zap size={12} />
                  {isEn ? 'Functions' : 'Funktionen'}
                  {functionFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{functionFilter}</span>}
                </span>
                {functionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {functionsOpen && (
                <div className="pt-0.5 pb-1 flex flex-col">
                  {functionEnums.map(({ name }, i) => {
                    const active = functionFilter?.toLowerCase() === name.toLowerCase();
                    return (
                      <button key={name} onClick={() => handleFunctionToggle(name)}
                        className={`px-3 py-1 text-left text-xs transition-colors ${ENUM_COLORS[i % ENUM_COLORS.length]} ${active ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setTypesOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
              <span className="flex items-center gap-1.5 font-medium">
                <Tag size={12} />
                {isEn ? 'Type' : 'Typ'}
                {typeFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{typeFilter}</span>}
              </span>
              {typesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            {typesOpen && (
              <div className="pt-0.5 pb-1 flex flex-col">
                {(['boolean', 'number', 'string', 'object', 'array', 'mixed'] as const).map((t) => {
                  const active = typeFilter?.toLowerCase() === t;
                  return (
                    <button key={t} onClick={() => handleTypeToggle(t)}
                      className={`px-3 py-1 text-left text-xs transition-colors font-semibold ${getTypeColor(t)} ${active ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700' : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {savedFiltersList.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button onClick={() => setSavedFiltersOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                <span className="flex items-center gap-1.5 font-medium">
                  <Bookmark size={12} />
                  {isEn ? 'Saved filters' : 'Gespeicherte Filter'}
                  <span className="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-gray-300">{savedFiltersList.length}</span>
                </span>
                {savedFiltersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {savedFiltersOpen && (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {savedFiltersList.map((f) => (
                    <li key={f.id} className="flex items-center gap-1 px-3 py-1.5">
                      <button onClick={() => handleLoadSavedFilter(f)}
                        className="flex-1 text-left text-xs text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate transition-colors"
                        title={f.pattern}>
                        {f.name}
                      </button>
                      <button onClick={() => handleDeleteSavedFilter(f.id)}
                        className="shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                        title={isEn ? 'Delete' : 'Löschen'}>
                        <X size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1 mt-3 mx-1 rounded-t bg-gray-50/40 dark:bg-gray-800/20">
            <StateTree
              stateIds={allStateIds}
              allObjects={allObjects}
              historyIds={treeHistoryIds}
              smartIds={treeSmartIds}
              onCreateAtPath={handleCreateDatapointAtPath}
              onSearch={handleSearch}
              onTreeScope={handleTreeScope}
            />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        {objectsError && (
          <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg p-3 text-sm dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
            Error: {objectsError.message}
          </div>
        )}

        <ErrorBoundary fallback={null} onError={(e) => console.error('Modal error:', e)}>
        {selectedId && allObjects[selectedId] && (
          <ObjectEditModal
            id={selectedId}
            obj={allObjects[selectedId]}
            language={appSettings.language}
            dateFormat={appSettings.dateFormat}
            onClose={() => { setSelectedId(null); setEditInitialTab(undefined); }}
            onOpenHistory={hasHistory(allObjects[selectedId]) ? () => setHistoryModalId(selectedId) : undefined}
            initialTab={editInitialTab}
          />
        )}
        {historyModalId && (
          <Suspense fallback={null}>
            <HistoryModal
              stateId={historyModalId}
              unit={allObjects[historyModalId]?.common?.unit}
              objects={allObjects}
              language={appSettings.language}
              dateFormat={appSettings.dateFormat}
              onClose={() => setHistoryModalId(null)}
            />
          </Suspense>
        )}
        {enumManagerOpen && (
          <EnumManagerModal
            allObjects={allObjects}
            language={appSettings.language}
            onClose={() => setEnumManagerOpen(false)}
          />
        )}
        {aliasReplaceInitialStr !== null && (
          <AliasReplaceModal
            allObjects={allObjects}
            language={appSettings.language}
            initialOldStr={aliasReplaceInitialStr}
            onClose={() => setAliasReplaceInitialStr(null)}
          />
        )}
        {autoAliasDeviceId && (
          <AutoCreateAliasModal
            deviceId={autoAliasDeviceId}
            allObjects={allObjects}
            existingIds={existingIds}
            language={appSettings.language}
            onClose={() => setAutoAliasDeviceId(null)}
            onCreated={(ids) => { handleNavigateTo(ids.length === 1 ? ids : ['alias.0.*']); }}
          />
        )}
        {shortcutsOpen && (
          <HelpModal
            language={appSettings.language}
            onClose={() => setShortcutsOpen(false)}
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
        {settingsOpen && <SettingsModal />}
        </ErrorBoundary>

        <div className="flex-1 min-h-0 flex flex-col">
          <StateList
            ref={stateListRef}
            ids={pageIds}
            states={stateValues ?? EMPTY_STATES}
            objects={stateObjects}
            roomMap={roomMap}
            functionMap={functionMap}
            aliasMap={aliasMap}
            allObjectIds={existingIds}
            exportIds={tableIds}
            onNavigateTo={handleNavigateTo}
            connectedInfo={
              <div className="flex items-center gap-1">
                <HostConnectedButton
                  apiConnected={!objectsError && isOnline}
                  lastUpdated={lastValidUpdatedAt.current > 0 ? lastValidUpdatedAt.current : undefined}
                  onManualRefresh={handleManualRefresh}
                />
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                <button
                  onClick={goBack}
                  disabled={!canGoBack}
                  title={isEn ? 'Back (filter history)' : 'Zurück (Filter-Verlauf)'}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  onClick={goForward}
                  disabled={!canGoForward}
                  title={isEn ? 'Forward (filter history)' : 'Vorwärts (Filter-Verlauf)'}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowRight size={15} />
                </button>
              </div>
            }
          />
        </div>

        {!appSettings.groupByPath && (
          <div className="py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full gap-2">
              <div className="flex items-center justify-start">
                {totalPages > 1 && (
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    {isEn ? 'Previous' : 'Zurück'}
                  </button>
                )}
              </div>
              <div className="text-center">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {totalPages > 1
                    ? <>{isEn ? 'Page' : 'Seite'} {page + 1} {isEn ? 'of' : 'von'} {totalPages} ({pageStart + 1}–{Math.min(pageStart + appSettings.pageSize, totalCount)} {isEn ? 'of' : 'von'} {totalCount})</>
                    : <>{isEn ? 'Datapoints' : 'Datenpunkte'}: <span className="text-gray-700 dark:text-gray-200">{totalCount}</span></>
                  }
                  {objectsIsPartial && <span className="ml-2 text-[10px] text-blue-400 dark:text-blue-500 animate-pulse">{isEn ? 'loading…' : 'lädt…'}</span>}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                {totalPages > 1 && (
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    {isEn ? 'Next' : 'Weiter'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
    {isRefreshing && createPortal(
      <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 px-8 py-6 flex flex-col items-center gap-3">
          <RefreshCw size={28} className="text-blue-500 animate-spin" style={{ animationDuration: '1s' }} />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {isEn ? 'Refreshing data…' : 'Daten werden aktualisiert…'}
          </p>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

function AppErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-8">
      <AlertTriangle size={48} className="text-red-500" />
      <h1 className="text-xl font-semibold">Unerwarteter Fehler</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md text-center">{message}</p>
      <button onClick={resetErrorBoundary} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
        App neu laden
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback} onReset={() => window.location.reload()}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <UIContextProvider>
              <FilterContextProvider>
                <SelectionContextProvider>
                  <AppContent />
                  <ToastContainer />
                </SelectionContextProvider>
              </FilterContextProvider>
            </UIContextProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
