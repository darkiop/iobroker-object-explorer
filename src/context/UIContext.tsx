import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { DEFAULT_COLS, ALL_COLUMNS } from '../components/stateListColumns';
import type { SortKey, DateFormatSetting } from '../components/stateListColumns';
import { clearScriptUsedIdsCache, getScriptUsedIds } from '../api/iobroker';

export type UiFontSize = 'small' | 'normal' | 'large' | 'xl';

export interface AppSettings {
  language: 'en' | 'de';
  dateFormat: DateFormatSetting;
  visibleCols: SortKey[];
  extraQuickFilters: string[];
  toolbarLabels: boolean;
  pageSize: number;
  tableFontSize: UiFontSize;
  treeFontSize: UiFontSize;
  treeCountMode: 'off' | 'states' | 'objects' | 'both';
  showDesc: boolean;
  groupByPath: boolean;
  treeViewMode: 'adapter' | 'path';
  adminPort: number;
  customDefaultWidths: Partial<Record<SortKey, number>>;
  customMinWidths: Partial<Record<SortKey, number>>;
  customMaxWidths: Partial<Record<SortKey, number>>;
  objectsRefreshInterval: 'off' | '30s' | '1m' | '5m' | '10m';
  includeScripts: boolean;
  shortenGroupPaths: boolean;
  showObjectIcons: boolean;
  showObjectTypeIcons: boolean;
  animateGroupExpand: boolean;
  hideAliasSubRows: boolean;
  panel2Open: boolean;
  /** Realtime push transport — 'longpolling' uses the REST polling endpoint (default,
   *  works everywhere); 'socketio' connects to a separate `socketio` adapter instance
   *  (lower latency, requires that adapter to be installed/running — experimental). */
  realtimeTransport: 'longpolling' | 'socketio';
  /** Override host:port for the socketio adapter (default guess: <restHost>:8084). */
  socketHost: string;
  /** Persisted (IndexedDB) cache for the large /objects bulk payloads (objects.all,
   *  objects.bootstrap, scripts.sources): 'off' refetches on every browser load;
   *  a number reuses the cached payload across that many loads before refetching.
   *  Whichever of [[objectsCacheReloads]] / [[objectsCacheTTL]] triggers first
   *  forces a fresh fetch (and resets the reload counter). The manual refresh
   *  button always bypasses both and fetches fresh. */
  objectsCacheReloads: 'off' | '5' | '10' | '20' | '50';
  /** Max age of the persisted objects cache before it's considered stale,
   *  regardless of [[objectsCacheReloads]] — see that field for how they combine. */
  objectsCacheTTL: 'off' | '1h' | '6h' | '24h' | '7d';
}

const PAGE_SIZE_OPTIONS = [200, 500, 1000, 3000];
const LS_APP_SETTINGS = 'iobroker-app-settings';
const LS_EXPERT_MODE = 'iobroker-expert-mode';
export const DEFAULT_QUICK_PATTERNS = ['alias.0.*', 'javascript.0.*', '0_userdata.0.*'] as const;

export function getDefaultAppSettings(): AppSettings {
  return {
    language: 'en',
    dateFormat: 'de',
    visibleCols: DEFAULT_COLS,
    extraQuickFilters: [],
    toolbarLabels: true,
    pageSize: 200,
    tableFontSize: 'normal',
    treeFontSize: 'normal',
    treeCountMode: 'objects',
    showDesc: true,
    groupByPath: true,
    treeViewMode: 'adapter',
    adminPort: 8081,
    customDefaultWidths: {},
    customMinWidths: {},
    customMaxWidths: {},
    objectsRefreshInterval: 'off',
    includeScripts: false,
    shortenGroupPaths: true,
    showObjectIcons: false,
    showObjectTypeIcons: true,
    animateGroupExpand: false,
    hideAliasSubRows: false,
    panel2Open: false,
    realtimeTransport: 'longpolling',
    socketHost: '',
    objectsCacheReloads: '10',
    objectsCacheTTL: '24h',
  };
}

export function normalizeQuickPattern(input: string): string {
  let v = input.trim();
  if (!v) return '';
  if (!v.endsWith('*')) v = `${v.replace(/\.+$/, '')}.*`;
  if (v.endsWith('*') && !v.endsWith('.*')) v = `${v.replace(/\*+$/, '')}.*`;
  return v;
}

export function parseColWidthMap(raw: unknown): Partial<Record<SortKey, number>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => ALL_COLUMNS.some((c) => c.key === k) && typeof v === 'number' && (v as number) > 0)
      .map(([k, v]) => [k, v as number])
  ) as Partial<Record<SortKey, number>>;
}

export function loadAppSettings(): AppSettings {
  const fallback = getDefaultAppSettings();
  try {
    const raw = localStorage.getItem(LS_APP_SETTINGS);
    if (!raw) return fallback;
    const unknown: unknown = JSON.parse(raw);
    if (typeof unknown !== 'object' || unknown === null) return fallback;
    const parsed = unknown as Partial<AppSettings>;
    const validLanguage = parsed.language === 'de' || parsed.language === 'en' ? parsed.language : 'en';
    let validCols = Array.isArray(parsed.visibleCols)
      ? parsed.visibleCols.filter((k): k is SortKey => ALL_COLUMNS.some((c) => c.key === k))
      : [];
    if (validCols.length > 0 && !validCols.includes('scripts')) {
      const aliasIdx = validCols.indexOf('alias');
      if (aliasIdx >= 0) validCols.splice(aliasIdx + 1, 0, 'scripts');
      else validCols.push('scripts');
    }
    if (validCols.length > 0 && !validCols.includes('custom')) {
      const historyIdx = validCols.indexOf('history');
      if (historyIdx >= 0) validCols.splice(historyIdx + 1, 0, 'custom');
      else validCols.push('custom');
    }
    const validDate = parsed.dateFormat === 'de' || parsed.dateFormat === 'us' || parsed.dateFormat === 'iso' ? parsed.dateFormat : 'de';
    const validExtra = Array.isArray(parsed.extraQuickFilters)
      ? parsed.extraQuickFilters.filter((x): x is string => typeof x === 'string').map(normalizeQuickPattern).filter(Boolean)
      : [];
    const parsedPageSize = typeof parsed.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(parsed.pageSize) ? parsed.pageSize : 200;
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
      treeCountMode: (['off','states','objects','both'] as const).includes(parsed.treeCountMode as 'off'|'states'|'objects'|'both') ? parsed.treeCountMode as 'off'|'states'|'objects'|'both' : ((parsed as Record<string,unknown>).treeShowCount === false ? 'off' : 'objects'),
      showDesc: parsed.showDesc !== false,
      groupByPath: parsed.groupByPath !== false,
      treeViewMode: parsed.treeViewMode === 'path' ? 'path' : 'adapter',
      adminPort: typeof parsed.adminPort === 'number' && parsed.adminPort > 0 && parsed.adminPort <= 65535 ? parsed.adminPort : 8081,
      customDefaultWidths: parseColWidthMap(parsed.customDefaultWidths),
      customMinWidths: parseColWidthMap(parsed.customMinWidths),
      customMaxWidths: parseColWidthMap(parsed.customMaxWidths),
      objectsRefreshInterval: (['off','30s','1m','5m','10m'] as const).includes(parsed.objectsRefreshInterval as 'off'|'30s'|'1m'|'5m'|'10m') ? parsed.objectsRefreshInterval as 'off'|'30s'|'1m'|'5m'|'10m' : 'off',
      includeScripts: parsed.includeScripts === true,
      shortenGroupPaths: parsed.shortenGroupPaths !== false,
      showObjectIcons: parsed.showObjectIcons === true,
      showObjectTypeIcons: parsed.showObjectTypeIcons !== false,
      animateGroupExpand: parsed.animateGroupExpand === true,
      hideAliasSubRows: parsed.hideAliasSubRows === true,
      panel2Open: parsed.panel2Open === true,
      realtimeTransport: parsed.realtimeTransport === 'socketio' ? 'socketio' : 'longpolling',
      socketHost: typeof parsed.socketHost === 'string' ? parsed.socketHost.trim() : '',
      objectsCacheReloads: (['off','5','10','20','50'] as const).includes(parsed.objectsCacheReloads as 'off'|'5'|'10'|'20'|'50') ? parsed.objectsCacheReloads as 'off'|'5'|'10'|'20'|'50' : '10',
      objectsCacheTTL: (['off','1h','6h','24h','7d'] as const).includes(parsed.objectsCacheTTL as 'off'|'1h'|'6h'|'24h'|'7d') ? parsed.objectsCacheTTL as 'off'|'1h'|'6h'|'24h'|'7d' : '24h',
    };
  } catch { return fallback; }
}

// ── Stable context: appSettings, expertMode, script state ────────────────────
// Only changes when settings or script data actually change.
// StateList and StateTree subscribe here — they do NOT re-render when modals open.
export interface AppSettingsContextValue {
  appSettings: AppSettings;
  expertMode: boolean;
  scriptUsedIds: Set<string> | null;
  scriptLastUpdated: number | undefined;
  scriptsFetching: boolean;
  confirmScriptRefresh: boolean;
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setExpertMode: React.Dispatch<React.SetStateAction<boolean>>;
  setScriptUsedIds: React.Dispatch<React.SetStateAction<Set<string> | null>>;
  setScriptLastUpdated: React.Dispatch<React.SetStateAction<number | undefined>>;
  setScriptsFetching: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmScriptRefresh: React.Dispatch<React.SetStateAction<boolean>>;
  persistSettings: (next: AppSettings) => void;
  handleLanguageChange: (language: 'en' | 'de') => void;
  handleToggleExpertMode: () => void;
  handleToggleToolbarLabels: () => void;
  handleToggleGroupByPath: () => void;
  handleScriptRefreshConfirmed: (allObjectKeys: string[]) => Promise<void>;
}

// ── Volatile context: modal open/close state ─────────────────────────────────
// Changes on every settings/shortcuts open or close.
// Components that only need AppSettingsContext are shielded from these re-renders.
export interface UIOverlayContextValue {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openSettings: () => void;
}

const AppSettingsCtx = createContext<AppSettingsContextValue | null>(null);
const UIOverlayCtx = createContext<UIOverlayContextValue | null>(null);

export function useAppSettingsContext(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsCtx);
  if (!ctx) throw new Error('useAppSettingsContext must be used inside UIContextProvider');
  return ctx;
}

export function useUIOverlayContext(): UIOverlayContextValue {
  const ctx = useContext(UIOverlayCtx);
  if (!ctx) throw new Error('useUIOverlayContext must be used inside UIContextProvider');
  return ctx;
}

/** Convenience hook that merges both contexts — for components that need everything. */
export function useUIContext(): AppSettingsContextValue & UIOverlayContextValue {
  return { ...useAppSettingsContext(), ...useUIOverlayContext() };
}

export function UIContextProvider({ children }: { children: ReactNode }) {
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [expertMode, setExpertMode] = useState<boolean>(() => localStorage.getItem(LS_EXPERT_MODE) === 'true');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [scriptUsedIds, setScriptUsedIds] = useState<Set<string> | null>(() => {
    const ts = localStorage.getItem('iob-script-used-ids-ts');
    if (ts && Date.now() - parseInt(ts) < 60 * 60 * 1000) {
      const raw = localStorage.getItem('iob-script-used-ids-v1');
      if (raw) { try { return new Set<string>(JSON.parse(raw)); } catch { /* ignore */ } }
    }
    return null;
  });
  const [scriptLastUpdated, setScriptLastUpdated] = useState<number | undefined>(() => {
    const ts = localStorage.getItem('iob-script-used-ids-ts');
    const n = ts ? parseInt(ts) : NaN;
    return Number.isFinite(n) ? n : undefined;
  });
  const [scriptsFetching, setScriptsFetching] = useState(false);
  const [confirmScriptRefresh, setConfirmScriptRefresh] = useState(false);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const persistSettings = useCallback((next: AppSettings) => {
    setAppSettings(next);
    localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
  }, []);

  const handleLanguageChange = useCallback((language: 'en' | 'de') => {
    document.documentElement.lang = language;
    setAppSettings((prev) => {
      if (prev.language === language) return prev;
      const next = { ...prev, language };
      localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
      return next;
    });
  }, []);

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
  }, []);

  const handleToggleGroupByPath = useCallback(() => {
    setAppSettings((prev) => {
      const next = { ...prev, groupByPath: !prev.groupByPath };
      localStorage.setItem(LS_APP_SETTINGS, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleScriptRefreshConfirmed = useCallback(async (allObjectKeys: string[]) => {
    setConfirmScriptRefresh(false);
    setScriptsFetching(true);
    try {
      clearScriptUsedIdsCache();
      const result = await getScriptUsedIds(allObjectKeys, true);
      setScriptUsedIds(result);
      setScriptLastUpdated(Date.now());
    } finally {
      setScriptsFetching(false);
    }
  }, []);

  // Stable value — identity only changes when settings/script data change, NOT when modals open.
  const appSettingsValue = useMemo<AppSettingsContextValue>(() => ({
    appSettings, expertMode, scriptUsedIds, scriptLastUpdated, scriptsFetching, confirmScriptRefresh,
    setAppSettings, setExpertMode, setScriptUsedIds, setScriptLastUpdated, setScriptsFetching, setConfirmScriptRefresh,
    persistSettings, handleLanguageChange, handleToggleExpertMode, handleToggleToolbarLabels,
    handleToggleGroupByPath, handleScriptRefreshConfirmed,
  }), [
    appSettings, expertMode, scriptUsedIds, scriptLastUpdated, scriptsFetching, confirmScriptRefresh,
    persistSettings, handleLanguageChange, handleToggleExpertMode, handleToggleToolbarLabels,
    handleToggleGroupByPath, handleScriptRefreshConfirmed,
  ]);

  // Volatile value — changes on every modal open/close.
  const overlayValue = useMemo<UIOverlayContextValue>(() => ({
    settingsOpen, shortcutsOpen, setSettingsOpen, setShortcutsOpen, openSettings,
  }), [settingsOpen, shortcutsOpen, openSettings]);

  return (
    <AppSettingsCtx.Provider value={appSettingsValue}>
      <UIOverlayCtx.Provider value={overlayValue}>
        {children}
      </UIOverlayCtx.Provider>
    </AppSettingsCtx.Provider>
  );
}
