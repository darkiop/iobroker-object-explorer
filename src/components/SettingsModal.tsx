import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import LanguageDropdown from './LanguageDropdown';
import { X, ChevronDown, Check, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import type { DateFormatSetting } from './stateListColumns';
import { ALL_COLUMNS, DEFAULT_COLS, getColumnLabel, CONFIGURABLE_WIDTH_COLS, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MIN_WIDTHS, BUILTIN_MAX_WIDTHS } from './stateListColumns';
import { useAppSettingsContext, useUIOverlayContext, DEFAULT_QUICK_PATTERNS, getDefaultAppSettings, normalizeQuickPattern } from '../context/UIContext';
import type { AppSettings, UiFontSize } from '../context/UIContext';
import { useFilterContext } from '../context/FilterContext';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

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

function initHostState(): { ip: string; port: string } {
  const stored = localStorage.getItem('ioBrokerHost') ?? window.__CONFIG__?.ioBrokerHost ?? '';
  const colonIdx = stored.lastIndexOf(':');
  return {
    ip: colonIdx > 0 ? stored.slice(0, colonIdx) : stored,
    port: colonIdx > 0 ? stored.slice(colonIdx + 1) : '8093',
  };
}

function initDraftFromSettings(appSettings: AppSettings): AppSettings {
  return { ...appSettings };
}

export default function SettingsModal() {
  const { appSettings, persistSettings, handleLanguageChange } = useAppSettingsContext();
  const { theme, setTheme } = useTheme();
  const { setSettingsOpen } = useUIOverlayContext();
  const { setPage, setQuickPatterns } = useFilterContext();
  const onClose = () => setSettingsOpen(false);
  useEscapeKey(onClose);

  const [settingsTab, setSettingsTab] = useState<'connection' | 'display' | 'columns' | 'filters'>('connection');
  const [settingsHostIp, setSettingsHostIp] = useState(() => initHostState().ip);
  const [settingsHostPort, setSettingsHostPort] = useState(() => initHostState().port);
  const [settingsHostTesting, setSettingsHostTesting] = useState(false);
  const [settingsHostError, setSettingsHostError] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => initDraftFromSettings(appSettings));
  const [newQuickFilter, setNewQuickFilter] = useState('');

  const isEn = appSettings.language === 'en';

  const applySettings = useCallback((next: AppSettings) => {
    persistSettings(next);
    setPage(0);
    const allowed = new Set([...DEFAULT_QUICK_PATTERNS, ...next.extraQuickFilters]);
    setQuickPatterns((prev) => new Set([...prev].filter((p) => allowed.has(p))));
    setSettingsOpen(false);
  }, [persistSettings, setPage, setQuickPatterns, setSettingsOpen]);

  const saveSettings = useCallback(() => {
    const nextCols = settingsDraft.visibleCols.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
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
      includeScripts: settingsDraft.includeScripts,
      showObjectIcons: settingsDraft.showObjectIcons,
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

  const resetSettingsToDefault = useCallback(() => {
    const defaults = getDefaultAppSettings();
    setSettingsDraft(defaults);
    applySettings(defaults);
  }, [applySettings]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl animate-modal-in rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
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
          {(['connection', 'display', 'columns', 'filters'] as const).map((tab) => {
            const label = {
              connection: isEn ? 'Connection' : 'Verbindung',
              display:    isEn ? 'Display'    : 'Anzeige',
              columns:    isEn ? 'Table'      : 'Tabelle',
              filters:    isEn ? 'Quick Filters' : 'Schnellfilter',
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
          {/* Tab: Verbindung */}
          {settingsTab === 'connection' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{'ioBroker IP address'}</span>
                <input
                  value={settingsHostIp}
                  onChange={(e) => { setSettingsHostIp(e.target.value); setSettingsHostError(null); }}
                  disabled={settingsHostTesting}
                  placeholder="10.4.0.33"
                  className={`px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none transition-colors ${
                    settingsHostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : settingsHostError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{'ioBroker.rest-api Port'}</span>
                  <input
                    value={settingsHostPort}
                    onChange={(e) => { setSettingsHostPort(e.target.value); setSettingsHostError(null); }}
                    disabled={settingsHostTesting}
                    placeholder="8093"
                    className={`w-full px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none transition-colors ${
                      settingsHostTesting ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : settingsHostError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
                    }`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{'ioBroker Admin Port'}</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={settingsDraft.adminPort}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setSettingsDraft((prev) => ({ ...prev, adminPort: v }));
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded border font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                {settingsHostError && (
                  <span className="flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle size={12} /> {settingsHostError}
                  </span>
                )}
              </div>
            </div>
          )}
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
                      { value: 'light',   labelEn: 'Light',   labelDe: 'Hell',     preview: 'bg-white border-gray-300 text-gray-800' },
                      { value: 'dark',    labelEn: 'Dark',    labelDe: 'Dunkel',   preview: 'bg-gray-800 border-gray-600 text-gray-100' },
                      { value: 'obsidian',labelEn: 'Obsidian',labelDe: 'Obsidian', preview: 'bg-[#1e1e2e] border-[#45475a] text-[#cdd6f4]' },
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
                <SettingsToggleRow isEn={isEn} labelEn="Toolbar button labels" labelDe="Beschriftungen in der Toolbar"
                  value={settingsDraft.toolbarLabels} onToggle={() => setSettingsDraft((prev) => ({ ...prev, toolbarLabels: !prev.toolbarLabels }))} />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Table ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Table" de="Tabelle" />
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Rows per page' : 'Zeilen pro Seite'}</span>
                    <select value={settingsDraft.pageSize} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, pageSize: parseInt(e.target.value, 10) }))}
                      className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <SettingsToggleRow isEn={isEn} labelEn="Group table by path" labelDe="Tabelle nach Pfad gruppieren"
                  value={settingsDraft.groupByPath} onToggle={() => setSettingsDraft((prev) => ({ ...prev, groupByPath: !prev.groupByPath }))} />
                <SettingsToggleRow isEn={isEn} labelEn="Description below name" labelDe="Beschreibung unter Name"
                  value={settingsDraft.showDesc} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showDesc: !prev.showDesc }))} />
                <SettingsToggleRow isEn={isEn} labelEn="Show object icons in Name column" labelDe="Objekt-Icons in der Name-Spalte anzeigen"
                  value={settingsDraft.showObjectIcons} onToggle={() => setSettingsDraft((prev) => ({ ...prev, showObjectIcons: !prev.showObjectIcons }))} />
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
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* ── Data ── */}
              <div className="flex flex-col gap-3">
                <SettingsGroupLabel isEn={isEn} en="Data" de="Daten" />
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
              </div>

            </div>
          )}
          {/* Tab: Spalten */}
          {settingsTab === 'columns' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Visible columns' : 'Angezeigte Spalten'}</span>
                <div className="grid grid-cols-3 gap-1.5">
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
                                placeholder="—"
                                value={currentMin}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!isNaN(v) && v > 0)
                                    setSettingsDraft((prev) => ({ ...prev, customMinWidths: { ...prev.customMinWidths, [col]: v } }));
                                  else if (e.target.value === '')
                                    setSettingsDraft((prev) => { const next = { ...prev.customMinWidths }; delete next[col]; return { ...prev, customMinWidths: next }; });
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
