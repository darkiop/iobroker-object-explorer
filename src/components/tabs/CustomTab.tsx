import { useState, useEffect } from 'react';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import type { IoBrokerObjectCommon } from '../../types/iobroker';

// ── Adapter defaults ───────────────────────────────────────────────────────

const SQL_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, storageType: '', counter: false, aliasId: '', debounceTime: 0,
  blockTime: 0, changesOnly: true, changesRelogInterval: '0', changesMinDelta: '0',
  ignoreBelowNumber: '', disableSkippedValueLogging: false, retention: '31536000',
  customRetentionDuration: 365, maxLength: 0, enableDebugLogs: false, debounce: '1000',
};

const HISTORY_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, changesOnly: true, debounce: 1000, debounceTime: 0, maxLength: 960,
  retention: 31536000, counter: false, aliasId: '', blockTime: 0,
  changesRelogInterval: 0, changesMinDelta: 0, ignoreBelowNumber: '',
  disableSkippedValueLogging: false, enableDebugLogs: false,
};

const INFLUXDB_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, changesOnly: true, debounce: 1000, debounceTime: 0, maxLength: 0,
  retention: 0, counter: false, aliasId: '', blockTime: 0,
  changesRelogInterval: 0, changesMinDelta: 0, ignoreBelowNumber: '',
  disableSkippedValueLogging: false, enableDebugLogs: false,
};

const SOURCEANALYTIX_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, selectedUnit: 'Detect automatically', deviceResetLogicEnabled: true,
  threshold: 1, start_day: 0, start_week: 0, start_month: 0, start_quarter: 0, start_year: 0,
};

const STATISTICS_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, count: false, fiveMin: false, sumCount: false, impUnitPerImpulse: 1,
  impUnit: '', timeCount: false, avg: false, minmax: false, sumDelta: false,
  sumIgnoreMinus: false, groupFactor: 1, logName: '',
};

const TELEGRAM_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: false, alias: '', recipients: '', readOnly: false, report: true,
  onlyFalse: false, onlyTrue: false, silent: false, buttons: 3, writeOnly: false,
  offCommand: '', onCommand: '', offStatus: '', onStatus: '',
};

const ADAPTER_CUSTOM_DEFAULTS: Record<string, Record<string, unknown>> = {
  sql: SQL_CUSTOM_DEFAULT, history: HISTORY_CUSTOM_DEFAULT,
  influxdb: INFLUXDB_CUSTOM_DEFAULT, timescaledb: INFLUXDB_CUSTOM_DEFAULT,
  telegram: TELEGRAM_CUSTOM_DEFAULT, sourceanalytix: SOURCEANALYTIX_CUSTOM_DEFAULT,
  statistics: STATISTICS_CUSTOM_DEFAULT,
};

const ADAPTER_LABELS: Record<string, string> = {
  sql: 'SQL History', history: 'File History', influxdb: 'InfluxDB',
  timescaledb: 'TimescaleDB', telegram: 'Telegram',
  sourceanalytix: 'Source Analytix', statistics: 'Statistics',
};

function getDefaultForAdapter(adapterName: string): Record<string, unknown> {
  return ADAPTER_CUSTOM_DEFAULTS[adapterName] ?? { enabled: false };
}

function getAdapterLabel(adapterName: string): string {
  return ADAPTER_LABELS[adapterName] ?? adapterName;
}

// ── Mini components ────────────────────────────────────────────────────────

function CustomNumberInput({ value, onChange }: { value: number; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    const n = Number(draft);
    if (!isNaN(n)) onChange(n);
    else setDraft(String(value));
  }
  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className="w-28 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-200 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none"
    />
  );
}

function CustomSettingRow({ fieldKey, value, onChange }: { fieldKey: string; value: unknown; onChange: (v: unknown) => void }) {
  const labelCls = 'text-gray-400 dark:text-gray-500 text-xs w-52 shrink-0 font-mono';
  const rowCls = 'flex gap-4 py-1 border-b border-gray-100 dark:border-gray-800/60 items-center';

  if (typeof value === 'boolean') {
    return (
      <div className={rowCls}>
        <span className={labelCls}>{fieldKey}</span>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'}`}>
            {value && <Check size={11} className="text-white" strokeWidth={3} />}
          </span>
        </label>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div className={rowCls}>
        <span className={labelCls}>{fieldKey}</span>
        <CustomNumberInput value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className={rowCls}>
      <span className={labelCls}>{fieldKey}</span>
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-200 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

// ── CustomTab ──────────────────────────────────────────────────────────────

interface CustomTabProps {
  language: 'en' | 'de';
  customDraft: NonNullable<IoBrokerObjectCommon['custom']>;
  setCustomDraft: React.Dispatch<React.SetStateAction<NonNullable<IoBrokerObjectCommon['custom']>>>;
  shownAdapters: Set<string>;
  setShownAdapters: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedAdapters: Set<string>;
  setExpandedAdapters: React.Dispatch<React.SetStateAction<Set<string>>>;
  customLoading: boolean;
  customDraftLoaded: boolean;
  customInstances: Array<{ id: string; adapterName: string }>;
}

export default function CustomTab({
  language,
  customDraft, setCustomDraft,
  shownAdapters, setShownAdapters,
  expandedAdapters, setExpandedAdapters,
  customLoading, customDraftLoaded,
  customInstances,
}: CustomTabProps) {
  const isEn = language === 'en';

  function toggleAdapter(adapterId: string) {
    setExpandedAdapters((prev) => {
      const next = new Set(prev);
      if (next.has(adapterId)) next.delete(adapterId);
      else next.add(adapterId);
      return next;
    });
  }

  function setCustomField(adapterId: string, field: string, value: unknown) {
    setCustomDraft((prev) => ({
      ...prev,
      [adapterId]: { ...prev[adapterId], [field]: value },
    }));
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">

      {customLoading && !customDraftLoaded && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400 dark:text-gray-500 text-sm">
          <RefreshCw size={14} className="animate-spin" />
          {isEn ? 'Loading…' : 'Laden…'}
        </div>
      )}

      {(!customLoading || customDraftLoaded) && (
        <>
          {(() => {
            const instanceIds = new Set(customInstances.map((c) => c.id));
            const extraFromDraft = Object.keys(customDraft)
              .filter((id) => !instanceIds.has(id))
              .map((id) => ({ id, adapterName: id.replace(/\.\d+$/, '') }));
            const allChips = [...customInstances, ...extraFromDraft];
            if (allChips.length === 0) return null;
            return (
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  {isEn ? 'Adapter' : 'Adapter'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {allChips.map(({ id: instanceId, adapterName }) => {
                    const active = shownAdapters.has(instanceId);
                    return (
                      <label
                        key={instanceId}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer select-none text-xs transition-colors ${
                          active
                            ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                            : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCustomDraft((prev) => {
                                const existing = prev[instanceId] ?? { ...getDefaultForAdapter(adapterName) };
                                return { ...prev, [instanceId]: { ...existing, enabled: true } };
                              });
                              setShownAdapters((prev) => new Set([...prev, instanceId]));
                            } else {
                              setCustomDraft((prev) => prev[instanceId]
                                ? { ...prev, [instanceId]: { ...prev[instanceId], enabled: false } }
                                : prev
                              );
                              setShownAdapters((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
                              setExpandedAdapters((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
                            }
                          }}
                          className="sr-only"
                        />
                        <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${active ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'}`} />
                        <span className="font-mono">{instanceId}</span>
                        <span className="opacity-60">{getAdapterLabel(adapterName)}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="h-px bg-gray-200 dark:bg-gray-700" />
              </div>
            );
          })()}

          {shownAdapters.size === 0 && Object.keys(customDraft).length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-400 dark:text-gray-500 text-sm">
              {isEn ? 'No custom settings configured' : 'Keine benutzerdefinierten Einstellungen konfiguriert'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(customDraft)
                .filter(([adapterId]) => shownAdapters.has(adapterId))
                .map(([adapterId, settings]) => {
                  const isExpanded = expandedAdapters.has(adapterId);
                  const isEnabled = settings.enabled === true;
                  const adapterName = adapterId.replace(/\.\d+$/, '');
                  const otherEntries = Object.entries(settings).filter(([k]) => k !== 'enabled');
                  return (
                    <div key={adapterId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleAdapter(adapterId)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <ChevronDown size={13} className={`text-gray-400 dark:text-gray-500 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 shrink-0">{getAdapterLabel(adapterName)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono flex-1">{adapterId}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isEnabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {isEnabled ? (isEn ? 'ON' : 'AN') : (isEn ? 'OFF' : 'AUS')}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-3 py-2 flex flex-col">
                          <CustomSettingRow
                            fieldKey="enabled"
                            value={settings.enabled ?? false}
                            onChange={(v) => setCustomField(adapterId, 'enabled', v)}
                          />
                          {otherEntries.map(([key, val]) => (
                            <CustomSettingRow
                              key={key}
                              fieldKey={key}
                              value={val}
                              onChange={(v) => setCustomField(adapterId, key, v)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
