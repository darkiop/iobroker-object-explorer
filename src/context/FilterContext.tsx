import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { SortKey } from '../components/statelist/StateListColumns';
import { PanelContextProvider } from './PanelContext';
import type { PanelContextValue } from './PanelContext';

const LS_FILTER_STATE = 'iobroker-filter-state';
const LS_SAVED_FILTERS = 'iobroker-saved-filters';

interface FilterState {
  pattern: string;
  page: number;
  historyOnly: boolean;
  smartOnly: boolean;
  colFilters: Partial<Record<SortKey, string>>;
  roomFilters: string[];
  functionFilters: string[];
  quickPatterns: string[];
}

export interface SavedFilter {
  id: string;
  name: string;
  pattern: string;
  historyOnly: boolean;
  smartOnly: boolean;
  roomFilters: string[];
  functionFilters: string[];
  quickPatterns: string[];
  colFilters: Partial<Record<SortKey, string>>;
}

function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(LS_SAVED_FILTERS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedFilter[];
  } catch { return []; }
}

function loadFilterState(): Partial<FilterState> {
  try {
    const raw = localStorage.getItem(LS_FILTER_STATE);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<FilterState>;
  } catch { return {}; }
}

function parseEnumFilters(pattern: string): { basePattern: string; roomFilter: string | null; functionFilter: string | null; typeFilter: string | null; roleFilter: string | null; idFilter: string | null; nameFilter: string | null; descFilter: string | null } {
  let base = pattern;
  let roomFilter: string | null = null;
  let functionFilter: string | null = null;
  let typeFilter: string | null = null;
  let roleFilter: string | null = null;
  let idFilter: string | null = null;
  let nameFilter: string | null = null;
  let descFilter: string | null = null;
  const roomMatch = base.match(/\broom:"([^"]+)"/i) || base.match(/\broom:(\S+)/i);
  if (roomMatch) { roomFilter = roomMatch[1]; base = base.replace(roomMatch[0], '').trim(); }
  const funcMatch = base.match(/\bfunction:"([^"]+)"/i) || base.match(/\bfunction:(\S+)/i);
  if (funcMatch) { functionFilter = funcMatch[1]; base = base.replace(funcMatch[0], '').trim(); }
  const typeMatch = base.match(/\btype:"([^"]+)"/i) || base.match(/\btype:(\S+)/i);
  if (typeMatch) { typeFilter = typeMatch[1]; base = base.replace(typeMatch[0], '').trim(); }
  const roleMatch = base.match(/\brole:"([^"]+)"/i) || base.match(/\brole:(\S+)/i);
  if (roleMatch) { roleFilter = roleMatch[1]; base = base.replace(roleMatch[0], '').trim(); }
  const idMatch = base.match(/\bid:"([^"]+)"/i) || base.match(/\bid:(\S+)/i);
  if (idMatch) { idFilter = idMatch[1]; base = base.replace(idMatch[0], '').trim(); }
  const nameMatch = base.match(/\bname:"([^"]+)"/i) || base.match(/\bname:(\S+)/i);
  if (nameMatch) { nameFilter = nameMatch[1]; base = base.replace(nameMatch[0], '').trim(); }
  const descMatch = base.match(/\bdesc:"([^"]+)"/i) || base.match(/\bdesc:(\S+)/i);
  if (descMatch) { descFilter = descMatch[1]; base = base.replace(descMatch[0], '').trim(); }
  return { basePattern: base || '*', roomFilter, functionFilter, typeFilter, roleFilter, idFilter, nameFilter, descFilter };
}

export { parseEnumFilters };

interface FilterContextValue {
  // State
  pattern: string;
  page: number;
  historyOnly: boolean;
  smartOnly: boolean;
  danglingAliasFilter: boolean;
  colFilters: Partial<Record<SortKey, string>>;
  roomFilters: Set<string>;
  roomsOpen: boolean;
  functionFilters: Set<string>;
  functionsOpen: boolean;
  typesOpen: boolean;
  quickPatterns: Set<string>;
  quickOpen: boolean;
  treeFilter: string | null;
  treeSearch: string;
  treeExpandSignal: { depth: number; seq: number } | undefined;
  sidebarToggleSeq: number;
  fulltextEnabled: boolean;
  exactEnabled: boolean;
  idSuggestEnabled: boolean;
  savedFiltersList: SavedFilter[];
  savedFiltersOpen: boolean;
  saveFilterPromptOpen: boolean;
  saveFilterName: string;
  // Derived
  basePattern: string;
  roomFilter: string | null;
  functionFilter: string | null;
  typeFilter: string | null;
  roleFilter: string | null;
  idFilter: string | null;
  nameFilter: string | null;
  descFilter: string | null;
  hasAnyFilter: boolean;
  // Setters
  setPattern: (p: string) => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setHistoryOnly: React.Dispatch<React.SetStateAction<boolean>>;
  setSmartOnly: React.Dispatch<React.SetStateAction<boolean>>;
  setDanglingAliasFilter: React.Dispatch<React.SetStateAction<boolean>>;
  setColFilters: React.Dispatch<React.SetStateAction<Partial<Record<SortKey, string>>>>;
  setRoomFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRoomsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFunctionFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFunctionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTypesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setQuickPatterns: React.Dispatch<React.SetStateAction<Set<string>>>;
  setQuickOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTreeFilter: React.Dispatch<React.SetStateAction<string | null>>;
  setTreeSearch: React.Dispatch<React.SetStateAction<string>>;
  setTreeExpandSignal: React.Dispatch<React.SetStateAction<{ depth: number; seq: number } | undefined>>;
  setSidebarToggleSeq: React.Dispatch<React.SetStateAction<number>>;
  setFulltextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setExactEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setIdSuggestEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setSavedFiltersList: React.Dispatch<React.SetStateAction<SavedFilter[]>>;
  setSavedFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSaveFilterPromptOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSaveFilterName: React.Dispatch<React.SetStateAction<string>>;
  // Complex callbacks
  handleSearch: (newPattern: string) => void;
  handleColFilterChange: (filters: Partial<Record<SortKey, string>>) => void;
  handleClearTreeFilter: () => void;
  handleSidebarToggle: () => void;
  resetAllFilters: () => void;
  handleRoomToggle: (name: string) => void;
  handleFunctionToggle: (name: string) => void;
  handleTypeToggle: (typeName: string) => void;
  handleTreeScope: (prefix: string) => void;
  handleLoadSavedFilter: (f: SavedFilter) => void;
  handleDeleteSavedFilter: (id: string) => void;
  handleSaveCurrentFilter: (saveFilterName: string) => void;
  handleNavigateTo: (ids: string[]) => void;
  handleCreateDatapointAtPath: (prefix: string) => void;
  // Navigation history
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilterContext must be used inside FilterContextProvider');
  return ctx;
}

export function FilterContextProvider({ children }: { children: ReactNode }) {
  const savedFilters = useRef<Partial<FilterState>>(loadFilterState());

  const [pattern, setPatternRaw] = useState(() => savedFilters.current.pattern ?? '*');
  const [page, setPage] = useState(() => savedFilters.current.page ?? 0);
  const [historyOnly, setHistoryOnly] = useState(() => savedFilters.current.historyOnly ?? false);
  const [smartOnly, setSmartOnly] = useState(() => savedFilters.current.smartOnly ?? false);
  const [danglingAliasFilter, setDanglingAliasFilter] = useState(false);
  const [colFilters, setColFilters] = useState<Partial<Record<SortKey, string>>>(() => savedFilters.current.colFilters ?? {});
  const [roomFilters, setRoomFilters] = useState<Set<string>>(() => new Set(savedFilters.current.roomFilters ?? []));
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [functionFilters, setFunctionFilters] = useState<Set<string>>(() => new Set(savedFilters.current.functionFilters ?? []));
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [quickPatterns, setQuickPatterns] = useState<Set<string>>(() => new Set(savedFilters.current.quickPatterns ?? []));
  const [quickOpen, setQuickOpen] = useState(false);
  const [treeFilter, setTreeFilter] = useState<string | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [treeExpandSignal, setTreeExpandSignal] = useState<{ depth: number; seq: number } | undefined>(undefined);
  const [sidebarToggleSeq, setSidebarToggleSeq] = useState(0);
  const [fulltextEnabled, setFulltextEnabled] = useState(false);
  const [exactEnabled, setExactEnabled] = useState(false);
  const [idSuggestEnabled, setIdSuggestEnabled] = useState(false);
  const [savedFiltersList, setSavedFiltersList] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false);
  const [saveFilterPromptOpen, setSaveFilterPromptOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');

  const prevTreeFilterRef = useRef<string | null>(null);

  // ── Filter navigation history ──────────────────────────────────────────────
  type FilterSnapshot = {
    pattern: string; historyOnly: boolean; smartOnly: boolean; danglingAliasFilter: boolean;
    colFilters: Partial<Record<SortKey, string>>; roomFilters: Set<string>;
    functionFilters: Set<string>; quickPatterns: Set<string>; treeFilter: string | null;
  };
  const navHistory = useRef<FilterSnapshot[]>([]);
  const navIdx = useRef<number>(-1);
  const isNavigating = useRef(false);

  const snapshotNow = useCallback((): FilterSnapshot => ({
    pattern, historyOnly, smartOnly, danglingAliasFilter,
    colFilters, roomFilters: new Set(roomFilters), functionFilters: new Set(functionFilters),
    quickPatterns: new Set(quickPatterns), treeFilter,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pattern, historyOnly, smartOnly, danglingAliasFilter, colFilters, roomFilters, functionFilters, quickPatterns, treeFilter]);

  const pushNavHistory = useCallback((snap: FilterSnapshot) => {
    if (isNavigating.current) return;
    const stack = navHistory.current;
    // Truncate forward history
    const next = stack.slice(0, navIdx.current + 1);
    // Avoid duplicate consecutive entries
    const last = next[next.length - 1];
    if (last && last.pattern === snap.pattern && last.treeFilter === snap.treeFilter &&
        last.historyOnly === snap.historyOnly && last.smartOnly === snap.smartOnly) return;
    next.push(snap);
    if (next.length > 50) next.shift();
    navHistory.current = next;
    navIdx.current = next.length - 1;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySnapshot = useCallback((snap: FilterSnapshot) => {
    isNavigating.current = true;
    setPatternRaw(snap.pattern);
    setHistoryOnly(snap.historyOnly);
    setSmartOnly(snap.smartOnly);
    setDanglingAliasFilter(snap.danglingAliasFilter);
    setColFilters(snap.colFilters);
    setRoomFilters(new Set(snap.roomFilters));
    setFunctionFilters(new Set(snap.functionFilters));
    setQuickPatterns(new Set(snap.quickPatterns));
    setTreeFilter(snap.treeFilter);
    setPage(0);
    // Reset flag after state batch settles
    setTimeout(() => { isNavigating.current = false; }, 0);
  }, []);

  const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false });

  const updateNavState = useCallback(() => {
    setNavState({ canGoBack: navIdx.current > 0, canGoForward: navIdx.current < navHistory.current.length - 1 });
  }, []);

  const goBack = useCallback(() => {
    if (navIdx.current <= 0) return;
    navIdx.current -= 1;
    applySnapshot(navHistory.current[navIdx.current]);
    updateNavState();
  }, [applySnapshot, updateNavState]);

  const goForward = useCallback(() => {
    if (navIdx.current >= navHistory.current.length - 1) return;
    navIdx.current += 1;
    applySnapshot(navHistory.current[navIdx.current]);
    updateNavState();
  }, [applySnapshot, updateNavState]);

  const { basePattern, roomFilter, functionFilter, typeFilter, roleFilter, idFilter, nameFilter, descFilter } = parseEnumFilters(pattern);

  const hasAnyFilter =
    pattern !== '*' || historyOnly || smartOnly || danglingAliasFilter ||
    roomFilters.size > 0 || functionFilters.size > 0 || quickPatterns.size > 0 ||
    !!treeFilter || !!treeSearch || exactEnabled ||
    Object.values(colFilters).some((v) => v.trim() !== '');

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      const state: Omit<FilterState, 'page'> = {
        pattern, historyOnly, smartOnly, colFilters,
        roomFilters: [...roomFilters],
        functionFilters: [...functionFilters],
        quickPatterns: [...quickPatterns],
      };
      localStorage.setItem(LS_FILTER_STATE, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
  }, [pattern, historyOnly, smartOnly, colFilters, roomFilters, functionFilters, quickPatterns]);

  // Collapse tree when treeFilter is cleared
  useEffect(() => {
    const prev = prevTreeFilterRef.current;
    if (prev && !treeFilter) {
      setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
    }
    prevTreeFilterRef.current = treeFilter;
  }, [treeFilter]);

  const setPattern = useCallback((p: string) => setPatternRaw(p), []);

  const handleSearch = useCallback((newPattern: string) => {
    pushNavHistory(snapshotNow());
    setPatternRaw(newPattern);
    setPage(0);
    setRoomFilters(new Set());
    setFunctionFilters(new Set());
    setQuickPatterns(new Set());
    setHistoryOnly(false);
    setSmartOnly(false);
    updateNavState();
  }, [pushNavHistory, snapshotNow, updateNavState]);

  const handleColFilterChange = useCallback((filters: Partial<Record<SortKey, string>>) => {
    setColFilters(filters);
    setPage(0);
  }, []);

  const handleClearTreeFilter = useCallback(() => {
    setTreeFilter(null);
    setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
  }, []);

  const handleSidebarToggle = useCallback(() => setSidebarToggleSeq((s) => s + 1), []);

  const resetAllFilters = useCallback(() => {
    setPatternRaw('*');
    setPage(0);
    setHistoryOnly(false);
    setSmartOnly(false);
    setDanglingAliasFilter(false);
    setRoomFilters(new Set());
    setFunctionFilters(new Set());
    setQuickPatterns(new Set());
    setTreeFilter(null);
    setTreeSearch('');
    setExactEnabled(false);
    setColFilters({});
    setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
  }, []);

  const handleRoomToggle = useCallback((name: string) => {
    pushNavHistory(snapshotNow());
    updateNavState();
    setPatternRaw(prev => {
      const { basePattern: base, roomFilter: currentRoom, functionFilter: currentFunc } = parseEnumFilters(prev);
      const isActive = currentRoom?.toLowerCase() === name.toLowerCase();
      const encoded = name.includes(' ') ? `"${name}"` : name;
      const basePart = base === '*' ? '' : base;
      const funcPart = currentFunc ? `function:${currentFunc.includes(' ') ? `"${currentFunc}"` : currentFunc}` : '';
      const roomPart = isActive ? '' : `room:${encoded}`;
      return [roomPart, funcPart, basePart].filter(Boolean).join(' ') || '*';
    });
    setPage(0);
  }, []);

  const handleFunctionToggle = useCallback((name: string) => {
    pushNavHistory(snapshotNow());
    updateNavState();
    setPatternRaw(prev => {
      const { basePattern: base, roomFilter: currentRoom, functionFilter: currentFunc } = parseEnumFilters(prev);
      const isActive = currentFunc?.toLowerCase() === name.toLowerCase();
      const encoded = name.includes(' ') ? `"${name}"` : name;
      const basePart = base === '*' ? '' : base;
      const roomPart = currentRoom ? `room:${currentRoom.includes(' ') ? `"${currentRoom}"` : currentRoom}` : '';
      const funcPart = isActive ? '' : `function:${encoded}`;
      return [roomPart, funcPart, basePart].filter(Boolean).join(' ') || '*';
    });
    setPage(0);
  }, []);

  const handleTypeToggle = useCallback((typeName: string) => {
    pushNavHistory(snapshotNow());
    updateNavState();
    setPatternRaw(prev => {
      const parsed = parseEnumFilters(prev);
      const isActive = parsed.typeFilter?.toLowerCase() === typeName.toLowerCase();
      const base = parsed.basePattern;
      const basePart = base === '*' ? '' : base;
      const roomPart = parsed.roomFilter ? `room:${parsed.roomFilter.includes(' ') ? `"${parsed.roomFilter}"` : parsed.roomFilter}` : '';
      const funcPart = parsed.functionFilter ? `function:${parsed.functionFilter.includes(' ') ? `"${parsed.functionFilter}"` : parsed.functionFilter}` : '';
      const rolePart = parsed.roleFilter ? `role:${parsed.roleFilter.includes(' ') ? `"${parsed.roleFilter}"` : parsed.roleFilter}` : '';
      const typePart = isActive ? '' : `type:${typeName}`;
      return [roomPart, funcPart, typePart, rolePart, basePart].filter(Boolean).join(' ') || '*';
    });
    setPage(0);
  }, []);

  const handleTreeScope = useCallback((prefix: string) => {
    pushNavHistory(snapshotNow());
    updateNavState();
    setPatternRaw(prefix.replace(/\.$/, '') + '.*');
    setPage(0);
    setRoomFilters(new Set());
    setFunctionFilters(new Set());
    setQuickPatterns(new Set());
    setHistoryOnly(false);
    setSmartOnly(false);
  }, [pushNavHistory, snapshotNow, updateNavState]);

  const handleLoadSavedFilter = useCallback((f: SavedFilter) => {
    setPatternRaw(f.pattern);
    setHistoryOnly(f.historyOnly);
    setSmartOnly(f.smartOnly);
    setRoomFilters(new Set(f.roomFilters));
    setFunctionFilters(new Set(f.functionFilters));
    setQuickPatterns(new Set(f.quickPatterns));
    setColFilters(f.colFilters);
    setPage(0);
    setTreeFilter(null);
    setExactEnabled(false);
  }, []);

  const handleDeleteSavedFilter = useCallback((id: string) => {
    setSavedFiltersList((prev) => {
      const next = prev.filter((f) => f.id !== id);
      localStorage.setItem(LS_SAVED_FILTERS, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSaveCurrentFilter = useCallback((name: string) => {
    if (!name.trim()) return;
    const newFilter: SavedFilter = {
      id: String(Date.now()),
      name: name.trim(),
      pattern,
      historyOnly,
      smartOnly,
      roomFilters: [...roomFilters],
      functionFilters: [...functionFilters],
      quickPatterns: [...quickPatterns],
      colFilters,
    };
    setSavedFiltersList((prev) => {
      const next = [...prev, newFilter];
      localStorage.setItem(LS_SAVED_FILTERS, JSON.stringify(next));
      return next;
    });
    setSaveFilterName('');
    setSaveFilterPromptOpen(false);
  }, [pattern, historyOnly, smartOnly, roomFilters, functionFilters, quickPatterns, colFilters]);

  const handleNavigateTo = useCallback((ids: string[]) => {
    const pat = ids.length === 1 ? ids[0] : 'alias.0.*';
    setPatternRaw(pat);
    setPage(0);
    setHistoryOnly(false);
    setSmartOnly(false);
    setColFilters({});
  }, []);

  const handleCreateDatapointAtPath = useCallback((prefix: string) => {
    // Notifies SelectionContext — handled via a setter passed in from there
    // The actual newDatapointInitialId state lives in SelectionContext
    // This callback is here for interface completeness; App.tsx uses setNewDatapointInitialId directly
    void prefix;
  }, []);

  const value = useMemo<FilterContextValue>(() => ({
    pattern, page, historyOnly, smartOnly, danglingAliasFilter,
    colFilters, roomFilters, roomsOpen, functionFilters, functionsOpen, typesOpen,
    quickPatterns, quickOpen, treeFilter, treeSearch, treeExpandSignal, sidebarToggleSeq,
    fulltextEnabled, exactEnabled, idSuggestEnabled,
    savedFiltersList, savedFiltersOpen, saveFilterPromptOpen, saveFilterName,
    basePattern, roomFilter, functionFilter, typeFilter, roleFilter, idFilter, nameFilter, descFilter, hasAnyFilter,
    setPattern, setPage, setHistoryOnly, setSmartOnly, setDanglingAliasFilter,
    setColFilters, setRoomFilters, setRoomsOpen, setFunctionFilters, setFunctionsOpen,
    setTypesOpen, setQuickPatterns, setQuickOpen, setTreeFilter, setTreeSearch,
    setTreeExpandSignal, setSidebarToggleSeq, setFulltextEnabled, setExactEnabled,
    setIdSuggestEnabled, setSavedFiltersList, setSavedFiltersOpen, setSaveFilterPromptOpen,
    setSaveFilterName,
    handleSearch, handleColFilterChange, handleClearTreeFilter, handleSidebarToggle,
    resetAllFilters, handleRoomToggle, handleFunctionToggle, handleTypeToggle,
    handleTreeScope, handleLoadSavedFilter, handleDeleteSavedFilter,
    handleSaveCurrentFilter, handleNavigateTo, handleCreateDatapointAtPath,
    canGoBack: navState.canGoBack, canGoForward: navState.canGoForward, goBack, goForward,
  }), [
    pattern, page, historyOnly, smartOnly, danglingAliasFilter,
    colFilters, roomFilters, roomsOpen, functionFilters, functionsOpen, typesOpen,
    quickPatterns, quickOpen, treeFilter, treeSearch, treeExpandSignal, sidebarToggleSeq,
    fulltextEnabled, exactEnabled, idSuggestEnabled,
    savedFiltersList, savedFiltersOpen, saveFilterPromptOpen, saveFilterName,
    basePattern, roomFilter, functionFilter, typeFilter, roleFilter, idFilter, nameFilter, descFilter, hasAnyFilter,
    setPattern, setPage, setHistoryOnly, setSmartOnly, setDanglingAliasFilter,
    setColFilters, setRoomFilters, setRoomsOpen, setFunctionFilters, setFunctionsOpen,
    setTypesOpen, setQuickPatterns, setQuickOpen, setTreeFilter, setTreeSearch,
    setTreeExpandSignal, setSidebarToggleSeq, setFulltextEnabled, setExactEnabled,
    setIdSuggestEnabled, setSavedFiltersList, setSavedFiltersOpen, setSaveFilterPromptOpen,
    setSaveFilterName,
    handleSearch, handleColFilterChange, handleClearTreeFilter, handleSidebarToggle,
    resetAllFilters, handleRoomToggle, handleFunctionToggle, handleTypeToggle,
    handleTreeScope, handleLoadSavedFilter, handleDeleteSavedFilter,
    handleSaveCurrentFilter, handleNavigateTo, handleCreateDatapointAtPath,
    navState, goBack, goForward,
  ]);

  const panel1Value: PanelContextValue = {
    colFilters,
    handleColFilterChange,
    pattern,
    treeFilter,
    handleClearTreeFilter,
    sidebarToggleSeq,
    fulltextEnabled,
    handleTreeScope,
    resetAllFilters,
  };

  return (
    <FilterContext.Provider value={value}>
      <PanelContextProvider value={panel1Value}>
        {children}
      </PanelContextProvider>
    </FilterContext.Provider>
  );
}
