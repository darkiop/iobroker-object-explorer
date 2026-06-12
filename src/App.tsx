import { useMemo, useEffect, useCallback, useRef, lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import Layout from './components/Layout';
import SearchBar, { type SearchBarHandle } from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import ObjectEditModal from './components/ObjectEditModal';
const HistoryModal = lazy(() => import('./components/HistoryModal'));
import NewDatapointModal from './components/NewDatapointModal';
import HelpModal from './components/HelpModal';
import EnumManagerModal from './components/EnumManagerModal';
import AliasReplaceModal from './components/AliasReplaceModal';
import AutoCreateAliasModal from './components/AutoCreateAliasModal';
import SettingsModal from './components/SettingsModal';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap, useFunctionMap, useRoomEnums, useFunctionEnums, useAliasMap } from './hooks/useStates';
import { useApiConnectivity } from './hooks/useApiConnectivity';
import { useLongPolling } from './hooks/useLongPolling';
import { useSocketIO } from './hooks/useSocketIO';
import { hasHistory, hasSmartName, hasCustomEnabled } from './api/iobroker';
import type { StateListHandle } from './components/StateList';
import { filterObjectIds } from './utils/filterObjectIds';
import type { IoBrokerObject, IoBrokerState } from './types/iobroker';
import { Database, Mic2, ChevronDown, ChevronRight, Home, Zap, RefreshCw, Layers, X, Check, Bookmark, AlertTriangle, Tag, Wrench } from 'lucide-react';
import { getTypeColor } from './utils/typeColor';
import { FilterContextProvider, useFilterContext } from './context/FilterContext';
import { PanelContextProvider } from './context/PanelContext';
import type { PanelContextValue } from './context/PanelContext';
import { SelectionContextProvider, useSelectionContext } from './context/SelectionContext';
import { UIContextProvider, useUIContext, DEFAULT_QUICK_PATTERNS } from './context/UIContext';
import { DEFAULT_COLS } from './components/stateListColumns';
import type { SortKey } from './components/stateListColumns';

const PANEL2_DEFAULT_COLS: SortKey[] = DEFAULT_COLS.filter(
  (k) => !(['write', 'history', 'custom', 'smart', 'alias', 'scripts', 'name', 'ack', 'ts'] as SortKey[]).includes(k)
);
const PANEL2_STATE_VERSION = 3;
const LS_PANEL1_DUAL_COLS = 'iobroker-panel1-dual-cols';
const PANEL1_DUAL_COLS_VERSION = 2;

function loadPanel1DualCols(): SortKey[] {
  try {
    const raw = localStorage.getItem(LS_PANEL1_DUAL_COLS);
    if (!raw) return PANEL2_DEFAULT_COLS;
    const parsed = JSON.parse(raw) as { _v?: number; cols?: SortKey[] };
    if (parsed._v !== PANEL1_DUAL_COLS_VERSION || !parsed.cols?.length) return PANEL2_DEFAULT_COLS;
    return parsed.cols;
  } catch { return PANEL2_DEFAULT_COLS; }
}

function savePanel1DualCols(cols: SortKey[]): void {
  try { localStorage.setItem(LS_PANEL1_DUAL_COLS, JSON.stringify({ _v: PANEL1_DUAL_COLS_VERSION, cols })); } catch { /* ignore */ }
}

const LS_PANEL2_STATE = 'iobroker-panel2-filter-state';

interface Panel2FilterState {
  _v: number;
  pattern: string;
  page: number;
  colFilters: Partial<Record<SortKey, string>>;
  treeFilter: string | null;
  fulltextEnabled: boolean;
  visibleCols: SortKey[];
  groupByPath: boolean;
  p1Width: number;
}

function loadPanel2State(): Panel2FilterState {
  const defaults: Panel2FilterState = { _v: PANEL2_STATE_VERSION, pattern: '*', page: 0, colFilters: {}, treeFilter: null, fulltextEnabled: false, visibleCols: PANEL2_DEFAULT_COLS, groupByPath: true, p1Width: 50 };
  try {
    const raw = localStorage.getItem(LS_PANEL2_STATE);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Panel2FilterState>;
    // Version mismatch → reset visibleCols to new default
    const visibleCols = parsed._v === PANEL2_STATE_VERSION && parsed.visibleCols?.length
      ? parsed.visibleCols
      : PANEL2_DEFAULT_COLS;
    return { ...defaults, ...parsed, visibleCols, _v: PANEL2_STATE_VERSION };
  } catch {
    return defaults;
  }
}

function savePanel2State(s: Panel2FilterState): void {
  try { localStorage.setItem(LS_PANEL2_STATE, JSON.stringify(s)); } catch { /* ignore */ }
}

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
  const p2StateListRef = useRef<StateListHandle>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);
  const [resetSeq, setResetSeq] = useState(0);

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
    handleSearch, sidebarToggleSeq,
    resetAllFilters, handleRoomToggle, handleFunctionToggle, handleTypeToggle,
    handleTreeScope, handleLoadSavedFilter, handleDeleteSavedFilter,
    handleSaveCurrentFilter, handleNavigateTo,
    setFulltextEnabled, setExactEnabled,
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
    handleScriptRefreshConfirmed, expertMode, handleToggleExpertMode,
  } = useUIContext();

  // ── Panel 2 State ────────────────────────────────────────────────────────
  const [activePanelIdx, setActivePanelIdx] = useState<0 | 1>(0);
  const [p2Pattern, setP2PatternRaw] = useState(() => loadPanel2State().pattern);
  const [p2Page, setP2Page] = useState(() => loadPanel2State().page);
  const [p2ColFilters, setP2ColFilters] = useState<Partial<Record<SortKey, string>>>(() => loadPanel2State().colFilters);
  const [p2TreeFilter, setP2TreeFilter] = useState<string | null>(() => loadPanel2State().treeFilter);
  const [p2FulltextEnabled, setP2FulltextEnabled] = useState(() => loadPanel2State().fulltextEnabled);
  const [p2VisibleCols, setP2VisibleCols] = useState<SortKey[]>(() => loadPanel2State().visibleCols);
  const [p1DualCols, setP1DualColsRaw] = useState<SortKey[]>(() => loadPanel1DualCols());
  const setP1DualCols = useCallback((cols: SortKey[]) => { setP1DualColsRaw(cols); savePanel1DualCols(cols); }, []);
  const [p2GroupByPath, setP2GroupByPath] = useState(() => loadPanel2State().groupByPath);
  const [p1Width, setP1Width] = useState(() => loadPanel2State().p1Width ?? 50);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // When showUnitInValue is enabled, auto-hide the 'unit' column in all pane views
  useEffect(() => {
    if (!appSettings.showUnitInValue) return;
    setP1DualCols(p1DualCols.filter((k) => k !== 'unit'));
    setP2VisibleCols((prev) => prev.filter((k) => k !== 'unit'));
  // intentionally only re-run when the flag changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings.showUnitInValue]);

  const setP2Pattern = useCallback((p: string) => {
    setP2PatternRaw(p);
    setP2Page(0);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && !document.title.startsWith('[DEV] ')) {
      document.title = `[DEV] ${document.title}`;
    }
  }, []);

  useEffect(() => {
    savePanel2State({ _v: PANEL2_STATE_VERSION, pattern: p2Pattern, page: p2Page, colFilters: p2ColFilters, treeFilter: p2TreeFilter, fulltextEnabled: p2FulltextEnabled, visibleCols: p2VisibleCols, groupByPath: p2GroupByPath, p1Width });
  }, [p2Pattern, p2Page, p2ColFilters, p2TreeFilter, p2FulltextEnabled, p2VisibleCols, p2GroupByPath, p1Width]);

  // Close panel 2 → reset active panel + refit columns
  useEffect(() => {
    if (!appSettings.panel2Open) {
      setActivePanelIdx(0);
      requestAnimationFrame(() => requestAnimationFrame(() => stateListRef.current?.fitToContainer()));
    }
  }, [appSettings.panel2Open]);

  // ── Panel divider drag resize ────────────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !panelContainerRef.current) return;
      const rect = panelContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setP1Width(Math.min(80, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Refit both panel columns whenever panel width changes (drag, double-click, any future trigger)
  useEffect(() => {
    if (!appSettings.panel2Open) return;
    requestAnimationFrame(() => {
      stateListRef.current?.fitToContainer();
      p2StateListRef.current?.fitToContainer();
    });
  }, [p1Width, appSettings.panel2Open]);

  // ── Connectivity ─────────────────────────────────────────────────────────
  const lpConnectedRef = useRef(false);
  const { isOnline, browserOnline } = useApiConnectivity(() => lpConnectedRef.current);

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

  const allObjectsDerived = useMemo(() => {
    const stateIds: string[] = [];
    const historyIdSet = new Set<string>();
    const smartIdSet = new Set<string>();
    const existingIdSet = new Set<string>();
    const roleSet = new Set<string>();

    for (const [id, obj] of Object.entries(allObjects)) {
      existingIdSet.add(id);
      const t = obj?.type;
      if (t === 'state') stateIds.push(id);
      if (hasHistory(obj)) historyIdSet.add(id);
      if (hasSmartName(obj)) smartIdSet.add(id);
      const role = obj?.common?.role;
      if (role) roleSet.add(role);
    }

    let dangling = 0;
    for (const [id, obj] of Object.entries(allObjects)) {
      const t = obj?.type;
      if (!id.startsWith('alias.0.') || t === 'folder' || t === 'channel' || t === 'device') continue;
      const rawId = obj?.common?.alias?.id;
      const targets: string[] = typeof rawId === 'object' && rawId !== null
        ? [(rawId as { read?: string; write?: string }).read, (rawId as { read?: string; write?: string }).write].filter((t2): t2 is string => !!t2)
        : rawId ? [rawId as string] : [];
      if (targets.length === 0 || targets.every((tgt) => !existingIdSet.has(tgt))) dangling++;
    }

    stateIds.sort();

    return {
      allStateIds: stateIds,
      treeHistoryIds: historyIdSet,
      treeSmartIds: smartIdSet,
      existingIds: existingIdSet,
      allRoleNames: [...roleSet].sort(),
      danglingAliasCount: dangling,
    };
  }, [allObjects]);

  const { allStateIds, treeHistoryIds, treeSmartIds, existingIds, allRoleNames, danglingAliasCount } = allObjectsDerived;

  const { data: aliasMapData } = useAliasMap();
  const aliasMap = aliasMapData ?? EMPTY_ALIAS_MAP;

  const quickPatternOptions = useMemo(
    () => [...new Set([...DEFAULT_QUICK_PATTERNS, ...appSettings.extraQuickFilters])],
    [appSettings.extraQuickFilters]
  );
  const isEn = appSettings.language === 'en';

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

  // Optionally fetch state values only for rows currently visible in the StateList
  // viewport (reported by its virtualizer), falling back to the full page until
  // that's known or after a page/filter change invalidates the previous selection.
  // Off by default — see `loadOnlyVisibleStateValues` in AppSettings.
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  useEffect(() => {
    setVisibleIds([]);
  }, [pageIds]);
  const valueIds = useMemo(() => {
    // Before the virtualizer reports its visible range (or right after a page/filter
    // change resets it), don't request the *entire* un-paginated table — that can be
    // thousands of IDs, forcing getStatesBatch into its full-DB-dump fallback. Cap to
    // a page's worth; the virtualizer corrects this to the real viewport moments later.
    const fallback = pageIds.length > appSettings.pageSize ? pageIds.slice(0, appSettings.pageSize) : pageIds;
    if (!appSettings.loadOnlyVisibleStateValues) return fallback;
    if (visibleIds.length === 0) return fallback;
    const pageIdSet = new Set(pageIds);
    const filtered = visibleIds.filter((id) => pageIdSet.has(id));
    return filtered.length > 0 ? filtered : fallback;
  }, [visibleIds, pageIds, appSettings.pageSize, appSettings.loadOnlyVisibleStateValues]);

  // Realtime push transport — scoped to visible page IDs only, no global * subscription.
  // Selectable in Settings: 'longpolling' (default, REST-only, works everywhere) or
  // 'socketio' (experimental — requires a separate `socketio` adapter instance).
  // Each hook no-ops (returns {supported:null, connected:false}) when not selected,
  // either via empty-array (long polling) or its own `enabled` flag (socket.io).
  //
  // Auto-fallback: if socket.io is selected but its adapter is unreachable
  // (`supported === false`, e.g. wrong host/port or adapter not installed),
  // long polling kicks in automatically as a live fallback — no dead UI.
  // Recovers automatically once socket.io reconnects (`supported` flips back to true).
  const useSocketTransport = appSettings.realtimeTransport === 'socketio';
  const sioStatus = useSocketIO(pageIds, useSocketTransport, appSettings.socketHost);
  const sioFailed = useSocketTransport && sioStatus.supported === false;
  const lpEnabled = !useSocketTransport || sioFailed;
  const lpStatusRaw = useLongPolling(lpEnabled ? pageIds : []);
  const lpStatus = useSocketTransport && !sioFailed ? sioStatus : lpStatusRaw;
  lpConnectedRef.current = lpStatus.connected;

  const { data: stateValues, refetch: refetchStateValues, dataUpdatedAt: statesUpdatedAt } = useStateValues(
    valueIds,
    lpStatus.connected ? false : 10_000,
  );
  const lastValidUpdatedAt = useRef<number>(0);
  if (statesUpdatedAt > 0) lastValidUpdatedAt.current = statesUpdatedAt;

  // ── Panel 2 data pipeline ────────────────────────────────────────────────
  const { data: p2StateObjectsData } = useFilteredObjects(p2Pattern, p2FulltextEnabled, false, undefined);
  const p2StateObjects = p2StateObjectsData ?? EMPTY_OBJECTS;

  const p2ObjectIds = useMemo(() => {
    const ids = Object.keys(p2StateObjects).sort();
    return filterObjectIds({
      ids, objects: p2StateObjects, roomMap, functionMap,
      historyIds: new Set<string>(), customIds: new Set<string>(), smartIds: new Set<string>(),
      aliasMap,
      colFilters: p2ColFilters, roomFilters: new Set<string>(), functionFilters: new Set<string>(),
      quickPatterns: new Set<string>(),
      patternRoomFilter: null, patternFunctionFilter: null, patternTypeFilter: null, patternRoleFilter: null,
      danglingAliases: false, allObjectIds: existingIds,
    });
  }, [p2StateObjects, roomMap, functionMap, aliasMap, p2ColFilters, existingIds]);

  const p2TableIds = useMemo(
    () => p2TreeFilter ? p2ObjectIds.filter((id) => id.startsWith(p2TreeFilter!)) : p2ObjectIds,
    [p2ObjectIds, p2TreeFilter]
  );

  const p2TotalCount = p2TableIds.length;
  const p2PageSize = appSettings.pageSize;
  const p2PaginationDisabled = p2GroupByPath;
  const p2PageStart = p2PaginationDisabled ? 0 : p2Page * p2PageSize;
  const p2PageIds = useMemo(
    () => p2PaginationDisabled ? p2TableIds : p2TableIds.slice(p2PageStart, p2PageStart + p2PageSize),
    [p2TableIds, p2PageStart, p2PageSize, p2PaginationDisabled]
  );
  const p2TotalPages = p2PaginationDisabled ? 1 : Math.ceil(p2TotalCount / p2PageSize);

  const { data: p2StateValues } = useStateValues(p2PageIds, lpStatus.connected ? false : 10_000);

  const p2HandleColFilterChange = useCallback((filters: Partial<Record<SortKey, string>>) => {
    setP2ColFilters(filters);
    setP2Page(0);
  }, []);
  const p2HandleClearTreeFilter = useCallback(() => setP2TreeFilter(null), []);
  const p2HandleTreeScope = useCallback((prefix: string) => {
    setP2TreeFilter(prefix);
    setP2Page(0);
  }, []);

  const panel2PanelCtx: PanelContextValue = {
    colFilters: p2ColFilters,
    handleColFilterChange: p2HandleColFilterChange,
    pattern: p2Pattern,
    treeFilter: p2TreeFilter,
    handleClearTreeFilter: p2HandleClearTreeFilter,
    sidebarToggleSeq,  // shared — sidebar width change affects both panels
    fulltextEnabled: p2FulltextEnabled,
    handleTreeScope: p2HandleTreeScope,
  };

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
      if (e.key === 'Tab' && !e.shiftKey && appSettings.panel2Open) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setActivePanelIdx((p) => (p === 0 ? 1 : 0));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (settingsOpen || selectedId) return;
        if (activePanelIdx === 0) {
          if (totalPages <= 1) return;
          e.preventDefault();
          stateListRef.current?.fitToContainer();
          if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
          else setPage((p) => Math.min(totalPages - 1, p + 1));
        } else {
          if (p2TotalPages <= 1) return;
          e.preventDefault();
          if (e.key === 'ArrowLeft') setP2Page((p) => Math.max(0, p - 1));
          else setP2Page((p) => Math.min(p2TotalPages - 1, p + 1));
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, selectedId, totalPages, p2TotalPages, activePanelIdx, appSettings.panel2Open, setSettingsOpen, setSelectedId, setPage, setP2Page, setActivePanelIdx]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <Layout
      apiConnected={!objectsError && isOnline}
      realtimeTransport={useSocketTransport && !sioFailed ? 'socketio' : 'longpolling'}
      realtimeStatus={lpStatus}
      realtimeFallback={sioFailed}
      browserOffline={!browserOnline}
      lastUpdated={lastValidUpdatedAt.current > 0 ? lastValidUpdatedAt.current : undefined}
      onManualRefresh={handleManualRefresh}
      onFocusSearch={() => searchBarRef.current?.focus()}
      onConfirmScriptRefresh={() => handleScriptRefreshConfirmed(Object.keys(allObjects))}
      onExtraReset={() => {
        setP2Pattern('*');
        setP2Page(0);
        setP2ColFilters({});
        setP2TreeFilter(null);
        setResetSeq((s) => s + 1);
      }}
      headerExtra={
        <button
          onClick={handleToggleExpertMode}
          title={expertMode ? (isEn ? 'Disable expert mode' : 'Expertenmodus deaktivieren') : (isEn ? 'Enable expert mode' : 'Expertenmodus aktivieren')}
          className={`p-1.5 rounded-lg transition-colors ${expertMode ? 'text-amber-600 bg-amber-500/15 hover:bg-amber-500/25 dark:text-amber-400 dark:bg-amber-500/20 dark:hover:bg-amber-500/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'}`}
        >
          <Wrench size={16} />
        </button>
      }
      sidebar={
        <div className="flex flex-col h-full">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <SearchBar
              ref={searchBarRef}
              key={`searchbar-p${activePanelIdx}-r${resetSeq}`}
              onSearch={activePanelIdx === 0 ? handleSearch : setP2Pattern}
              initialPattern={activePanelIdx === 0 ? pattern : p2Pattern}
              onReset={activePanelIdx === 0 ? resetAllFilters : () => { setP2Pattern('*'); setP2ColFilters({}); setP2TreeFilter(null); }}
              fulltextEnabled={activePanelIdx === 0 ? fulltextEnabled : p2FulltextEnabled}
              onFulltextChange={activePanelIdx === 0 ? setFulltextEnabled : setP2FulltextEnabled}
              exactEnabled={exactEnabled}
              onExactChange={setExactEnabled}
              language={appSettings.language}
              roomNames={roomEnums.map((r) => r.name)}
              functionNames={functionEnums.map((f) => f.name)}
              roleNames={allRoleNames}
              idSuggestEnabled={idSuggestEnabled}
              onIdSuggestChange={setIdSuggestEnabled}
              allObjectIds={idSuggestEnabled ? Object.keys(allObjects) : undefined}
              saveButton={hasAnyFilter && !saveFilterPromptOpen ? (
                <button
                  onClick={() => { setSaveFilterPromptOpen(true); setSaveFilterName(''); }}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10 transition-colors"
                  title={isEn ? 'Save current filter' : 'Filter speichern'}
                >
                  <Bookmark size={11} />
                  {isEn ? 'Save' : 'Speichern'}
                </button>
              ) : undefined}
            />
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
              onSearch={activePanelIdx === 0 ? handleSearch : setP2Pattern}
              onTreeScope={activePanelIdx === 0 ? handleTreeScope : p2HandleTreeScope}
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

        <div ref={panelContainerRef} className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* ── Panel 1 ── */}
          <div
            className={`flex flex-col min-w-0 overflow-hidden ${activePanelIdx === 0 && appSettings.panel2Open ? 'border-t-2 border-blue-500' : 'border-t-2 border-transparent'}`}
            style={appSettings.panel2Open ? { flex: 'none', width: `${p1Width}%` } : { flex: '1' }}
            onClick={() => setActivePanelIdx(0)}
          >
            <StateList
              ref={stateListRef}
              ids={pageIds}
              onVisibleIdsChange={setVisibleIds}
              states={stateValues ?? EMPTY_STATES}
              objects={stateObjects}
              roomMap={roomMap}
              functionMap={functionMap}
              aliasMap={aliasMap}
              allObjectIds={existingIds}
              exportIds={tableIds}
              onNavigateTo={handleNavigateTo}
              onOpenInOtherPanel={appSettings.panel2Open ? (id: string) => {
                setActivePanelIdx(1);
                setP2Pattern(id.split('.').slice(0, -1).join('.') + '.*');
              } : undefined}
              forceHideToolbarLabels={appSettings.panel2Open}
              visibleColsOverride={appSettings.panel2Open ? p1DualCols : undefined}
              onVisibleColsChange={appSettings.panel2Open ? setP1DualCols : undefined}
              historyIds={treeHistoryIds}
              smartIds={treeSmartIds}
            />
            {!appSettings.groupByPath && (
              <div className="py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full gap-2">
                  <div className="flex items-center justify-start">
                    {totalPages > 1 && (
                      <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
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
                      <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                        {isEn ? 'Next' : 'Weiter'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          {appSettings.panel2Open && (
            <div
              className="w-1 shrink-0 bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-600 active:bg-blue-500 cursor-col-resize transition-colors select-none"
              onMouseDown={handleDividerMouseDown}
              onDoubleClick={() => setP1Width(50)}
            />
          )}

          {/* ── Panel 2 ── */}
          {appSettings.panel2Open && (
            <PanelContextProvider value={panel2PanelCtx}>
              <div
                className={`flex flex-col flex-1 min-w-0 overflow-hidden ${activePanelIdx === 1 ? 'border-t-2 border-blue-500' : 'border-t-2 border-transparent'}`}
                onClick={() => setActivePanelIdx(1)}
              >
                <StateList
                  ref={p2StateListRef}
                  ids={p2PageIds}
                  states={p2StateValues ?? EMPTY_STATES}
                  objects={p2StateObjects}
                  roomMap={roomMap}
                  functionMap={functionMap}
                  aliasMap={aliasMap}
                  allObjectIds={existingIds}
                  exportIds={p2TableIds}
                  onNavigateTo={(ids) => {
                    const pat = ids.length === 1 ? ids[0] : ids[0] ? ids[0].split('.').slice(0, -1).join('.') + '.*' : '*';
                    setP2Pattern(pat);
                  }}
                  onOpenInOtherPanel={(id: string) => {
                    setActivePanelIdx(0);
                    handleSearch(id.split('.').slice(0, -1).join('.') + '.*');
                  }}
                  forceHideToolbarLabels
                  visibleColsOverride={p2VisibleCols}
                  onVisibleColsChange={setP2VisibleCols}
                  groupByPathOverride={p2GroupByPath}
                  onToggleGroupByPathOverride={() => setP2GroupByPath((v) => !v)}
                  historyIds={treeHistoryIds}
                  smartIds={treeSmartIds}
                />
                {p2TotalPages > 1 && !p2GroupByPath && (
                  <div className="py-2 px-1 border-t border-gray-200 dark:border-gray-700 shrink-0">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full gap-2">
                      <div className="flex items-center justify-start">
                        <button onClick={() => setP2Page((p) => Math.max(0, p - 1))} disabled={p2Page === 0} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                          {isEn ? 'Previous' : 'Zurück'}
                        </button>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 text-center">
                        {isEn ? 'Page' : 'Seite'} {p2Page + 1} {isEn ? 'of' : 'von'} {p2TotalPages} ({p2PageStart + 1}–{Math.min(p2PageStart + p2PageSize, p2TotalCount)} {isEn ? 'of' : 'von'} {p2TotalCount})
                      </span>
                      <div className="flex items-center justify-end">
                        <button onClick={() => setP2Page((p) => Math.min(p2TotalPages - 1, p + 1))} disabled={p2Page >= p2TotalPages - 1} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                          {isEn ? 'Next' : 'Weiter'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </PanelContextProvider>
          )}
        </div>
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
