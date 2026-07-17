import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X, Database, ChevronUp, ChevronDown, Loader2, AlertTriangle, Trash2, Pencil, Hash } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDpOverview, useDbStats } from '../../hooks/useObjectQueries';
import { queryKeys } from '../../hooks/queryKeys';
import { deleteHistoryAll, renameDpInDb, getDpValueCount } from '../../api/iobroker';
import { useToast } from '../../context/ToastContext';
import { getTypeColor } from '../../utils/typeColor';
import type { DpOverviewRow } from '../../api/iobroker';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
}

// POC: read-only view of datapoints stored in the sql.0 database (via getDpOverview sendTo).
// Columns are derived dynamically from the returned rows, since the adapter's response
// shape is not guaranteed across versions. `id` is always shown first.
export default function DbOverviewModal({ onClose, language }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';

  const { data, isLoading, isError, error } = useDpOverview(true);
  const { data: stats } = useDbStats(true);
  const queryClient = useQueryClient();
  const showToast = useToast();
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<string>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameOldId, setRenameOldId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const idSet = useMemo(() => new Set((data ?? []).map((r) => r.id)), [data]);
  // Per-datapoint value counts, loaded on demand (full-table counts are too slow).
  const [counts, setCounts] = useState<Record<string, number | 'loading' | 'error'>>({});

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

  async function handleDeleteConfirm() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteHistoryAll(pendingDelete);
      showToast(
        isEn ? `Deleted DB values for ${pendingDelete}` : `DB-Werte für ${pendingDelete} gelöscht`,
        'success'
      );
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.history.dpOverview });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  const rows = useMemo<DpOverviewRow[]>(() => data ?? [], [data]);

  // Union of all keys across rows; `id` first, rest alphabetical.
  const columns = useMemo<string[]>(() => {
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
    keys.delete('id');
    return ['id', ...Array.from(keys).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.id.toLowerCase().includes(q));
  }, [rows, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortKey, sortDir, counts]);

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={pendingDelete || renameOldId ? undefined : onClose}
    >
      <div
        className="w-full max-w-7xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Database size={15} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Database Overview (sql.0)' : 'Datenbank-Übersicht (sql.0)'}
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({filtered.length}{filter ? ` / ${rows.length}` : ''} {isEn ? 'datapoints' : 'Datenpunkte'})
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
            <button
              onClick={() => countAllVisible(sorted)}
              disabled={countingAll || sorted.length === 0}
              title={isEn ? 'Count values for all shown datapoints (may take a while)' : 'Werte aller angezeigten Datenpunkte zählen (kann dauern)'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {countingAll ? <Loader2 size={12} className="animate-spin" /> : <Hash size={12} />}
              {isEn ? 'Count and Sort desc' : 'Zählen & absteigend sortieren'}
            </button>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={isEn ? 'Filter by ID…' : 'Nach ID filtern…'}
              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 w-48"
            />
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
          </div>
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
                  {columns.map((col) => (
                    <th key={col} className={thClass} onClick={() => handleSort(col)}>
                      {col}
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
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                    {columns.map((col) => (
                      col === 'type' ? (
                        <td key={col} className={tdClass}>
                          <span className={`font-semibold ${getTypeColor(String(r[col] ?? ''))}`}>
                            {formatCell(col, r[col])}
                          </span>
                        </td>
                      ) : (
                        <td key={col} className={`${tdClass}${col === 'id' ? ' font-mono' : ' tabular-nums'}`}>
                          {formatCell(col, r[col])}
                        </td>
                      )
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {counts[r.id] === 'loading' ? (
                        <Loader2 size={13} className="inline-block animate-spin text-gray-400" />
                      ) : typeof counts[r.id] === 'number' ? (
                        <span className="text-gray-700 dark:text-gray-300">{(counts[r.id] as number).toLocaleString()}</span>
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
                        disabled={!r.id}
                        title={isEn ? `Rename id in DB (${r.id})` : `ID in DB umbenennen (${r.id})`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-opacity disabled:opacity-0"
                        onClick={(e) => { e.stopPropagation(); startRename(r.id); }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        disabled={!r.id}
                        title={isEn ? `Delete all DB values for ${r.id}` : `Alle DB-Werte für ${r.id} löschen`}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity disabled:opacity-0"
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(r.id); }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
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

        {/* Inline delete confirmation */}
        {pendingDelete && (
          <div className="shrink-0 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300 flex-1">
              {isEn
                ? `Delete ALL database values for "${pendingDelete}"? This removes the stored history and cannot be undone.`
                : `ALLE Datenbank-Werte für „${pendingDelete}" löschen? Entfernt die gespeicherte History unwiderruflich.`}
            </span>
            <button
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {isEn ? 'Delete' : 'Löschen'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

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

function formatCell(col: string, v: unknown): string {
  if (v == null) return '—';
  // ts columns are epoch-ms timestamps → show as local date/time
  if ((col === 'ts' || col.endsWith('Ts')) && typeof v === 'number' && v > 1e12) {
    return new Date(v).toLocaleString();
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
