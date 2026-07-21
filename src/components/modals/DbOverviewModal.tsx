import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X, Database, ChevronUp, ChevronDown, Loader2, AlertTriangle, Trash2, Pencil, Hash, Copy, Unlink, Search, RefreshCw, LineChart, FilterX, Upload, Download } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDpOverview, useDbStats, useDpNumericIds, useAllObjects } from '../../hooks/useObjectQueries';
import { queryKeys } from '../../hooks/queryKeys';
import { deleteHistoryAll, renameDpInDb, getDpValueCount, buildDpOverviewSql, hasHistory } from '../../api/iobroker';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../context/ToastContext';
import { useAppSettingsContext } from '../../context/UIContext';
import { useDbBackup } from '../../hooks/useDbBackup';
import { getTypeColor } from '../../utils/typeColor';
import DpValuesModal from './DpValuesModal';
import OrphanValuesModal from './OrphanValuesModal';
import DbBackupModal from './DbBackupModal';
import HistoryModal from './HistoryModal';
import StyledCheckbox from '../ui/StyledCheckbox';
import { ColoredId } from '../../utils/coloredId';
import type { DpOverviewRow } from '../../api/iobroker';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
}

// Consistency between what sql.0 stores and what the object is configured for.
type DpStatus = 'ok' | 'logging-off' | 'orphan' | 'unknown';

// Sort rank: ascending puts the problems on top.
const STATUS_RANK: Record<DpStatus, number> = { orphan: 0, 'logging-off': 1, ok: 2, unknown: 3 };

// Tinted rows need their own hover variant, otherwise the generic row hover wins.
const STATUS_ROW_CLASS: Record<DpStatus, string> = {
  ok: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
  unknown: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
  'logging-off': 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20',
  orphan: 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20',
};

// POC: read-only view of datapoints stored in the sql.0 database (via getDpOverview sendTo).
// Columns are derived dynamically from the returned rows, since the adapter's response
// shape is not guaranteed across versions. `id` is always shown first.
export default function DbOverviewModal({ onClose, language }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';

  const { data, isLoading, isError, error } = useDpOverview(true);
  const { data: stats } = useDbStats(true);
  const { data: idMap } = useDpNumericIds(true);
  const { data: allObjects } = useAllObjects();
  const queryClient = useQueryClient();
  const showToast = useToast();
  // One filter per column, keyed by column name plus the two synthetic columns
  // '__status__' (exact match on DpStatus) and '__count__' (substring on the count).
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [rawTs, setRawTs] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: unknown } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { appSettings } = useAppSettingsContext();
  const backup = useDbBackup();
  const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number } | null>(null);
  // Manual export runs independently of the delete guard, so it carries its own
  // cap decision instead of borrowing pendingDelete's.
  const [exportCap, setExportCap] = useState<{ id: string; type: unknown; total: number; cap: number } | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [valuesOf, setValuesOf] = useState<{ id: string; type: unknown } | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [renameOldId, setRenameOldId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const idSet = useMemo(() => new Set((data ?? []).map((r) => r.id)), [data]);
  // Per-datapoint value counts, loaded on demand (full-table counts are too slow).
  const [counts, setCounts] = useState<Record<string, number | 'loading' | 'error'>>({});

  function copySql() {
    copyToClipboard(buildDpOverviewSql())
      .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
  }

  async function loadCount(id: string, type: unknown) {
    setCounts((c) => ({ ...c, [id]: 'loading' }));
    try {
      const n = await getDpValueCount(id, type);
      setCounts((c) => ({ ...c, [id]: n }));
    } catch (err) {
      setCounts((c) => ({ ...c, [id]: 'error' }));
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  const [countingAll, setCountingAll] = useState(false);
  async function countAllVisible(list: DpOverviewRow[]) {
    setCountingAll(true);
    try {
      for (const r of list) {
        if (!r.id || typeof counts[r.id] === 'number') continue;
        await loadCount(r.id, r.type);
      }
      setSortKey('__count__');
      setSortDir('desc');
    } finally {
      setCountingAll(false);
    }
  }

  function copyId(id: string) {
    copyToClipboard(id)
      .then(() => showToast(isEn ? 'ID copied' : 'ID kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
  }

  function startRename(id: string) {
    setRenameOldId(id);
    setRenameValue(id);
  }

  const renameTrimmed = renameValue.trim();
  const renameInvalid =
    !renameTrimmed ||
    renameTrimmed === renameOldId ||
    (renameTrimmed !== renameOldId && idSet.has(renameTrimmed));

  async function handleRenameConfirm() {
    if (!renameOldId || renameInvalid) return;
    setRenaming(true);
    try {
      await renameDpInDb(renameOldId, renameTrimmed);
      showToast(
        isEn ? `Renamed in DB → ${renameTrimmed}` : `In DB umbenannt → ${renameTrimmed}`,
        'success'
      );
      setRenameOldId(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.history.dpOverview });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRenaming(false);
    }
  }

  // Runs the backup export first when enabled and only deletes if it succeeded —
  // a dump written after the delete would be worthless, and one that fails
  // silently is worse than none.
  async function handleDeleteConfirm(acceptCap = false) {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (appSettings.dbBackupBeforeDelete) {
        const res = await backup.exportNamed({
          id: pendingDelete.id,
          type: pendingDelete.type,
          trigger: 'delete-all',
          startTs: null,
          endTs: null,
          acceptCap,
        });
        if (!res.ok) {
          if ('needsCapDecision' in res) {
            setCapPrompt({ total: res.total, cap: res.cap });
            return;
          }
          showToast(
            isEn ? `Backup failed, nothing deleted: ${res.error}` : `Backup fehlgeschlagen, nichts gelöscht: ${res.error}`,
            'error',
          );
          return;
        }
      }
      await deleteHistoryAll(pendingDelete.id);
      showToast(
        isEn ? `Deleted DB values for ${pendingDelete.id}` : `DB-Werte für ${pendingDelete.id} gelöscht`,
        'success'
      );
      setPendingDelete(null);
      setCapPrompt(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.history.dpOverview });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  // Downloads a dump of one datapoint without deleting anything.
  async function handleManualExport(id: string, type: unknown, acceptCap = false) {
    setExportingId(id);
    try {
      const res = await backup.exportNamed({
        id, type, trigger: 'manual', startTs: null, endTs: null, acceptCap,
      });
      if (!res.ok) {
        if ('needsCapDecision' in res) {
          setExportCap({ id, type, total: res.total, cap: res.cap });
          return;
        }
        showToast(
          isEn ? `Export failed: ${res.error}` : `Export fehlgeschlagen: ${res.error}`,
          'error',
        );
        return;
      }
      setExportCap(null);
      showToast(
        isEn
          ? `Exported ${res.rows.toLocaleString()} value(s) for ${id}`
          : `${res.rows.toLocaleString()} Wert(e) für ${id} exportiert`,
        'success',
      );
    } finally {
      setExportingId(null);
    }
  }

  const rows = useMemo<DpOverviewRow[]>(() => {
    const base = data ?? [];
    if (!idMap) return base;
    return base.map((r) => ({ ...r, dbId: idMap[r.id] ?? null }));
  }, [data, idMap]);

  // Join the DB side (rows) with the object side: a datapoint can sit in sql.0 while the
  // object no longer exists, or exists but has sql.0 logging switched off.
  // 'unknown' covers the window where allObjects is still loading — without it every row
  // would briefly flash as an orphan.
  const statusById = useMemo(() => {
    const map = new Map<string, DpStatus>();
    for (const r of rows) {
      if (!allObjects) { map.set(r.id, 'unknown'); continue; }
      const obj = allObjects[r.id];
      if (!obj) { map.set(r.id, 'orphan'); continue; }
      map.set(r.id, hasHistory(obj) ? 'ok' : 'logging-off');
    }
    return map;
  }, [rows, allObjects]);

  // Union of all keys across rows; `id` first, rest alphabetical.
  const columns = useMemo<string[]>(() => {
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
    keys.delete('id');
    return ['id', ...Array.from(keys).sort()];
  }, [rows]);

  // Active filters as [column, lowercased query] pairs — recomputed once per change
  // instead of per row.
  const activeFilters = useMemo(
    () =>
      Object.entries(colFilters)
        .map(([col, q]) => [col, q.trim().toLowerCase()] as const)
        .filter(([, q]) => q !== ''),
    [colFilters]
  );

  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return rows;
    const now = Date.now();
    return rows.filter((r) =>
      activeFilters.every(([col, q]) => {
        if (col === '__status__') return (statusById.get(r.id) ?? 'unknown') === q;
        if (isTsColumn(col)) return matchesTsFilter(r[col], q, now);
        if (col === '__count__') {
          const c = counts[r.id];
          return typeof c === 'number' && String(c).includes(q);
        }
        // Match what the cell actually shows, so a filter on a ts column works
        // against the formatted date the user sees.
        return formatCell(col, r[col], rawTs).toLowerCase().includes(q);
      })
    );
  }, [rows, activeFilters, statusById, counts, rawTs]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === '__status__') {
        const av = STATUS_RANK[statusById.get(a.id) ?? 'unknown'];
        const bv = STATUS_RANK[statusById.get(b.id) ?? 'unknown'];
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      if (sortKey === '__count__') {
        const av = typeof counts[a.id] === 'number' ? (counts[a.id] as number) : -1;
        const bv = typeof counts[b.id] === 'number' ? (counts[b.id] as number) : -1;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = av == null ? '' : String(av);
      const bs = bv == null ? '' : String(bv);
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortKey, sortDir, counts, statusById]);

  function setColFilter(col: string, value: string) {
    setColFilters((f) => ({ ...f, [col]: value }));
  }

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const thClass = 'px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200 whitespace-nowrap';
  const tdClass = 'px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap';
  const filterInputClass = 'w-full min-w-0 px-1.5 py-0.5 text-xs font-normal rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={pendingDelete || renameOldId || orphansOpen || restoreOpen || historyOf ? undefined : onClose}
    >
      <div
        className="w-full max-w-7xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Database size={15} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Database Overview (sql.0)' : 'Datenbank-Übersicht (sql.0)'}
            </h2>
            <span
              className="px-1.5 py-0.5 rounded bg-gray-500/10 text-xs font-mono text-gray-600 dark:text-gray-300"
              title={isEn ? 'Source table' : 'Quell-Tabelle'}
            >
              datapoints
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({filtered.length}{activeFilters.length > 0 ? ` / ${rows.length}` : ''} {isEn ? 'datapoints' : 'Datenpunkte'})
            </span>
            {stats && (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span
                  className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-300 tabular-nums"
                  title={isEn ? 'Approximate total value rows across all history tables' : 'Ungefähre Gesamtzahl der Wert-Zeilen über alle History-Tabellen'}
                >
                  ~{formatCompact(stats.totalValues)} {isEn ? 'values' : 'Werte'}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 tabular-nums"
                  title={isEn ? 'Data + index size of the database' : 'Daten- + Index-Größe der Datenbank'}
                >
                  {formatBytes(stats.sizeBytes)}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none" title={isEn ? 'Show ts as raw epoch (ms)' : 'ts als Roh-Zeitstempel (ms) anzeigen'}>
              <StyledCheckbox checked={rawTs} onChange={(e) => setRawTs(e.target.checked)} />
              {isEn ? 'Raw ts' : 'Roh-ts'}
            </label>
            <button
              onClick={copySql}
              title={isEn ? 'Copy equivalent SQL query' : 'Äquivalente SQL-Abfrage kopieren'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Copy size={12} />
              SQL
            </button>
            <button
              onClick={() => countAllVisible(sorted)}
              disabled={countingAll || sorted.length === 0}
              title={isEn ? 'Count values for all shown datapoints (may take a while)' : 'Werte aller angezeigten Datenpunkte zählen (kann dauern)'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {countingAll ? <Loader2 size={12} className="animate-spin" /> : <Hash size={12} />}
              {isEn ? 'Count and Sort desc' : 'Zählen & absteigend sortieren'}
            </button>
            <button
              onClick={() => setOrphansOpen(true)}
              title={isEn ? 'Find value rows whose datapoint no longer exists in the datapoints table' : 'Wert-Zeilen finden, deren Datenpunkt nicht mehr in der Tabelle datapoints existiert'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Unlink size={12} />
              {isEn ? 'Orphan rows' : 'Verwaiste Zeilen'}
            </button>
            <button
              onClick={() => setRestoreOpen(true)}
              title={isEn ? 'Restore values from a backup dump' : 'Werte aus einem Backup-Dump wiederherstellen'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Upload size={12} />
              {isEn ? 'Restore' : 'Restore'}
            </button>
            {activeFilters.length > 0 && (
              <button
                onClick={() => setColFilters({})}
                title={isEn ? 'Clear all column filters' : 'Alle Spaltenfilter zurücksetzen'}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FilterX size={12} />
                {isEn ? 'Clear filters' : 'Filter löschen'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Irreversible-action warning */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">
            {isEn
              ? 'Warning: changes and deletions made here act directly on the database and cannot be undone.'
              : 'Achtung: Änderungen und Löschungen hier wirken direkt auf die Datenbank und können nicht rückgängig gemacht werden.'}
          </span>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              {isEn ? 'Loading from sql.0…' : 'Lade von sql.0…'}
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2 px-5 py-16 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">
                  {isEn ? 'Failed to load database overview' : 'Datenbank-Übersicht konnte nicht geladen werden'}
                </div>
                <div className="text-xs text-red-500/80 mt-1">
                  {error instanceof Error ? error.message : String(error)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isEn ? 'Is the sql.0 adapter running?' : 'Läuft der sql.0 Adapter?'}
                </div>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
              {isEn ? 'No datapoints in database.' : 'Keine Datenpunkte in der Datenbank.'}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th
                    className={`${thClass} w-8`}
                    title={isEn ? 'Consistency with the object configuration' : 'Konsistenz mit der Objekt-Konfiguration'}
                    onClick={() => handleSort('__status__')}
                  >
                    <AlertTriangle size={11} className="inline-block opacity-60" />
                    {sortKey === '__status__' && (
                      sortDir === 'asc'
                        ? <ChevronUp size={11} className="inline-block ml-0.5 opacity-60" />
                        : <ChevronDown size={11} className="inline-block ml-0.5 opacity-60" />
                    )}
                  </th>
                  {columns.map((col) => (
                    <th key={col} className={thClass} onClick={() => handleSort(col)}>
                      {COLUMN_LABELS[col] ?? col}
                      {sortKey === col && (
                        sortDir === 'asc'
                          ? <ChevronUp size={11} className="inline-block ml-0.5 opacity-60" />
                          : <ChevronDown size={11} className="inline-block ml-0.5 opacity-60" />
                      )}
                    </th>
                  ))}
                  <th
                    className="px-2 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200"
                    onClick={() => handleSort('__count__')}
                  >
                    {isEn ? 'Values' : 'Werte'}
                    {sortKey === '__count__' && (
                      sortDir === 'asc'
                        ? <ChevronUp size={11} className="inline-block ml-0.5 opacity-60" />
                        : <ChevronDown size={11} className="inline-block ml-0.5 opacity-60" />
                    )}
                  </th>
                  <th className="px-2 py-2 w-8" />
                </tr>
                {/* Per-column filters — replaces the single ID filter that used to sit in the header */}
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-1 pb-2">
                    <select
                      value={colFilters.__status__ ?? ''}
                      onChange={(e) => setColFilter('__status__', e.target.value)}
                      title={isEn ? 'Filter by status' : 'Nach Status filtern'}
                      className={filterInputClass}
                    >
                      <option value="">{isEn ? 'All' : 'Alle'}</option>
                      <option value="ok">OK</option>
                      <option value="logging-off">{isEn ? 'Logging off' : 'Logging aus'}</option>
                      <option value="orphan">{isEn ? 'Orphan' : 'Verwaist'}</option>
                      <option value="unknown">{isEn ? 'Unknown' : 'Unbekannt'}</option>
                    </select>
                  </th>
                  {columns.map((col) => (
                    <th key={col} className="px-1 pb-2">
                      {isTsColumn(col) ? (
                        <select
                          value={colFilters[col] ?? ''}
                          onChange={(e) => setColFilter(col, e.target.value)}
                          title={isEn ? 'Filter by age' : 'Nach Alter filtern'}
                          className={filterInputClass}
                        >
                          <option value="">{isEn ? 'Any date' : 'Beliebig'}</option>
                          {TS_FILTER_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {isEn ? o.en : o.de}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={colFilters[col] ?? ''}
                          onChange={(e) => setColFilter(col, e.target.value)}
                          placeholder={isEn ? 'Filter…' : 'Filter…'}
                          spellCheck={false}
                          className={filterInputClass}
                        />
                      )}
                    </th>
                  ))}
                  <th className="px-1 pb-2">
                    <input
                      value={colFilters.__count__ ?? ''}
                      onChange={(e) => setColFilter('__count__', e.target.value)}
                      placeholder={isEn ? 'Filter…' : 'Filter…'}
                      title={
                        isEn
                          ? 'Only matches rows whose values have been counted'
                          : 'Trifft nur Zeilen, deren Werte gezählt wurden'
                      }
                      spellCheck={false}
                      className={`${filterInputClass} text-right`}
                    />
                  </th>
                  <th className="px-2 pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const status = statusById.get(r.id) ?? 'unknown';
                  return (
                  <tr key={r.id || i} className={`border-b border-gray-100 dark:border-gray-800 group ${STATUS_ROW_CLASS[status]}`}>
                    <td
                      className={`${tdClass} text-center`}
                      title={
                        status === 'orphan'
                          ? (isEn
                              ? 'Stored in sql.0, but the object no longer exists'
                              : 'In sql.0 gespeichert, aber Objekt existiert nicht mehr')
                          : status === 'logging-off'
                          ? (isEn
                              ? 'Stored in sql.0, but logging is not enabled on the object'
                              : 'In sql.0 gespeichert, aber Logging am Objekt nicht aktiv')
                          : undefined
                      }
                    >
                      {status === 'orphan' ? (
                        <Unlink size={13} className="inline-block text-red-500" />
                      ) : status === 'logging-off' ? (
                        <AlertTriangle size={13} className="inline-block text-amber-500" />
                      ) : null}
                    </td>
                    {columns.map((col) => (
                      col === 'type' ? (
                        <td key={col} className={tdClass}>
                          <span className={`font-semibold ${getTypeColor(String(r[col] ?? ''))}`}>
                            {formatCell(col, r[col])}
                          </span>
                        </td>
                      ) : col === 'id' ? (
                        <td key={col} className={`${tdClass} font-mono`}>
                          <span className="inline-flex items-center gap-1">
                            <button
                              className="text-left hover:underline"
                              title={isEn ? 'Show stored values' : 'Gespeicherte Werte anzeigen'}
                              onClick={(e) => { e.stopPropagation(); setValuesOf({ id: r.id, type: r.type }); }}
                            >
                              <ColoredId id={r.id} />
                            </button>
                            <button
                              disabled={!r.id}
                              title={isEn ? 'Show stored values' : 'Gespeicherte Werte anzeigen'}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                              onClick={(e) => { e.stopPropagation(); setValuesOf({ id: r.id, type: r.type }); }}
                            >
                              <Search size={13} />
                            </button>
                            <button
                              disabled={!r.id}
                              title={isEn ? 'Show history chart' : 'History-Diagramm anzeigen'}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                              onClick={(e) => { e.stopPropagation(); setHistoryOf(r.id); }}
                            >
                              <LineChart size={13} />
                            </button>
                            <button
                              disabled={!r.id}
                              title={isEn ? `Copy id (${r.id})` : `ID kopieren (${r.id})`}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                              onClick={(e) => { e.stopPropagation(); copyId(r.id); }}
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              disabled={!r.id}
                              title={isEn ? `Rename id in DB (${r.id})` : `ID in DB umbenennen (${r.id})`}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                              onClick={(e) => { e.stopPropagation(); startRename(r.id); }}
                            >
                              <Pencil size={13} />
                            </button>
                          </span>
                        </td>
                      ) : (
                        <td key={col} className={`${tdClass} tabular-nums`}>
                          {formatCell(col, r[col], rawTs)}
                        </td>
                      )
                    ))}
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums whitespace-nowrap">
                      {counts[r.id] === 'loading' ? (
                        <Loader2 size={13} className="inline-block animate-spin text-gray-400" />
                      ) : typeof counts[r.id] === 'number' ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <button
                            title={isEn ? 'Recount stored values' : 'Gespeicherte Werte neu zählen'}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); loadCount(r.id, r.type); }}
                          >
                            <RefreshCw size={12} />
                          </button>
                          <span className="text-gray-700 dark:text-gray-300">{(counts[r.id] as number).toLocaleString()}</span>
                        </span>
                      ) : (
                        <button
                          disabled={!r.id}
                          title={isEn ? 'Count stored values' : 'Gespeicherte Werte zählen'}
                          className={`p-1 rounded transition-colors ${counts[r.id] === 'error' ? 'text-red-400 hover:text-red-500' : 'text-gray-400 hover:text-blue-500 dark:hover:text-blue-400'} hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-30`}
                          onClick={(e) => { e.stopPropagation(); loadCount(r.id, r.type); }}
                        >
                          <Hash size={13} />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button
                        disabled={!r.id || exportingId === r.id}
                        title={isEn ? `Export all DB values for ${r.id} as JSON` : `Alle DB-Werte für ${r.id} als JSON exportieren`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                        onClick={(e) => { e.stopPropagation(); void handleManualExport(r.id, r.type); }}
                      >
                        {exportingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      </button>
                      <button
                        disabled={!r.id}
                        title={isEn ? `Delete all DB values for ${r.id}` : `Alle DB-Werte für ${r.id} löschen`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity disabled:opacity-0"
                        onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: r.id, type: r.type }); }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Inline rename */}
        {renameOldId && (
          <div className="shrink-0 border-t border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-5 py-3 flex items-center gap-3">
            <Pencil size={15} className="text-blue-500 shrink-0" />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-xs text-blue-800 dark:text-blue-200 truncate">
                {isEn ? 'Rename DB name (history is preserved, object is untouched)' : 'DB-Name umbenennen (History bleibt, Objekt unberührt)'}
              </span>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !renameInvalid) handleRenameConfirm(); }}
                spellCheck={false}
                className="px-2 py-1 text-xs font-mono rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
              />
              {renameTrimmed && renameTrimmed !== renameOldId && idSet.has(renameTrimmed) && (
                <span className="text-xs text-red-500">
                  {isEn ? 'This id already exists in the database.' : 'Diese ID existiert bereits in der Datenbank.'}
                </span>
              )}
            </div>
            <button
              onClick={() => setRenameOldId(null)}
              disabled={renaming}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={handleRenameConfirm}
              disabled={renaming || renameInvalid}
              className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 flex items-center gap-1 shrink-0"
            >
              {renaming && <Loader2 size={12} className="animate-spin" />}
              {isEn ? 'Rename' : 'Umbenennen'}
            </button>
          </div>
        )}

        {exportCap && (
          <div className="shrink-0 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-200 flex-1">
              {isEn
                ? `${exportCap.total.toLocaleString()} rows exceed the export limit of ${exportCap.cap.toLocaleString()}. Only the newest ${exportCap.cap.toLocaleString()} can be written to the dump.`
                : `${exportCap.total.toLocaleString()} Zeilen überschreiten das Export-Limit von ${exportCap.cap.toLocaleString()}. Nur die neuesten ${exportCap.cap.toLocaleString()} landen im Dump.`}
            </span>
            <button
              onClick={() => setExportCap(null)}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={() => { const c = exportCap; setExportCap(null); void handleManualExport(c.id, c.type, true); }}
              className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isEn ? 'Export newest' : 'Neueste exportieren'}
            </button>
          </div>
        )}
        {capPrompt && (
          <div className="shrink-0 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-200 flex-1">
              {isEn
                ? `${capPrompt.total.toLocaleString()} rows exceed the export limit of ${capPrompt.cap.toLocaleString()}. Only the newest ${capPrompt.cap.toLocaleString()} can be backed up — the oldest rows would be lost from the dump.`
                : `${capPrompt.total.toLocaleString()} Zeilen überschreiten das Export-Limit von ${capPrompt.cap.toLocaleString()}. Nur die neuesten ${capPrompt.cap.toLocaleString()} können gesichert werden — die ältesten Zeilen fehlen dann im Dump.`}
            </span>
            <button
              onClick={() => { setCapPrompt(null); setPendingDelete(null); }}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={() => { setCapPrompt(null); void handleDeleteConfirm(true); }}
              className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isEn ? 'Back up newest and delete' : 'Neueste sichern und löschen'}
            </button>
          </div>
        )}
        {backup.progress && (
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-2 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            <Loader2 size={12} className="animate-spin" />
            <span>
              {backup.progress.phase === 'counting'
                ? (isEn ? 'Counting rows…' : 'Zeilen zählen…')
                : backup.progress.phase === 'fetching'
                  ? (isEn
                      ? `Backing up ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`
                      : `Sichere ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`)
                  : (isEn ? 'Writing file…' : 'Datei schreiben…')}
            </span>
            <button onClick={backup.abort} className="underline">
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
          </div>
        )}

        {/* Inline delete confirmation */}
        {pendingDelete && (
          <div className="shrink-0 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300 flex-1">
              {isEn
                ? `Delete ALL database values for "${pendingDelete.id}"? This removes the stored history and cannot be undone.`
                : `ALLE Datenbank-Werte für „${pendingDelete.id}" löschen? Entfernt die gespeicherte History unwiderruflich.`}
            </span>
            <button
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={() => void handleDeleteConfirm()}
              disabled={deleting}
              className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {isEn ? 'Delete' : 'Löschen'}
            </button>
          </div>
        )}
      </div>

      {orphansOpen && (
        <OrphanValuesModal language={language} onClose={() => setOrphansOpen(false)} />
      )}

      {restoreOpen && (
        <DbBackupModal language={language} onClose={() => setRestoreOpen(false)} />
      )}

      {valuesOf && (
        <DpValuesModal
          id={valuesOf.id}
          type={valuesOf.type}
          language={language}
          onClose={() => setValuesOf(null)}
        />
      )}

      {historyOf && (
        <HistoryModal
          stateId={historyOf}
          unit={allObjects?.[historyOf]?.common?.unit}
          objects={allObjects}
          language={language}
          zClass="z-[60]"
          onClose={() => setHistoryOf(null)}
        />
      )}
    </div>,
    document.body
  );
}

// Epoch-ms columns: `ts` plus anything camel-cased like `firstTs` / `lastTs`.
function isTsColumn(col: string): boolean {
  return col === 'ts' || col.endsWith('Ts');
}

const DAY = 86_400_000;

// Relative age buckets for the ts filter dropdown. `dir` decides which side of
// `now - ms` a row has to fall on; resolved against Date.now() at filter time.
const TS_FILTER_OPTIONS: { value: string; ms: number; dir: 'newer' | 'older'; en: string; de: string }[] = [
  { value: 'newer:1', ms: DAY, dir: 'newer', en: 'Last 24 hours', de: 'Letzte 24 Stunden' },
  { value: 'newer:7', ms: 7 * DAY, dir: 'newer', en: 'Last 7 days', de: 'Letzte 7 Tage' },
  { value: 'newer:30', ms: 30 * DAY, dir: 'newer', en: 'Last 30 days', de: 'Letzte 30 Tage' },
  { value: 'older:7', ms: 7 * DAY, dir: 'older', en: 'Older than 7 days', de: 'Älter als 7 Tage' },
  { value: 'older:30', ms: 30 * DAY, dir: 'older', en: 'Older than 30 days', de: 'Älter als 30 Tage' },
  { value: 'older:365', ms: 365 * DAY, dir: 'older', en: 'Older than 1 year', de: 'Älter als 1 Jahr' },
];

// A row matches when its timestamp is on the requested side of the cutoff.
// Missing / non-numeric timestamps never match a ts filter.
function matchesTsFilter(v: unknown, value: string, now: number): boolean {
  const opt = TS_FILTER_OPTIONS.find((o) => o.value === value);
  if (!opt) return true;
  const ts = Number(v);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const cutoff = now - opt.ms;
  return opt.dir === 'newer' ? ts >= cutoff : ts < cutoff;
}

const COLUMN_LABELS: Record<string, string> = {
  id: 'Name',
  dbId: 'ID',
  ts: 'TS',
  type: 'Type',
};

function formatBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = b;
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatCell(col: string, v: unknown, rawTs = false): string {
  if (v == null) return '—';
  // ts columns are epoch-ms timestamps → show as local date/time (unless raw)
  if (!rawTs && (col === 'ts' || col.endsWith('Ts')) && typeof v === 'number' && v > 1e12) {
    return new Date(v).toLocaleString();
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
