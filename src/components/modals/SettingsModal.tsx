import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import LanguageDropdown from '../LanguageDropdown';
import { X, ChevronDown, Check, Loader2, AlertCircle, Trash2, ExternalLink, Plus, Pencil, Server } from 'lucide-react';
import type { DateFormatSetting } from '../statelist/StateListColumns';
import { ALL_COLUMNS, DEFAULT_COLS, getColumnLabel, CONFIGURABLE_WIDTH_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MIN_WIDTHS, BUILTIN_MAX_WIDTHS } from '../statelist/StateListColumns';
import { useAppSettingsContext, useUIOverlayContext, DEFAULT_QUICK_PATTERNS, getDefaultAppSettings, normalizeQuickPattern } from '../../context/UIContext';
import type { AppSettings, UiFontSize } from '../../context/UIContext';
import { useFilterContext } from '../../context/FilterContext';
import { clearObjectsCache, getConnections, setConnections, getActiveConnectionId, switchToConnection } from '../../api/iobroker';
import type { SavedConnection } from '../../api/iobroker';
import io from 'socket.io-client';
import { getSocketUrl } from '../../hooks/useSocketIO';
import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../context/ThemeContext';

const PAGE_SIZE_OPTIONS = [200, 500, 1000, 3000];

const DATE_FORMAT_OPTIONS: { value: DateFormatSetting; label: string }[] = [
  { value: 'de', label: 'DD.MM.YYYY HH:mm:ss' },
  { value: 'us', label: 'MM/DD/YYYY HH:mm:ss' },
  { value: 'iso', label: 'YYYY-MM-DD HH:mm:ss' },
];

function DateFormatDropdown({ value, onChange }: { value: DateFormatSetting; onChange: (next: DateFormatSetting) => void }) {
  const [open, setOpen] = useState(false);
  const selected = DATE_FORMAT_OPTIONS.find((opt) => opt.value === value) ?? DATE_FORMAT_OPTIONS[0];

  return (
    <div className="relative w-full">
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
                onClick={() => { onChange(opt.value); setOpen(false); }}
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

function initDraftFromSettings(appSettings: AppSettings): AppSettings {
  return { ...appSettings };
}

export default function SettingsModal({ namespaceSuggestions = [] }: { namespaceSuggestions?: string[] }) {
  const { appSettings, persistSettings, handleLanguageChange } = useAppSettingsContext();
  const { theme, setTheme } = useTheme();
  const { setSettingsOpen } = useUIOverlayContext();
  const { setPage, setQuickPatterns } = useFilterContext();
  const onClose = () => setSettingsOpen(false);
  useEscapeKey(onClose);

  const [settingsTab, setSettingsTab] = useState<'connections' | 'display' | 'columns' | 'filters' | 'namespaces'>('connections');
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => initDraftFromSettings(appSettings));
  const [newQuickFilter, setNewQuickFilter] = useState('');
  const [newStripPrefix, setNewStripPrefix] = useState('');
  const [connections, setConnectionsState] = useState<SavedConnection[]>(() => getConnections());
  const [activeConnId] = useState<string | null>(() => getActiveConnectionId());
  const [switchingConnId, setSwitchingConnId] = useState<string | null>(null);

  // Per-connection inline edit form
  type EditingConnForm = {
    id: string; name: string; host: string;
    socketHost: string; realtimeTransport: 'longpolling' | 'socketio'; adminPort: number;
  };
  const [editingConn, setEditingConn] = useState<EditingConnForm | null>(null);
  const [originalEditingConn, setOriginalEditingConn] = useState<EditingConnForm | null>(null);
  const [connHostTesting, setConnHostTesting] = useState(false);
  const [connHostTestResult, setConnHostTestResult] = useState<'ok' | 'error' | null>(null);
  const [connHostTestError, setConnHostTestError] = useState<string | null>(null);
  const [connSioTesting, setConnSioTesting] = useState(false);
  const [connSioTestResult, setConnSioTestResult] = useState<'ok' | 'error' | null>(null);
  const [connSioTestError, setConnSioTestError] = useState<string | null>(null);
  const [newConnName, setNewConnName] = useState('');
  const [newConnHost, setNewConnHost] = useState('');

  const isEn = appSettings.language === 'en';

  const applySettings = useCallback((next: AppSettings) => {
    persistSettings(next);
    setPage(0);
    const allowed = new Set([...DEFAULT_QUICK_PATTERNS, ...next.extraQuickFilters]);
    setQuickPatterns((prev) => new Set([...prev].filter((p) => allowed.has(p))));
    setSettingsOpen(false);
  }, [persistSettings, setPage, setQuickPatterns, setSettingsOpen]);

  const saveSettings = useCallback(() => {
    let nextCols = settingsDraft.visibleCols.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
    if (settingsDraft.showUnitInValue) nextCols = nextCols.filter((k) => k !== 'unit');
    const normalizedExtra = [...new Set(settingsDraft.extraQuickFilters.map(normalizeQuickPattern).filter(Boolean))]
      .filter((p) => !DEFAULT_QUICK_PATTERNS.includes(p as typeof DEFAULT_QUICK_PATTERNS[number]));
    const validPageSize = PAGE_SIZE_OPTIONS.includes(settingsDraft.pageSize) ? settingsDraft.pageSize : 1000;
    const next: AppSettings = {
      language: settingsDraft.language,
      dateFormat: settingsDraft.dateFormat,
      visibleCols: nextCols.length > 0 ? nextCols : DEFAULT_COLS,
      extraQuickFilters: normalizedExtra,
      toolbarLabels: settingsDraft.toolbarLabels,
      pageSize: validPageSize,
      tableFontSize: settingsDraft.tableFontSize,
      treeFontSize: settingsDraft.treeFontSize,
      treeCountMode: settingsDraft.treeCountMode,
      showDesc: settingsDraft.showDesc,
      customDefaultWidths: settingsDraft.customDefaultWidths,
      customMinWidths: settingsDraft.customMinWidths,
      customMaxWidths: settingsDraft.customMaxWidths,
      groupByPath: settingsDraft.groupByPath,
      treeViewMode: settingsDraft.treeViewMode,
      adminPort: settingsDraft.adminPort,
      objectsRefreshInterval: settingsDraft.objectsRefreshInterval,
      objectsCacheReloads: settingsDraft.objectsCacheReloads,
      objectsCacheTTL: settingsDraft.objectsCacheTTL,
      loadOnlyVisibleStateValues: settingsDraft.loadOnlyVisibleStateValues,
      includeScripts: settingsDraft.includeScripts,
      showObjectIcons: settingsDraft.showObjectIcons,
      showObjectTypeIcons: settingsDraft.showObjectTypeIcons,
      animateGroupExpand: settingsDraft.animateGroupExpand,
      hideAliasSubRows: settingsDraft.hideAliasSubRows ?? false,
      shortenGroupPaths: settingsDraft.shortenGroupPaths,
      panel2Open: settingsDraft.panel2Open,
      realtimeTransport: settingsDraft.realtimeTransport,
      socketHost: settingsDraft.socketHost.trim(),
      showUnitInValue: settingsDraft.showUnitInValue ?? false,
      includeIdPrefixes: settingsDraft.includeIdPrefixes ?? [],
      dragDropEnabled: settingsDraft.dragDropEnabled ?? false,
    };
    applySettings(next);
  }, [settingsDraft, applySettings]);

  const handleLanguageChangeDraft = useCallback((language: 'en' | 'de') => {
    handleLanguageChange(language);
    setSettingsDraft((prev) => ({ ...prev, language }));
  }, [handleLanguageChange]);

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

  const addStripPrefix = useCallback((directVal?: string) => {
    let val = (directVal ?? newStripPrefix).trim();
    if (!val) return;
    if (!val.endsWith('.')) val = `${val}.`;
    setSettingsDraft((prev) => ({
      ...prev,
      includeIdPrefixes: (prev.includeIdPrefixes ?? []).includes(val)
        ? prev.includeIdPrefixes
        : [...(prev.includeIdPrefixes ?? []), val],
    }));
    setNewStripPrefix('');
  }, [newStripPrefix]);

  const testConnSocketConnection = useCallback(() => {
    if (connSioTesting || !editingConn) return;
    setConnSioTesting(true);
    setConnSioTestResult(null);
    setConnSioTestError(null);
    const url = window.__CONFIG__?.ioBrokerHost
      ? getSocketUrl()
      : getSocketUrl(editingConn.socketHost);
    const socket = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 5_000, forceNew: true });
    let settled = false;
    const finish = (ok: boolean, err?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.disconnect();
      setConnSioTesting(false);
      setConnSioTestResult(ok ? 'ok' : 'error');
      setConnSioTestError(ok ? null : err ?? (isEn ? 'Connection failed' : 'Verbindung fehlgeschlagen'));
    };
    const timer = setTimeout(() => finish(false, isEn ? 'Timed out' : 'Zeitüberschreitung'), 6_000);
    socket.on('connect', () => finish(true));
    socket.on('connect_error', (err: { message?: string } | Error) =>
      finish(false, err?.message || (isEn ? 'Connection failed' : 'Verbindung fehlgeschlagen'))
    );
  }, [connSioTesting, editingConn, isEn]);

  const resetSettingsToDefault = useCallback(() => {
    const defaults = getDefaultAppSettings();
    setSettingsDraft(defaults);
    applySettings(defaults);
  }, [applySettings]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl animate-modal-in rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'Settings' : 'Einstellungen'}</h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={14} />
          </button>
        </div>
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-4">
          {(['connections', 'display', 'columns', 'filters', 'namespaces'] as const).map((tab) => {
            const label = {
              connections: isEn ? 'Connections'   : 'Verbindungen',
              display:     isEn ? 'Display'       : 'Anzeige',
              columns:     isEn ? 'Table'         : 'Tabelle',
              filters:     isEn ? 'Quick Filters' : 'Schnellfilter',
              namespaces:  isEn ? 'Namespaces'    : 'Namespaces',
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
        <div className="p-4 flex flex-col gap-4 h-[65vh] overflow-y-auto">
          {/* Tab: Anzeige */}
          {settingsTab === 'display' && (
            <div className="flex flex-col gap-5">

              {/* ── Appearance ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Appearance" de="Erscheinungsbild" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Theme' : 'Farbschema'}</span>
                  <div className="flex gap-2">
                    {([
                      { value: 'catppuccin-mocha',     labelEn: 'Catppuccin Mocha',     labelDe: 'Catppuccin Mocha',     preview: 'bg-[#1e1e2e] border-[#45475a] text-[#cdd6f4]' },
                      { value: 'catppuccin-macchiato', labelEn: 'Catppuccin Macchiato', labelDe: 'Catppuccin Macchiato', preview: 'bg-[#24273a] border-[#494d64] text-[#cad3f5]' },
                      { value: 'catppuccin-frappe',    labelEn: 'Catppuccin Frappé',    labelDe: 'Catppuccin Frappé',    preview: 'bg-[#303446] border-[#51576d] text-[#c6d0f5]' },
                      { value: 'light',                labelEn: 'Light',                labelDe: 'Hell',                 preview: 'bg-white border-gray-300 text-gray-800' },
                      { value: 'dark',                 labelEn: 'Dark',                 labelDe: 'Dunkel',               preview: 'bg-gray-800 border-gray-600 text-gray-100' },
                      { value: 'abyss',                labelEn: 'Abyss',                labelDe: 'Abyss',                preview: 'bg-black border-[#2a2a2a] text-[#f0f0f0]' },
                    ] as { value: Theme; labelEn: string; labelDe: string; preview: string }[]).map(({ value, labelEn, labelDe, preview }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-2 px-3 rounded border-2 transition-colors ${
                          theme === value
                            ? 'border-blue-500 ring-1 ring-blue-400/50'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        <span className={`w-full h-6 rounded text-[10px] flex items-center justify-center font-medium border ${preview}`}>Aa</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{isEn ? labelEn : labelDe}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Language' : 'Sprache'}</span>
                    <LanguageDropdown value={settingsDraft.language} onChange={handleLanguageChangeDraft} fullWidth />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Date format' : 'Datumsformat'}</span>
                    <DateFormatDropdown value={settingsDraft.dateFormat} onChange={(dateFormat) => setSettingsDraft((prev) => ({ ...prev, dateFormat }))} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <SettingsToggleRow isEn={isEn} labelEn="Toolbar button labels" labelDe="Beschriftungen in der Toolbar"
                    value={settingsDraft.toolbarLabels} onToggle={() => setSettingsDraft((prev) => ({ ...prev, toolbarLabels: !prev.toolbarLabels }))} />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? 'Shows text next to the icons in the toolbar buttons; off shows icons only.'
                      : 'Zeigt Text neben den Icons der Toolbar-Buttons an; aus zeigt nur die Icons.'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Table ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Table" de="Tabelle" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Font size' : 'Schriftgröße'}</span>
                  <div className="flex gap-1.5">
                    {(['small', 'normal', 'large', 'xl'] as UiFontSize[]).map((s) => (
                      <button key={s} type="button" onClick={() => setSettingsDraft((prev) => ({ ...prev, tableFontSize: s }))}
                        className={`flex-1 py-1 text-xs rounded border transition-colors ${settingsDraft.tableFontSize === s ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        {s === 'small' ? (isEn ? 'S' : 'K') : s === 'large' ? (isEn ? 'L' : 'G') : s === 'xl' ? 'XL' : 'M'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Rows per page' : 'Zeilen pro Seite'}</span>
                    <select value={settingsDraft.pageSize} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, pageSize: parseInt(e.target.value, 10) }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? "Number of rows shown per page in the table; also controls how many rows' state values are fetched and polled at once."
                      : 'Anzahl der pro Seite angezeigten Zeilen in der Tabelle; bestimmt zudem, für wie viele Zeilen State-Werte gleichzeitig geladen und abgefragt werden.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Group table by path" labelDe="Tabelle nach Pfad gruppieren"
                      value={settingsDraft.groupByPath} onToggle={() => setSettingsDraft((prev) => ({ ...prev, groupByPath: !prev.groupByPath }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? 'Collapses rows into collapsible groups by their ID path (e.g. adapter instance) instead of one flat list.'
                        : 'Fasst Zeilen anhand ihres ID-Pfads (z. B. Adapter-Instanz) zu auf-/zuklappbaren Gruppen zusammen, statt einer flachen Liste.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Description below name" labelDe="Beschreibung unter Name"
                      value={settingsDraft.showDesc} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showDesc: !prev.showDesc }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? "Shows the object's description as a small second line under its name in the table."
                        : 'Zeigt die Beschreibung des Objekts als kleine zweite Zeile unter seinem Namen in der Tabelle an.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Show object icons in Name column" labelDe="Objekt-Icons in der Name-Spalte anzeigen"
                      value={settingsDraft.showObjectIcons} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showObjectIcons: !prev.showObjectIcons }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? "Shows the adapter/object icon (from the object's common.icon) in front of the name."
                        : 'Zeigt das Adapter-/Objekt-Icon (aus common.icon des Objekts) vor dem Namen an.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Show type icons" labelDe="Typ-Icons anzeigen"
                      value={settingsDraft.showObjectTypeIcons} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showObjectTypeIcons: !prev.showObjectTypeIcons }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? 'Shows a small icon indicating the object type (state, channel, device, …) next to the name.'
                        : 'Zeigt ein kleines Icon für den Objekttyp (State, Channel, Device, …) neben dem Namen an.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Animate group expand/collapse" labelDe="Gruppen-Aufklappen animieren"
                      value={settingsDraft.animateGroupExpand} onToggle={() => setSettingsDraft((prev) => ({ ...prev, animateGroupExpand: !prev.animateGroupExpand }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? 'Plays a smooth slide animation when expanding or collapsing path groups; off applies the change instantly.'
                        : 'Spielt beim Auf-/Zuklappen von Pfadgruppen eine sanfte Schiebe-Animation ab; aus wendet die Änderung sofort an.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Hide alias source/target lines" labelDe="Alias-Quell-/Zielzeilen ausblenden"
                      value={settingsDraft.hideAliasSubRows ?? false} onToggle={() => setSettingsDraft((prev) => ({ ...prev, hideAliasSubRows: !prev.hideAliasSubRows }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? "Hides the extra sub-rows that show an alias's source/target datapoint beneath the alias row."
                        : 'Blendet die zusätzlichen Unterzeilen aus, die das Quell-/Ziel-Datenpunkt eines Alias unter dessen Zeile anzeigen.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Drag & drop to create aliases" labelDe="Drag & Drop für Aliase"
                      value={settingsDraft.dragDropEnabled ?? false} onToggle={() => setSettingsDraft((prev) => ({ ...prev, dragDropEnabled: !prev.dragDropEnabled }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? 'Lets you drag a StateList row onto an alias.0.* tree node to create an alias. Only active in dual-pane view. Off by default — the native draggable attribute can add a slight delay to row clicks.'
                        : 'Erlaubt das Ziehen einer StateList-Zeile auf einen alias.0.*-Baumknoten, um einen Alias zu erstellen. Nur in der Zwei-Panel-Ansicht aktiv. Standardmäßig aus — das native draggable-Attribut kann Klicks leicht verzögern.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <SettingsToggleRow isEn={isEn} labelEn="Show unit in Value column" labelDe="Einheit in der Wert-Spalte anzeigen"
                      value={settingsDraft.showUnitInValue ?? false} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showUnitInValue: !prev.showUnitInValue }))} />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                      {isEn
                        ? 'Appends the unit (e.g. "°C", "W") directly after the value in the Value column — useful when the Unit column is hidden.'
                        : 'Hängt die Einheit (z. B. „°C", „W") direkt hinter den Wert in der Wert-Spalte — nützlich wenn die Einheit-Spalte ausgeblendet ist.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Tree ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Sidebar tree" de="Seitenbaum" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Font size' : 'Schriftgröße'}</span>
                  <div className="flex gap-1.5">
                    {(['small', 'normal', 'large', 'xl'] as UiFontSize[]).map((s) => (
                      <button key={s} type="button" onClick={() => setSettingsDraft((prev) => ({ ...prev, treeFontSize: s }))}
                        className={`flex-1 py-1 text-xs rounded border transition-colors ${settingsDraft.treeFontSize === s ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        {s === 'small' ? (isEn ? 'S' : 'K') : s === 'large' ? (isEn ? 'L' : 'G') : s === 'xl' ? 'XL' : 'M'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Count badge' : 'Anzahl-Badge'}</span>
                    <select value={settingsDraft.treeCountMode} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, treeCountMode: e.target.value as 'off'|'states'|'objects'|'both' }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option value="off">{isEn ? 'Off' : 'Aus'}</option>
                      <option value="objects">{isEn ? 'Objects only' : 'Nur Objekte'}</option>
                      <option value="states">{isEn ? 'States only' : 'Nur States'}</option>
                      <option value="both">{isEn ? 'Both (States / Objects)' : 'Beides (States / Objekte)'}</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? 'Shows a small badge next to each tree node with the number of states and/or objects nested beneath it.'
                      : 'Zeigt neben jedem Baumknoten ein kleines Badge mit der Anzahl der darunter liegenden States und/oder Objekte an.'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Data ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Data" de="Daten" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Auto-refresh objects' : 'Objekte auto-aktualisieren'}</span>
                    <select value={settingsDraft.objectsRefreshInterval} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, objectsRefreshInterval: e.target.value as 'off'|'30s'|'1m'|'5m'|'10m' }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option value="off">{isEn ? 'Off' : 'Aus'}</option>
                      <option value="30s">30s</option>
                      <option value="1m">1m</option>
                      <option value="5m">5m</option>
                      <option value="10m">10m</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? 'Periodically reloads the full object list in the background — useful when ioBroker adapters add or remove objects during normal operation.'
                      : 'Lädt die vollständige Objektliste periodisch im Hintergrund neu — nützlich, wenn ioBroker-Adapter während des Betriebs Objekte hinzufügen oder entfernen.'}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {isEn ? 'Reuse cache for up to' : 'Cache wiederverwenden für bis zu'}
                    </span>
                    <select value={settingsDraft.objectsCacheReloads} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, objectsCacheReloads: e.target.value as 'off'|'5'|'10'|'20'|'50' }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option value="off">{isEn ? 'Off (always fresh)' : 'Aus (immer frisch)'}</option>
                      <option value="5">{isEn ? '5 loads' : '5 Ladevorgänge'}</option>
                      <option value="10">{isEn ? '10 loads' : '10 Ladevorgänge'}</option>
                      <option value="20">{isEn ? '20 loads' : '20 Ladevorgänge'}</option>
                      <option value="50">{isEn ? '50 loads' : '50 Ladevorgänge'}</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? 'Stores the object list in IndexedDB and reuses it for up to this many page loads instead of re-downloading it every time. The manual refresh button always forces a fresh fetch.'
                      : 'Speichert die Objektliste in der IndexedDB und verwendet sie für bis zu so viele Seitenladevorgänge wieder, statt sie jedes Mal neu zu laden. Der manuelle Aktualisieren-Button erzwingt immer ein frisches Laden.'}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {isEn ? 'Max. cache age' : 'Max. Cache-Alter'}
                    </span>
                    <select value={settingsDraft.objectsCacheTTL} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, objectsCacheTTL: e.target.value as 'off'|'1h'|'6h'|'24h'|'7d' }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      <option value="off">{isEn ? 'Off (no limit)' : 'Aus (kein Limit)'}</option>
                      <option value="1h">{isEn ? '1 hour' : '1 Stunde'}</option>
                      <option value="6h">{isEn ? '6 hours' : '6 Stunden'}</option>
                      <option value="24h">{isEn ? '24 hours' : '24 Stunden'}</option>
                      <option value="7d">{isEn ? '7 days' : '7 Tage'}</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? "Discards the cached object list once it exceeds this age, even if the load count limit hasn't been reached yet."
                      : 'Verwirft die gecachte Objektliste, sobald sie dieses Alter überschreitet — auch wenn das Lade-Limit noch nicht erreicht wurde.'}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <SettingsToggleRow isEn={isEn} labelEn="Fetch state values for visible rows only" labelDe="State-Werte nur für sichtbare Zeilen laden"
                    value={settingsDraft.loadOnlyVisibleStateValues} onToggle={() => setSettingsDraft((prev) => ({ ...prev, loadOnlyVisibleStateValues: !prev.loadOnlyVisibleStateValues }))} />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                    {isEn
                      ? 'Reduces request size on large pages by only fetching values for rows scrolled into view (reported by the table virtualizer), instead of the whole page. Rows scrolled into view briefly show as loading. Off by default — fetches the full page.'
                      : 'Reduziert die Anfragegröße bei großen Seiten, indem nur Werte für Zeilen geladen werden, die gerade sichtbar sind (vom Tabellen-Virtualizer gemeldet), statt der ganzen Seite. Neu eingeblendete Zeilen zeigen kurz „lädt". Standardmäßig aus — lädt die ganze Seite.'}
                  </p>
                </div>
              </div>

            </div>
          )}
          {/* Tab: Spalten */}
          {settingsTab === 'columns' && (
            <div className="flex flex-col gap-5">

              {/* ── Visible columns ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Visible columns" de="Angezeigte Spalten" />
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_COLUMNS.map(({ key }) => {
                    const checked = settingsDraft.visibleCols.includes(key);
                    return (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSettingsDraft((prev) => {
                            const next = checked ? prev.visibleCols.filter((k) => k !== key) : [...prev.visibleCols, key];
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

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Column widths ── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <SettingsGroupLabel isEn={isEn} en="Column widths (px)" de="Spaltenbreiten (px)" />
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
                        <th className="text-center px-1 py-1 font-medium w-16">Min</th>
                        <th className="text-center px-1 py-1 font-medium w-16">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONFIGURABLE_WIDTH_COLS.map((col) => {
                        const builtinDefault = BUILTIN_DEFAULT_WIDTHS[col];
                        const builtinMin = BUILTIN_MIN_WIDTHS[col];
                        const builtinMax = BUILTIN_MAX_WIDTHS[col];
                        const currentDefault = settingsDraft.customDefaultWidths[col] ?? builtinDefault;
                        const currentMin = settingsDraft.customMinWidths[col] ?? builtinMin ?? '';
                        const currentMax = settingsDraft.customMaxWidths[col] ?? builtinMax ?? '';
                        const inputCls = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-14 text-center px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400';
                        return (
                          <tr key={col} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-2 py-0.5 text-gray-600 dark:text-gray-400">{getColumnLabel(col, isEn ? 'en' : 'de')}</td>
                            <td className="px-1 py-0.5 text-center">
                              <input type="number" value={currentDefault}
                                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) setSettingsDraft((prev) => ({ ...prev, customDefaultWidths: { ...prev.customDefaultWidths, [col]: v } })); }}
                                onBlur={(e) => { const v = parseInt(e.target.value, 10); setSettingsDraft((prev) => ({ ...prev, customDefaultWidths: { ...prev.customDefaultWidths, [col]: isNaN(v) || v < 1 ? builtinDefault : v } })); }}
                                className={inputCls} />
                            </td>
                            <td className="px-1 py-0.5 text-center">
                              <input type="number" placeholder="—" value={currentMin}
                                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) setSettingsDraft((prev) => ({ ...prev, customMinWidths: { ...prev.customMinWidths, [col]: v } })); else if (e.target.value === '') setSettingsDraft((prev) => { const next = { ...prev.customMinWidths }; delete next[col]; return { ...prev, customMinWidths: next }; }); }}
                                className={inputCls} />
                            </td>
                            <td className="px-1 py-0.5 text-center">
                              <input type="number" placeholder="∞" value={currentMax}
                                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v > 0) setSettingsDraft((prev) => ({ ...prev, customMaxWidths: { ...prev.customMaxWidths, [col]: v } })); else if (e.target.value === '') setSettingsDraft((prev) => { const next = { ...prev.customMaxWidths }; delete next[col]; return { ...prev, customMaxWidths: next }; }); }}
                                className={inputCls} />
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

          {/* Tab: Filter */}
          {settingsTab === 'filters' && (
            <div className="flex flex-col gap-5">

              {/* ── Quick filter patterns ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Custom quick filters" de="Eigene Schnellfilter" />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  {isEn
                    ? 'Add ID patterns (wildcards supported) that appear as quick-filter buttons in the sidebar.'
                    : 'ID-Muster hinzufügen (Wildcards unterstützt), die als Schnellfilter-Buttons in der Seitenleiste erscheinen.'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newQuickFilter}
                    onChange={(e) => setNewQuickFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addExtraQuickFilter(); }}
                    placeholder={isEn ? 'e.g. hm-rpc.0.*' : 'z.B. hm-rpc.0.*'}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                  />
                  <button onClick={addExtraQuickFilter} className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    {isEn ? 'Add' : 'Hinzufügen'}
                  </button>
                </div>
                <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
                  {settingsDraft.extraQuickFilters.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                      {isEn ? 'No custom filters yet' : 'Noch keine eigenen Filter'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {settingsDraft.extraQuickFilters.map((patternItem) => (
                        <li key={patternItem} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{patternItem}</span>
                          <button
                            onClick={() => setSettingsDraft((prev) => ({ ...prev, extraQuickFilters: prev.extraQuickFilters.filter((p) => p !== patternItem) }))}
                            title={isEn ? 'Remove' : 'Entfernen'}
                            className="shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Tab: Verbindungen */}
          {settingsTab === 'connections' && (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                {isEn
                  ? 'Manage multiple ioBroker instances. Switch between them via the dropdown in the title bar.'
                  : 'Mehrere ioBroker-Instanzen verwalten. Wechsel über das Dropdown in der Titelleiste.'}
              </p>

              {/* Connection list */}
              <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 overflow-hidden">
                {connections.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">
                    {isEn ? 'No saved connections' : 'Keine gespeicherten Verbindungen'}
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {connections.map((conn) => {
                      const isActive = conn.id === activeConnId;
                      const isEditing = editingConn?.id === conn.id;
                      return (
                        <li key={conn.id} className={`flex flex-col ${isActive ? 'bg-blue-500/5' : ''}`}>
                          {/* Collapsed row */}
                          <div className="px-3 py-2.5 flex items-center gap-2">
                            <Server size={12} className={isActive ? 'text-blue-500 dark:text-blue-400 shrink-0' : 'text-gray-400 dark:text-gray-500 shrink-0'} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{conn.name}</span>
                                {isActive && <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400">{isEn ? 'Active' : 'Aktiv'}</span>}
                              </div>
                              <div className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate">{conn.host}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!isActive && (
                                <button
                                  onClick={() => { setSwitchingConnId(conn.id); void switchToConnection(conn); }}
                                  disabled={switchingConnId === conn.id}
                                  title={isEn ? 'Switch to this connection' : 'Zu dieser Verbindung wechseln'}
                                  className="px-2 py-1 text-xs rounded bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-50"
                                >
                                  {switchingConnId === conn.id ? <Loader2 size={11} className="animate-spin" /> : (isEn ? 'Switch' : 'Wechseln')}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingConn(null);
                                  } else {
                                    const form: EditingConnForm = {
                                      id: conn.id,
                                      name: conn.name,
                                      host: conn.host,
                                      socketHost: conn.socketHost ?? '',
                                      realtimeTransport: conn.realtimeTransport ?? 'socketio',
                                      adminPort: conn.adminPort ?? 8081,
                                    };
                                    setEditingConn(form);
                                    setOriginalEditingConn(form);
                                    setConnHostTestResult(null);
                                    setConnHostTestError(null);
                                    setConnSioTestResult(null);
                                    setConnSioTestError(null);
                                  }
                                }}
                                title={isEditing ? (isEn ? 'Collapse' : 'Einklappen') : (isEn ? 'Edit' : 'Bearbeiten')}
                                className={`p-1 rounded transition-colors ${isEditing ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-500/10'}`}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  const updated = connections.filter((c) => c.id !== conn.id);
                                  setConnectionsState(updated);
                                  setConnections(updated);
                                  if (isEditing) setEditingConn(null);
                                  if (isActive && updated.length > 0) {
                                    setSwitchingConnId(updated[0].id);
                                    void switchToConnection(updated[0]);
                                  }
                                }}
                                title={isEn ? 'Delete' : 'Löschen'}
                                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded edit form */}
                          {isEditing && editingConn && (() => {
                            const isDirty = !originalEditingConn ||
                              editingConn.name !== originalEditingConn.name ||
                              editingConn.host !== originalEditingConn.host ||
                              editingConn.socketHost !== originalEditingConn.socketHost ||
                              editingConn.realtimeTransport !== originalEditingConn.realtimeTransport ||
                              editingConn.adminPort !== originalEditingConn.adminPort;
                            return (
                            <div className="px-3 pb-3 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 pt-3">

                              {/* Name */}
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Name' : 'Name'}</span>
                                <input
                                  value={editingConn.name}
                                  onChange={(e) => setEditingConn((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                                  placeholder={isEn ? 'e.g. Home' : 'z.B. Zuhause'}
                                  className="px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              </div>

                              {/* REST API host */}
                              <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'REST API host (ioBroker.rest-api)' : 'REST-API-Host (ioBroker.rest-api)'}</span>
                                <input
                                  value={editingConn.host}
                                  onChange={(e) => { setEditingConn((prev) => prev ? { ...prev, host: e.target.value } : prev); setConnHostTestResult(null); setConnHostTestError(null); }}
                                  placeholder="10.4.0.33:8093"
                                  disabled={connHostTesting}
                                  className={`px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none transition-colors ${
                                    connHostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : connHostTestError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
                                  }`}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={connHostTesting}
                                    onClick={async () => {
                                      const val = editingConn.host.trim();
                                      if (!val) return;
                                      setConnHostTesting(true);
                                      setConnHostTestResult(null);
                                      setConnHostTestError(null);
                                      try {
                                        const testUrl = window.location.protocol === 'https:'
                                          ? '/api/v1/objects?limit=1'
                                          : `http://${val}/v1/objects?limit=1`;
                                        const res = await fetch(testUrl);
                                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                        setConnHostTestResult('ok');
                                      } catch {
                                        setConnHostTestResult('error');
                                        setConnHostTestError(isEn ? 'Host not reachable' : 'Host nicht erreichbar');
                                      } finally {
                                        setConnHostTesting(false);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                                  >
                                    {connHostTesting
                                      ? <><Loader2 size={12} className="animate-spin" />{isEn ? 'Testing…' : 'Teste…'}</>
                                      : isEn ? 'Test' : 'Testen'
                                    }
                                  </button>
                                  {connHostTestResult === 'ok' && (
                                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><Check size={12} /> {isEn ? 'Connected' : 'Verbunden'}</span>
                                  )}
                                  {connHostTestResult === 'error' && connHostTestError && (
                                    <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={12} /> {connHostTestError}</span>
                                  )}
                                  {editingConn.host.trim() && (
                                    <a
                                      href={`http://${editingConn.host.trim()}/api-doc/`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-auto flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                    >
                                      <ExternalLink size={11} /> Swagger UI
                                    </a>
                                  )}
                                </div>
                              </div>

                              {/* Realtime transport */}
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Realtime transport' : 'Echtzeit-Übertragung'}</span>
                                <select
                                  value={editingConn.realtimeTransport}
                                  onChange={(e) => setEditingConn((prev) => prev ? { ...prev, realtimeTransport: e.target.value as 'longpolling' | 'socketio' } : prev)}
                                  className="px-2 py-1.5 text-xs rounded border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                >
                                  <option value="longpolling">{isEn ? 'Long polling (REST only, always available)' : 'Long Polling (nur REST, immer verfügbar)'}</option>
                                  <option value="socketio">{isEn ? 'Socket.IO (default — requires socketio adapter)' : 'Socket.IO (Standard — benötigt socketio-Adapter)'}</option>
                                </select>
                              </div>

                              {/* Socket.IO host (only when socketio selected) */}
                              {editingConn.realtimeTransport === 'socketio' && (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Socket.IO host (optional override)' : 'Socket.IO-Host (optionaler Override)'}</span>
                                  <input
                                    value={editingConn.socketHost}
                                    onChange={(e) => { setEditingConn((prev) => prev ? { ...prev, socketHost: e.target.value } : prev); setConnSioTestResult(null); setConnSioTestError(null); }}
                                    placeholder={`${editingConn.host.trim().split(':')[0] || '10.4.0.33'}:8084`}
                                    className="px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={connSioTesting}
                                      onClick={testConnSocketConnection}
                                      className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                                    >
                                      {connSioTesting
                                        ? <><Loader2 size={12} className="animate-spin" />{isEn ? 'Testing…' : 'Teste…'}</>
                                        : isEn ? 'Test' : 'Testen'
                                      }
                                    </button>
                                    {connSioTestResult === 'ok' && (
                                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><Check size={12} /> {isEn ? 'Connected' : 'Verbunden'}</span>
                                    )}
                                    {connSioTestResult === 'error' && (
                                      <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={12} /> {connSioTestError}</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Admin port */}
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Admin UI port (ioBroker Admin)' : 'Admin-Port (ioBroker Admin)'}</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={65535}
                                  value={editingConn.adminPort}
                                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setEditingConn((prev) => prev ? { ...prev, adminPort: v } : prev); }}
                                  className="w-full px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {editingConn.host.trim() && (
                                  <a
                                    href={`http://${editingConn.host.trim().split(':')[0]}:${editingConn.adminPort}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="self-start flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                  >
                                    <ExternalLink size={11} /> ioBroker Admin
                                  </a>
                                )}
                              </div>

                              {/* Save / Cancel buttons */}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => {
                                    const name = editingConn.name.trim();
                                    const host = editingConn.host.trim();
                                    if (!name || !host) return;
                                    const updated = connections.map((c) =>
                                      c.id === editingConn.id
                                        ? { ...c, name, host, socketHost: editingConn.socketHost.trim() || undefined, realtimeTransport: editingConn.realtimeTransport, adminPort: editingConn.adminPort }
                                        : c
                                    );
                                    setConnectionsState(updated);
                                    setConnections(updated);
                                    // If editing active connection: update appSettings draft + persist transport/host/adminPort
                                    if (isActive) {
                                      const prevHost = localStorage.getItem('ioBrokerHost') ?? '';
                                      localStorage.setItem('ioBrokerHost', host);
                                      setSettingsDraft((prev) => ({
                                        ...prev,
                                        realtimeTransport: editingConn.realtimeTransport,
                                        socketHost: editingConn.socketHost.trim(),
                                        adminPort: editingConn.adminPort,
                                      }));
                                      if (prevHost !== host) {
                                        // host changed — reload after cache clear
                                        void (async () => {
                                          await clearObjectsCache();
                                          window.location.reload();
                                        })();
                                        return;
                                      }
                                    }
                                    setEditingConn(null);
                                  }}
                                  disabled={!editingConn.name.trim() || !editingConn.host.trim()}
                                  className={`px-2.5 py-1.5 text-xs rounded text-white disabled:opacity-50 transition-colors ${isDirty ? 'bg-amber-500 hover:bg-amber-600 ring-2 ring-amber-400/60' : 'bg-blue-600 hover:bg-blue-700'}`}
                                >
                                  {isEn ? 'Save' : 'Speichern'}
                                </button>
                                <button
                                  onClick={() => setEditingConn(null)}
                                  className="px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  {isEn ? 'Cancel' : 'Abbrechen'}
                                </button>
                              </div>
                            </div>
                          );
                          })()}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Add new connection */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Add Connection' : 'Neue Verbindung'}</span>
                <div className="flex gap-2">
                  <input
                    value={newConnName}
                    onChange={(e) => setNewConnName(e.target.value)}
                    placeholder={isEn ? 'Name (e.g. Home)' : 'Name (z.B. Zuhause)'}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <input
                    value={newConnHost}
                    onChange={(e) => setNewConnHost(e.target.value)}
                    placeholder="10.4.0.33:8093"
                    onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('add-conn-btn')?.click(); }}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    id="add-conn-btn"
                    onClick={() => {
                      const name = newConnName.trim();
                      const host = newConnHost.trim();
                      if (!name || !host) return;
                      const newConn: SavedConnection = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), name, host };
                      const updated = [...connections, newConn];
                      setConnectionsState(updated);
                      setConnections(updated);
                      setNewConnName('');
                      setNewConnHost('');
                    }}
                    disabled={!newConnName.trim() || !newConnHost.trim()}
                    className="p-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Namespaces */}
          {settingsTab === 'namespaces' && (
            <div className="flex flex-col gap-5">

              {/* ── ID prefix stripping ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Included namespaces" de="Inkludierte Namespaces" />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  {isEn
                    ? 'When configured, only objects from these namespaces are fetched from the API — reducing transfer size and processing. Enums (rooms/functions) are always fetched. Empty = fetch everything. Example: "alias.0." fetches only alias objects.'
                    : 'Wenn konfiguriert, werden nur Objekte aus diesen Namespaces von der API abgerufen — weniger Daten, weniger Verarbeitung. Enums (Räume/Funktionen) werden immer geladen. Leer = alles laden. Beispiel: "alias.0." lädt nur Alias-Objekte.'}
                </p>
                <div className="flex items-center gap-2">
                  <NamespaceInput
                    value={newStripPrefix}
                    onChange={setNewStripPrefix}
                    onAdd={addStripPrefix}
                    suggestions={namespaceSuggestions.filter((s) => !(settingsDraft.includeIdPrefixes ?? []).includes(s))}
                    isEn={isEn}
                  />
                  <button onClick={() => addStripPrefix()} className="px-2.5 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    {isEn ? 'Add' : 'Hinzufügen'}
                  </button>
                </div>
                <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
                  {(settingsDraft.includeIdPrefixes ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                      {isEn ? 'No prefixes configured' : 'Keine Präfixe konfiguriert'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {(settingsDraft.includeIdPrefixes ?? []).map((prefix) => (
                        <li key={prefix} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{prefix}</span>
                          <button
                            onClick={() => setSettingsDraft((prev) => ({ ...prev, includeIdPrefixes: (prev.includeIdPrefixes ?? []).filter((p) => p !== prefix) }))}
                            title={isEn ? 'Remove' : 'Entfernen'}
                            className="shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={resetSettingsToDefault}
              className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {isEn ? 'Reset settings' : 'Einstellungen zurücksetzen'}
            </button>
            <ClearLocalStorageButton isEn={isEn} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
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
    </div>,
    document.body
  );
}

function NamespaceInput({ value, onChange, onAdd, suggestions, isEn }: {
  value: string;
  onChange: (v: string) => void;
  onAdd: (directVal?: string) => void;
  suggestions: string[];
  isEn: boolean;
}) {
  const [open, setOpen] = useState(false);

  const filtered = value.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onAdd(); setOpen(false); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={isEn ? 'e.g. mqtt.0.' : 'z.B. mqtt.0.'}
        className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 top-full mt-1 z-50 w-full max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { pick(s); onAdd(s); }}
                className="w-full px-2.5 py-1.5 text-left text-xs font-mono text-gray-700 dark:text-gray-300 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClearLocalStorageButton({ isEn }: { isEn: boolean }) {
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        {isEn ? 'Clear local storage' : 'Local Storage löschen'}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {isEn ? 'Clear local storage?' : 'Local Storage löschen?'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isEn
                  ? 'All settings, column widths, and cached data will be deleted. The page reloads afterwards.'
                  : 'Alle Einstellungen, Spaltenbreiten und gecachte Daten werden gelöscht. Die Seite lädt danach neu.'}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                {isEn ? 'Delete & reload' : 'Löschen & neu laden'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function SettingsGroupLabel({ isEn, en, de }: { isEn: boolean; en: string; de: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {isEn ? en : de}
    </div>
  );
}

function SettingsToggleRow({ isEn, labelEn, labelDe, value, onToggle }: {
  isEn: boolean; labelEn: string; labelDe: string; value: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? labelEn : labelDe}</span>
      <button type="button" onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
