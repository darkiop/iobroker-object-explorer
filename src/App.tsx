import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import StateTree from './components/StateTree';
import StateList from './components/StateList';
import ObjectEditModal from './components/ObjectEditModal';
import HistoryModal from './components/HistoryModal';
import NewDatapointModal from './components/NewDatapointModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import EnumManagerModal from './components/EnumManagerModal';
import AliasReplaceModal from './components/AliasReplaceModal';
import AutoCreateAliasModal from './components/AutoCreateAliasModal';
import LanguageDropdown from './components/LanguageDropdown';
import { useAllObjects, useFilteredObjects, useStateValues, useRoomMap, useFunctionMap, useRoomEnums, useFunctionEnums, useAliasMap } from './hooks/useStates';
import { hasHistory, hasSmartName } from './api/iobroker';
import type { StateListHandle } from './components/StateList';
import type { SortKey, DateFormatSetting } from './components/stateListColumns';
import { ALL_COLUMNS, DEFAULT_COLS, getColumnLabel, CONFIGURABLE_WIDTH_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MAX_WIDTHS } from './components/stateListColumns';
import type { IoBrokerObject, IoBrokerState } from './types/iobroker';
import { filterObjectIds } from './utils/filterObjectIds';
import { Database, Mic2, ChevronDown, ChevronRight, Home, Zap, RotateCcw, Layers, X, Trash2, Check, Loader2, AlertCircle, Bookmark, AlertTriangle, Tag } from 'lucide-react';
import { getTypeColor } from './utils/typeColor';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500];
const LS_APP_SETTINGS = 'iobroker-app-settings';
const LS_EXPERT_MODE = 'iobroker-expert-mode';
const LS_FILTER_STATE = 'iobroker-filter-state';
const LS_SAVED_FILTERS = 'iobroker-saved-filters';
const DEFAULT_QUICK_PATTERNS = ['alias.0.*', 'javascript.0.*', '0_userdata.0.*'] as const;
const EMPTY_OBJECTS: Record<string, IoBrokerObject> = {};
const EMPTY_STATES: Record<string, IoBrokerState> = {};
const EMPTY_STRING_MAP: Record<string, string> = {};
const EMPTY_ALIAS_MAP = new Map<string, string[]>();

type UiFontSize = 'small' | 'normal' | 'large' | 'xl';

interface AppSettings {
  language: 'en' | 'de';
  dateFormat: DateFormatSetting;
  visibleCols: SortKey[];
  extraQuickFilters: string[];
  toolbarLabels: boolean;
  pageSize: number;
  tableFontSize: UiFontSize;
  treeFontSize: UiFontSize;
  treeShowCount: boolean;
  showDesc: boolean;
  groupByPath: boolean;
  customDefaultWidths: Partial<Record<SortKey, number>>;
  customMaxWidths: Partial<Record<SortKey, number>>;
}

function getDefaultAppSettings(): AppSettings {
  return {
    language: 'en',
    dateFormat: 'de',
    visibleCols: DEFAULT_COLS,
    extraQuickFilters: [],
    toolbarLabels: true,
    pageSize: 50,
    tableFontSize: 'normal',
    treeFontSize: 'normal',
    treeShowCount: true,
    showDesc: true,
    groupByPath: true,
    customDefaultWidths: {},
    customMaxWidths: {},
  };
}

function parseEnumFilters(pattern: string): { basePattern: string; roomFilter: string | null; functionFilter: string | null; typeFilter: string | null; roleFilter: string | null } {
  let base = pattern;
  let roomFilter: string | null = null;
  let functionFilter: string | null = null;
  let typeFilter: string | null = null;
  let roleFilter: string | null = null;

  const roomMatch = base.match(/\broom:"([^"]+)"/i) || base.match(/\broom:(\S+)/i);
  if (roomMatch) { roomFilter = roomMatch[1]; base = base.replace(roomMatch[0], '').trim(); }

  const funcMatch = base.match(/\bfunction:"([^"]+)"/i) || base.match(/\bfunction:(\S+)/i);
  if (funcMatch) { functionFilter = funcMatch[1]; base = base.replace(funcMatch[0], '').trim(); }

  const typeMatch = base.match(/\btype:"([^"]+)"/i) || base.match(/\btype:(\S+)/i);
  if (typeMatch) { typeFilter = typeMatch[1]; base = base.replace(typeMatch[0], '').trim(); }

  const roleMatch = base.match(/\brole:"([^"]+)"/i) || base.match(/\brole:(\S+)/i);
  if (roleMatch) { roleFilter = roleMatch[1]; base = base.replace(roleMatch[0], '').trim(); }

  return { basePattern: base || '*', roomFilter, functionFilter, typeFilter, roleFilter };
}

function normalizeQuickPattern(input: string): string {
  let v = input.trim();
  if (!v) return '';
  if (!v.endsWith('*')) v = `${v.replace(/\.+$/, '')}.*`;
  if (v.endsWith('*') && !v.endsWith('.*')) v = `${v.replace(/\*+$/, '')}.*`;
  return v;
}

function parseColWidthMap(raw: unknown): Partial<Record<SortKey, number>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => ALL_COLUMNS.some((c) => c.key === k) && typeof v === 'number' && (v as number) > 0)
      .map(([k, v]) => [k, v as number])
  ) as Partial<Record<SortKey, number>>;
}

function loadAppSettings(): AppSettings {
  const fallback: AppSettings = getDefaultAppSettings();
  try {
    const raw = localStorage.getItem(LS_APP_SETTINGS);
    if (!raw) return fallback;
    const unknown: unknown = JSON.parse(raw);
    if (typeof unknown !== 'object' || unknown === null) return fallback;
    const parsed = unknown as Partial<AppSettings>;
    const validLanguage = parsed.language === 'de' || parsed.language === 'en' ? parsed.language : 'en';
    const validCols = Array.isArray(parsed.visibleCols)
      ? parsed.visibleCols.filter((k): k is SortKey => ALL_COLUMNS.some((c) => c.key === k))
      : [];
    const validDate = parsed.dateFormat === 'de' || parsed.dateFormat === 'us' || parsed.dateFormat === 'iso' ? parsed.dateFormat : 'de';
    const validExtra = Array.isArray(parsed.extraQuickFilters)
      ? parsed.extraQuickFilters.filter((x): x is string => typeof x === 'string').map(normalizeQuickPattern).filter(Boolean)
      : [];
    const parsedPageSize = typeof parsed.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(parsed.pageSize) ? parsed.pageSize : 50;
    const validFontSizes = ['small', 'normal', 'large', 'xl'] as const;
    const tableFontSize = validFontSizes.includes(parsed.tableFontSize as UiFontSize) ? parsed.tableFontSize as UiFontSize : 'normal';
    const treeFontSize  = validFontSizes.includes(parsed.treeFontSize  as UiFontSize) ? parsed.treeFontSize  as UiFontSize : 'normal';
    return {
      language: validLanguage,
      dateFormat: validDate,
      visibleCols: validCols.length > 0 ? validCols : DEFAULT_COLS,
      extraQuickFilters: [...new Set(validExtra.filter((p) => !DEFAULT_QUICK_PATTERNS.includes(p as typeof DEFAULT_QUICK_PATTERNS[number])))],
      toolbarLabels: parsed.toolbarLabels !== false,
      pageSize: parsedPageSize,
      tableFontSize,
      treeFontSize,
      treeShowCount: parsed.treeShowCount !== false,
      showDesc: parsed.showDesc !== false,
      groupByPath: parsed.groupByPath !== false,
      customDefaultWidths: parseColWidthMap(parsed.customDefaultWidths),
      customMaxWidths: parseColWidthMap(parsed.customMaxWidths),
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

const DATE_FORMAT_OPTIONS: { value: DateFormatSetting; label: string }[] = [
  { value: 'de', label: 'DD.MM.YYYY HH:mm:ss' },
  { value: 'us', label: 'MM/DD/YYYY HH:mm:ss' },
  { value: 'iso', label: 'YYYY-MM-DD HH:mm:ss' },
];

function DateFormatDropdown({ value, onChange }: { value: DateFormatSetting; onChange: (next: DateFormatSetting) => void }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = DATE_FORMAT_OPTIONS.find((opt) => opt.value === value) ?? DATE_FORMAT_OPTIONS[0];

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-56">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-8 px-2.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors inline-flex items-center justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-mono">{selected.label}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 z-50 w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
          {DATE_FORMAT_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                  active
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="font-mono">{opt.label}</span>
                {active && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

interface SavedFilter {
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
  } catch {
    return [];
  }
}

function loadFilterState(): Partial<FilterState> {
  try {
    const raw = localStorage.getItem(LS_FILTER_STATE);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<FilterState>;
  } catch {
    return {};
  }
}

function AppContent() {
  const stateListRef = useRef<StateListHandle>(null);
  const savedFilters = useRef<Partial<FilterState>>(loadFilterState());
  const [pattern, setPattern] = useState(() => savedFilters.current.pattern ?? '*');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(() => savedFilters.current.page ?? 0);
  const [historyOnly, setHistoryOnly] = useState(() => savedFilters.current.historyOnly ?? false);
  const [smartOnly, setSmartOnly] = useState(() => savedFilters.current.smartOnly ?? false);
  const [colFilters, setColFilters] = useState<Partial<Record<SortKey, string>>>(() => savedFilters.current.colFilters ?? {});
  const [treeExpandSignal, setTreeExpandSignal] = useState<{ depth: number; seq: number } | undefined>(undefined);
  const [sidebarToggleSeq, setSidebarToggleSeq] = useState(0);
  const [treeFilter, setTreeFilter] = useState<string | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [roomFilters, setRoomFilters] = useState<Set<string>>(() => new Set(savedFilters.current.roomFilters ?? []));
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [functionFilters, setFunctionFilters] = useState<Set<string>>(() => new Set(savedFilters.current.functionFilters ?? []));
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [quickPatterns, setQuickPatterns] = useState<Set<string>>(() => new Set(savedFilters.current.quickPatterns ?? []));
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'connection' | 'display' | 'columns' | 'filters'>('connection');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsHostIp, setSettingsHostIp] = useState('');
  const [settingsHostPort, setSettingsHostPort] = useState('8093');
  const [settingsHostTesting, setSettingsHostTesting] = useState(false);
  const [settingsHostError, setSettingsHostError] = useState<string | null>(null);
  const [newQuickFilter, setNewQuickFilter] = useState('');
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => loadAppSettings());
  const [fulltextEnabled, setFulltextEnabled] = useState(false);
  const [exactEnabled, setExactEnabled] = useState(false);
  const [idSuggestEnabled, setIdSuggestEnabled] = useState(false);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [newDatapointInitialId, setNewDatapointInitialId] = useState<string | null>(null);
  const [enumManagerOpen, setEnumManagerOpen] = useState(false);
  const [expertMode, setExpertMode] = useState<boolean>(() => localStorage.getItem(LS_EXPERT_MODE) === 'true');
  const [danglingAliasFilter, setDanglingAliasFilter] = useState(false);
  const [aliasReplaceInitialStr, setAliasReplaceInitialStr] = useState<string | null>(null);
  const [autoAliasDeviceId, setAutoAliasDeviceId] = useState<string | null>(null);
  const [savedFiltersList, setSavedFiltersList] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false);
  const [saveFilterPromptOpen, setSaveFilterPromptOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const prevTreeFilterRef = useRef<string | null>(null);

  const { basePattern, roomFilter, functionFilter, typeFilter, roleFilter } = useMemo(() => parseEnumFilters(pattern), [pattern]);

  const { data: stateObjectsData, error: objectsError, refetch: refetchFilteredObjects } = useFilteredObjects(basePattern, fulltextEnabled, exactEnabled);
  const { data: allObjectsData, refetch: refetchAllObjects } = useAllObjects();
  const { data: roomMapData, refetch: refetchRoomMap } = useRoomMap();
  const { data: functionMapData, refetch: refetchFunctionMap } = useFunctionMap();
  const { data: roomEnums = [], refetch: refetchRoomEnums } = useRoomEnums();
  const { data: functionEnums = [], refetch: refetchFunctionEnums } = useFunctionEnums();
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

  // Tree uses all objects (not just pattern-filtered) so namespace structure is always complete
  const allStateIds = useMemo(
    () => Object.keys(allObjects).filter(id => allObjects[id]?.type === 'state').sort(),
    [allObjects]
  );
  const treeHistoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) {
      if (hasHistory(obj)) set.add(id);
    }
    return set;
  }, [allObjects]);
  const treeSmartIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, obj] of Object.entries(allObjects)) {
      if (hasSmartName(obj)) set.add(id);
    }
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
    // When dangling alias filter is active, source from full allObjects (not pattern-filtered stateObjects)
    const sourceObjects = danglingAliasFilter ? allObjects : stateObjects;
    let ids = danglingAliasFilter
      ? Object.keys(allObjects).filter((id) => id.startsWith('alias.0.')).sort()
      : Object.keys(stateObjects).sort();
    if (!danglingAliasFilter) {
      if (historyOnly) ids = ids.filter((id) => historyIds.has(id));
      if (smartOnly) ids = ids.filter((id) => smartIds.has(id));
    }
    return filterObjectIds({
      ids,
      objects: sourceObjects,
      roomMap,
      functionMap,
      historyIds,
      smartIds,
      aliasMap,
      colFilters,
      roomFilters,
      functionFilters,
      quickPatterns,
      patternRoomFilter: roomFilter,
      patternFunctionFilter: functionFilter,
      patternTypeFilter: typeFilter,
      patternRoleFilter: roleFilter,
      danglingAliases: danglingAliasFilter,
      allObjectIds: existingIds,
    });
  }, [stateObjects, allObjects, historyOnly, historyIds, smartOnly, smartIds, colFilters, roomMap, functionMap, aliasMap, roomFilters, functionFilters, quickPatterns, roomFilter, functionFilter, typeFilter, roleFilter, danglingAliasFilter, existingIds]);

  const tableIds = useMemo(
    () => treeFilter ? objectIds.filter((id) => id.startsWith(treeFilter)) : objectIds,
    [objectIds, treeFilter]
  );

  const totalCount = tableIds.length;
  const pageStart = page * appSettings.pageSize;
  const pageIds = useMemo(
    () => tableIds.slice(pageStart, pageStart + appSettings.pageSize),
    [tableIds, pageStart, appSettings.pageSize]
  );
  const totalPages = Math.ceil(totalCount / appSettings.pageSize);

  const { data: stateValues, refetch: refetchStateValues } = useStateValues(pageIds);

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
  }, [settingsOpen, selectedId, totalPages]);

  useEffect(() => {
    try {
      const state: FilterState = {
        pattern,
        page,
        historyOnly,
        smartOnly,
        colFilters,
        roomFilters: [...roomFilters],
        functionFilters: [...functionFilters],
        quickPatterns: [...quickPatterns],
      };
      localStorage.setItem(LS_FILTER_STATE, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [pattern, page, historyOnly, smartOnly, colFilters, roomFilters, functionFilters, quickPatterns]);

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

  const handleRoomToggle = useCallback((name: string) => {
    setPattern(prev => {
      const { basePattern: base, roomFilter: currentRoom, functionFilter: currentFunc } = parseEnumFilters(prev);
      const isActive = currentRoom?.toLowerCase() === name.toLowerCase();
      const encoded = name.includes(' ') ? `"${name}"` : name;
      const basePart = base === '*' ? '' : base;
      const funcPart = currentFunc ? `function:${currentFunc.includes(' ') ? `"${currentFunc}"` : currentFunc}` : '';
      const roomPart = isActive ? '' : `room:${encoded}`;
      return [roomPart, funcPart, basePart].filter(Boolean).join(' ') || '*';
    });
    setPage(0);
    setSelectedId(null);
  }, []);

  const handleFunctionToggle = useCallback((name: string) => {
    setPattern(prev => {
      const { basePattern: base, roomFilter: currentRoom, functionFilter: currentFunc } = parseEnumFilters(prev);
      const isActive = currentFunc?.toLowerCase() === name.toLowerCase();
      const encoded = name.includes(' ') ? `"${name}"` : name;
      const basePart = base === '*' ? '' : base;
      const roomPart = currentRoom ? `room:${currentRoom.includes(' ') ? `"${currentRoom}"` : currentRoom}` : '';
      const funcPart = isActive ? '' : `function:${encoded}`;
      return [roomPart, funcPart, basePart].filter(Boolean).join(' ') || '*';
    });
    setPage(0);
    setSelectedId(null);
  }, []);

  const handleTypeToggle = useCallback((typeName: string) => {
    setPattern(prev => {
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
    setSelectedId(null);
  }, []);

  const handleColFilterChange = useCallback((filters: Partial<Record<SortKey, string>>) => {
    setColFilters(filters);
    setPage(0);
  }, []);

  const openSettings = useCallback(() => {
    const stored = localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost ?? '';
    const colonIdx = stored.lastIndexOf(':');
    setSettingsHostIp(colonIdx > 0 ? stored.slice(0, colonIdx) : stored);
    setSettingsHostPort(colonIdx > 0 ? stored.slice(colonIdx + 1) : '8093');
    setSettingsHostError(null);
    setSettingsTab('connection');
    const latest = loadAppSettings();
    try {
      const rawCols = localStorage.getItem('iobroker-visible-cols');
      if (rawCols) {
        const parsedCols: unknown = JSON.parse(rawCols);
        const parsed = Array.isArray(parsedCols) ? parsedCols as unknown[] : [];
        const valid = parsed.filter((k): k is SortKey => typeof k === 'string' && ALL_COLUMNS.some((c) => c.key === k));
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
    const validPageSize = PAGE_SIZE_OPTIONS.includes(settingsDraft.pageSize) ? settingsDraft.pageSize : 50;
    const next: AppSettings = {
      language: settingsDraft.language,
      dateFormat: settingsDraft.dateFormat,
      visibleCols: nextCols.length > 0 ? nextCols : DEFAULT_COLS,
      extraQuickFilters: normalizedExtra,
      toolbarLabels: settingsDraft.toolbarLabels,
      pageSize: validPageSize,
      tableFontSize: settingsDraft.tableFontSize,
      treeFontSize: settingsDraft.treeFontSize,
      treeShowCount: settingsDraft.treeShowCount,
      showDesc: settingsDraft.showDesc,
      customDefaultWidths: settingsDraft.customDefaultWidths,
      customMaxWidths: settingsDraft.customMaxWidths,
    };
    setAppSettings(next);
    setPage(0);
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
      danglingAliasFilter ||
      roomFilters.size > 0 ||
      functionFilters.size > 0 ||
      quickPatterns.size > 0 ||
      !!treeFilter ||
      !!treeSearch ||
      exactEnabled ||
      Object.values(colFilters).some((v) => v.trim() !== ''),
    [pattern, historyOnly, smartOnly, danglingAliasFilter, roomFilters, functionFilters, quickPatterns, treeFilter, treeSearch, exactEnabled, colFilters]
  );

  const resetAllFilters = useCallback(() => {
    setPattern('*');
    setPage(0);
    setSelectedId(null);
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

  const handleNavigateTo = useCallback((ids: string[]) => {
    const pat = ids.length === 1 ? ids[0] : 'alias.0.*';
    setPattern(pat);
    setPage(0);
    setSelectedId(null);
    setHistoryOnly(false);
    setSmartOnly(false);
    setColFilters({});
  }, []);

  const handleTreeScope = useCallback((prefix: string) => { handleSearch(prefix.replace(/\.$/, '') + '.*'); }, [handleSearch]);
  const handleCreateDatapointAtPath = useCallback((prefix: string) => {
    setNewDatapointInitialId(prefix);
  }, []);
  const handleClearTreeFilter = useCallback(() => {
    setTreeFilter(null);
    setTreeExpandSignal((s) => ({ depth: 0, seq: (s?.seq ?? 0) + 1 }));
  }, []);
  const handleSidebarToggle = useCallback(() => setSidebarToggleSeq((s) => s + 1), []);
  const handleManualRefresh = useCallback(() => {
    void Promise.all([
      refetchFilteredObjects(),
      refetchAllObjects(),
      refetchRoomMap(),
      refetchFunctionMap(),
      refetchStateValues(),
      refetchRoomEnums(),
      refetchFunctionEnums(),
    ]);
  }, [refetchFilteredObjects, refetchAllObjects, refetchRoomMap, refetchFunctionMap, refetchStateValues, refetchRoomEnums, refetchFunctionEnums]);

  const handleToggleExpertMode = useCallback(() => {
    setExpertMode((prev) => {
      const next = !prev;
      localStorage.setItem(LS_EXPERT_MODE, String(next));
      return next;
    });
  }, []);

  const handleToggleToolbarLabels = useCallback(() => {
    setAppSettings((prev) => {
      const next = { ...prev, toolbarLabels: !prev.toolbarLabels };
      localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
      return next;
    });
    setSettingsDraft((prev) => ({ ...prev, toolbarLabels: !prev.toolbarLabels }));
  }, []);

  const handleToggleGroupByPath = useCallback(() => {
    setAppSettings((prev) => {
      const next = { ...prev, groupByPath: !prev.groupByPath };
      localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSaveCurrentFilter = useCallback(() => {
    const name = saveFilterName.trim();
    if (!name) return;
    const newFilter: SavedFilter = {
      id: String(Date.now()),
      name,
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
  }, [saveFilterName, pattern, historyOnly, smartOnly, roomFilters, functionFilters, quickPatterns, colFilters]);

  const handleLoadSavedFilter = useCallback((f: SavedFilter) => {
    setPattern(f.pattern);
    setHistoryOnly(f.historyOnly);
    setSmartOnly(f.smartOnly);
    setRoomFilters(new Set(f.roomFilters));
    setFunctionFilters(new Set(f.functionFilters));
    setQuickPatterns(new Set(f.quickPatterns));
    setColFilters(f.colFilters);
    setPage(0);
    setSelectedId(null);
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
      onShowShortcuts={() => setShortcutsOpen(true)}
      onLanguageChange={handleLanguageChange}
      language={appSettings.language}
      apiConnected={!objectsError}
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
                    if (e.key === 'Enter') handleSaveCurrentFilter();
                    if (e.key === 'Escape') setSaveFilterPromptOpen(false);
                  }}
                  placeholder={isEn ? 'Filter name…' : 'Filtername…'}
                  className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleSaveCurrentFilter}
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
                    <button
                      key={q}
                      onClick={() => handleSearch(q)}
                      className={`px-3 py-1 text-left text-xs font-mono transition-colors ${color} ${
                        active
                          ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                          : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
                <button
                  onClick={() => { setHistoryOnly(!historyOnly); setPage(0); }}
                  className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-purple-600 dark:text-purple-400 ${
                    historyOnly
                      ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Database size={11} /> History <span className="opacity-70">{historyIds.size}</span>
                </button>
                <button
                  onClick={() => { setSmartOnly(!smartOnly); setPage(0); }}
                  className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-orange-600 dark:text-orange-400 ${
                    smartOnly
                      ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Mic2 size={11} /> SmartName <span className="opacity-70">{smartIds.size}</span>
                </button>
                {danglingAliasCount > 0 && (
                  <button
                    onClick={() => { setDanglingAliasFilter((v) => !v); setPage(0); }}
                    className={`px-3 py-1 text-left text-xs transition-colors flex items-center gap-1.5 text-amber-600 dark:text-amber-400 ${
                      danglingAliasFilter
                        ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <AlertTriangle size={11} /> {isEn ? 'Dangling Aliases' : 'Verwaiste Aliase'} <span className="opacity-70">{danglingAliasCount}</span>
                  </button>
                )}
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
                  {roomFilter && <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{roomFilter}</span>}
                </span>
                {roomsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {roomsOpen && (
                <div className="pt-0.5 pb-1 flex flex-col">
                  {roomEnums.map(({ name }, i) => {
                    const active = roomFilter?.toLowerCase() === name.toLowerCase();
                    return (
                      <button
                        key={name}
                        onClick={() => handleRoomToggle(name)}
                        className={`px-3 py-1 text-left text-xs transition-colors ${ENUM_COLORS[i % ENUM_COLORS.length]} ${
                          active
                            ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                            : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
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
              <button
                onClick={() => setFunctionsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
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
                      <button
                        key={name}
                        onClick={() => handleFunctionToggle(name)}
                        className={`px-3 py-1 text-left text-xs transition-colors ${ENUM_COLORS[i % ENUM_COLORS.length]} ${
                          active
                            ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                            : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setTypesOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
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
                    <button
                      key={t}
                      onClick={() => handleTypeToggle(t)}
                      className={`px-3 py-1 text-left text-xs transition-colors font-semibold ${getTypeColor(t)} ${
                        active
                          ? 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-700'
                          : 'opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {savedFiltersList.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSavedFiltersOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
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
                      <button
                        onClick={() => handleLoadSavedFilter(f)}
                        className="flex-1 text-left text-xs text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate transition-colors"
                        title={f.pattern}
                      >
                        {f.name}
                      </button>
                      <button
                        onClick={() => handleDeleteSavedFilter(f.id)}
                        className="shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                        title={isEn ? 'Delete' : 'Löschen'}
                      >
                        <X size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1 mt-3 mx-1 rounded-t border-t-4 border-blue-400/40 dark:border-blue-500/30 bg-gray-50/40 dark:bg-gray-800/20">
            <StateTree
              stateIds={allStateIds}
              allObjects={allObjects}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearch={handleSearch}
              onTreeScope={handleTreeScope}
              onCreateAtPath={handleCreateDatapointAtPath}
              historyOnly={historyOnly}
              smartOnly={smartOnly}
              historyIds={treeHistoryIds}
              smartIds={treeSmartIds}
              expandToDepth={treeExpandSignal}
              treeFilter={treeFilter}
              onClearTreeFilter={handleClearTreeFilter}
              treeSearch={treeSearch}
              onTreeSearchChange={setTreeSearch}
              pattern={pattern}
              language={appSettings.language}
              onOpenAliasReplace={() => setAliasReplaceInitialStr('')}
              onAutoCreateAlias={setAutoAliasDeviceId}
              treeFontSize={appSettings.treeFontSize}
              treeShowCount={appSettings.treeShowCount}
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

        {selectedId && allObjects[selectedId] && (
          <ObjectEditModal
            id={selectedId}
            obj={allObjects[selectedId]}
            language={appSettings.language}
            dateFormat={appSettings.dateFormat}
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
            dateFormat={appSettings.dateFormat}
            onClose={() => setHistoryModalId(null)}
          />
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
          <KeyboardShortcutsModal
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
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/50 p-4" onClick={() => setSettingsOpen(false)}>
            <div
              className="w-full max-w-2xl animate-modal-in rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'Settings' : 'Einstellungen'}</h3>
                <button onClick={() => setSettingsOpen(false)} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X size={14} />
                </button>
              </div>
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 px-4">
                {(['connection', 'display', 'columns', 'filters'] as const).map((tab) => {
                  const label = {
                    connection: isEn ? 'Connection' : 'Verbindung',
                    display:    isEn ? 'Display'    : 'Anzeige',
                    columns:    isEn ? 'Columns'    : 'Spalten',
                    filters:    isEn ? 'Filters'    : 'Filter',
                  }[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        settingsTab === tab
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="p-4 flex flex-col gap-4 min-h-[260px] max-h-[65vh] overflow-y-auto">
                {/* Tab: Verbindung */}
                {settingsTab === 'connection' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'ioBroker REST API host' : 'ioBroker REST API Host'}</span>
                      <div className="flex items-center gap-2">
                        <input
                          value={settingsHostIp}
                          onChange={(e) => { setSettingsHostIp(e.target.value); setSettingsHostError(null); }}
                          disabled={settingsHostTesting}
                          placeholder="10.4.0.33"
                          className={`flex-1 px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none transition-colors ${
                            settingsHostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : settingsHostError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
                          }`}
                        />
                        <span className="text-gray-400 dark:text-gray-500 text-xs">:</span>
                        <input
                          value={settingsHostPort}
                          onChange={(e) => { setSettingsHostPort(e.target.value); setSettingsHostError(null); }}
                          disabled={settingsHostTesting}
                          placeholder="8093"
                          className={`w-20 px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none transition-colors ${
                            settingsHostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : settingsHostError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
                          }`}
                        />
                        <button
                          disabled={settingsHostTesting}
                          onClick={async () => {
                            const ip = settingsHostIp.trim();
                            const port = settingsHostPort.trim();
                            if (!ip) return;
                            const val = port ? `${ip}:${port}` : ip;
                            setSettingsHostTesting(true);
                            setSettingsHostError(null);
                            try {
                              const res = await fetch(`http://${val}/v1/objects?limit=1`);
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                              localStorage.setItem('ioBrokerHost', val);
                              window.location.reload();
                            } catch {
                              setSettingsHostError(isEn ? 'Host not reachable' : 'Host nicht erreichbar');
                              setSettingsHostTesting(false);
                            }
                          }}
                          className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                        >
                          {settingsHostTesting
                            ? <><Loader2 size={12} className="animate-spin" />{isEn ? 'Testing…' : 'Teste…'}</>
                            : isEn ? 'Test & Connect' : 'Test & Verbinden'
                          }
                        </button>
                      </div>
                      {settingsHostError && (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                          <AlertCircle size={12} /> {settingsHostError}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {isEn
                        ? 'The browser connects directly to the ioBroker REST API. CORS must be enabled on the adapter. The host is stored in localStorage and takes precedence over the server configuration.'
                        : 'Der Browser verbindet sich direkt mit der ioBroker REST API. CORS muss im Adapter aktiviert sein. Der Host wird im localStorage gespeichert und hat Vorrang vor der Serverkonfiguration.'}
                    </p>
                  </div>
                )}
                {/* Tab: Anzeige */}
                {settingsTab === 'display' && (
                  <div className="flex flex-col gap-4">
                    {/* Language + Date format nebeneinander */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Language' : 'Sprache'}</span>
                        <LanguageDropdown value={settingsDraft.language} onChange={(language) => setSettingsDraft((prev) => ({ ...prev, language }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Date format' : 'Datumsformat'}</span>
                        <DateFormatDropdown
                          value={settingsDraft.dateFormat}
                          onChange={(dateFormat) => setSettingsDraft((prev) => ({ ...prev, dateFormat }))}
                        />
                      </div>
                    </div>
                    {/* Table font size + Tree font size nebeneinander */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Table font size' : 'Schriftgröße Tabelle'}</span>
                        <div className="flex gap-1.5">
                          {(['small', 'normal', 'large', 'xl'] as UiFontSize[]).map((s) => (
                            <button key={s} type="button" onClick={() => setSettingsDraft((prev) => ({ ...prev, tableFontSize: s }))}
                              className={`flex-1 py-1 text-xs rounded border transition-colors ${settingsDraft.tableFontSize === s ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                              {s === 'small' ? (isEn ? 'S' : 'K') : s === 'large' ? (isEn ? 'L' : 'G') : s === 'xl' ? 'XL' : 'M'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Tree font size' : 'Schriftgröße Baum'}</span>
                        <div className="flex gap-1.5">
                          {(['small', 'normal', 'large', 'xl'] as UiFontSize[]).map((s) => (
                            <button key={s} type="button" onClick={() => setSettingsDraft((prev) => ({ ...prev, treeFontSize: s }))}
                              className={`flex-1 py-1 text-xs rounded border transition-colors ${settingsDraft.treeFontSize === s ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                              {s === 'small' ? (isEn ? 'S' : 'K') : s === 'large' ? (isEn ? 'L' : 'G') : s === 'xl' ? 'XL' : 'M'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Rows per page */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Rows per page' : 'Zeilen pro Seite'}</span>
                      <select
                        value={settingsDraft.pageSize}
                        onChange={(e) => setSettingsDraft((prev) => ({ ...prev, pageSize: parseInt(e.target.value, 10) }))}
                        className="h-8 px-2.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    {/* Toggles */}
                    {([
                      { key: 'toolbarLabels', labelEn: 'Toolbar button labels',   labelDe: 'Beschriftungen in der Toolbar' },
                      { key: 'treeShowCount', labelEn: 'Datapoint count in tree', labelDe: 'Datenpunkt-Anzahl im Baum' },
                      { key: 'showDesc',      labelEn: 'Description below name',  labelDe: 'Beschreibung unter Name' },
                      { key: 'groupByPath',   labelEn: 'Group table by path',     labelDe: 'Tabelle nach Pfad gruppieren' },
                    ] as const).map(({ key, labelEn, labelDe }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? labelEn : labelDe}</span>
                        <button
                          type="button"
                          onClick={() => setSettingsDraft((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${settingsDraft[key] ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settingsDraft[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                    {/* Column widths */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Column widths (px)' : 'Spaltenbreiten (px)'}</span>
                        <button
                          type="button"
                          onClick={() => setSettingsDraft((prev) => ({ ...prev, customDefaultWidths: {}, customMaxWidths: {} }))}
                          className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          {isEn ? 'Reset all' : 'Alle zurücksetzen'}
                        </button>
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                              <th className="text-left px-2 py-1 font-medium">{isEn ? 'Column' : 'Spalte'}</th>
                              <th className="text-center px-1 py-1 font-medium w-16">{isEn ? 'Default' : 'Standard'}</th>
                              <th className="text-center px-1 py-1 font-medium w-16">Max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {CONFIGURABLE_WIDTH_COLS.map((col) => {
                              const builtinDefault = BUILTIN_DEFAULT_WIDTHS[col];
                              const builtinMax = BUILTIN_MAX_WIDTHS[col];
                              const currentDefault = settingsDraft.customDefaultWidths[col] ?? builtinDefault;
                              const currentMax = settingsDraft.customMaxWidths[col] ?? builtinMax ?? '';
                              const inputCls = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-14 text-center px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400';
                              return (
                                <tr key={col} className="border-t border-gray-100 dark:border-gray-800">
                                  <td className="px-2 py-0.5 text-gray-600 dark:text-gray-400">{getColumnLabel(col, isEn ? 'en' : 'de')}</td>
                                  <td className="px-1 py-0.5 text-center">
                                    <input
                                      type="number"
                                      value={currentDefault}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!isNaN(v) && v > 0)
                                          setSettingsDraft((prev) => ({ ...prev, customDefaultWidths: { ...prev.customDefaultWidths, [col]: v } }));
                                      }}
                                      onBlur={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        setSettingsDraft((prev) => ({ ...prev, customDefaultWidths: { ...prev.customDefaultWidths, [col]: isNaN(v) || v < 1 ? builtinDefault : v } }));
                                      }}
                                      className={inputCls}
                                    />
                                  </td>
                                  <td className="px-1 py-0.5 text-center">
                                    <input
                                      type="number"
                                      placeholder="∞"
                                      value={currentMax}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!isNaN(v) && v > 0)
                                          setSettingsDraft((prev) => ({ ...prev, customMaxWidths: { ...prev.customMaxWidths, [col]: v } }));
                                        else if (e.target.value === '')
                                          setSettingsDraft((prev) => { const next = { ...prev.customMaxWidths }; delete next[col]; return { ...prev, customMaxWidths: next }; });
                                      }}
                                      className={inputCls}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
                {/* Tab: Spalten */}
                {settingsTab === 'columns' && (
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
                )}
                {/* Tab: Filter */}
                {settingsTab === 'filters' && (
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
                    <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
                      {settingsDraft.extraQuickFilters.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                          {isEn ? 'No additional filters' : 'Keine zusätzlichen Filter'}
                        </div>
                      ) : (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                          {settingsDraft.extraQuickFilters.map((patternItem) => (
                            <li key={patternItem} className="flex items-center justify-between gap-2 px-3 py-2">
                              <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{patternItem}</span>
                              <button
                                onClick={() => setSettingsDraft((prev) => ({ ...prev, extraQuickFilters: prev.extraQuickFilters.filter((p) => p !== patternItem) }))}
                                title={isEn ? 'Remove filter' : 'Filter entfernen'}
                                className="shrink-0 p-1 rounded text-gray-500 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
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
            ref={stateListRef}
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
            allObjectIds={existingIds}
            onNavigateTo={handleNavigateTo}
            exportIds={tableIds}
            treeFilter={treeFilter}
            onClearTreeFilter={handleClearTreeFilter}
            sidebarToggleSeq={sidebarToggleSeq}
            onManualRefresh={handleManualRefresh}
            fulltextEnabled={fulltextEnabled}
            dateFormat={appSettings.dateFormat}
            settingsVisibleCols={appSettings.visibleCols}
            language={appSettings.language}
            expertMode={expertMode}
            onToggleExpertMode={handleToggleExpertMode}
            toolbarLabels={appSettings.toolbarLabels}
            onToggleToolbarLabels={handleToggleToolbarLabels}
            onOpenEnumManager={() => setEnumManagerOpen(true)}
            onOpenAliasReplace={(initialStr) => setAliasReplaceInitialStr(initialStr ?? '')}
            tableFontSize={appSettings.tableFontSize}
            showDesc={appSettings.showDesc}
            groupByPath={appSettings.groupByPath}
            onToggleGroupByPath={handleToggleGroupByPath}
            customDefaultWidths={appSettings.customDefaultWidths}
            customMaxWidths={appSettings.customMaxWidths}
          />
        </div>

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
      </div>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AppContent />
          <ToastContainer />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
