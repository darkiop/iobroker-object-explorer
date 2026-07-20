import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Unlink, Loader2, AlertTriangle, Trash2, Copy, Search } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  getOrphanValueRows,
  deleteOrphanValueRows,
  buildOrphanValuesSql,
  buildOrphanDeleteSql,
} from '../../api/iobroker';
import type { OrphanValueGroup } from '../../api/iobroker';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../context/ToastContext';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
}

// Value rows in ts_number / ts_string / ts_bool whose numeric id no longer has a
// row in `datapoints` — they are unreachable through the adapter (which always
// joins via datapoints) and just take up space.
// The scan is a full LEFT JOIN over every value table, so it runs on demand only.
export default function OrphanValuesModal({ onClose, language }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';
  const showToast = useToast();

  const [rows, setRows] = useState<OrphanValueGroup[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pending, setPending] = useState<OrphanValueGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function scan() {
    setScanning(true);
    setScanError(null);
    setProgress(null);
    try {
      setRows(await getOrphanValueRows((done, total) => setProgress({ done, total })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanError(msg);
      setRows(null);
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  }

  function copySql() {
    copyToClipboard(buildOrphanValuesSql())
      .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
  }

  async function handleDeleteConfirm() {
    if (!pending) return;
    setDeleting(true);
    try {
      await deleteOrphanValueRows(pending.table, pending.dbId);
      showToast(
        isEn
          ? `Deleted ${pending.count.toLocaleString()} orphan rows (${pending.table} #${pending.dbId})`
          : `${pending.count.toLocaleString()} verwaiste Zeilen gelöscht (${pending.table} #${pending.dbId})`,
        'success'
      );
      setRows((r) => (r ?? []).filter((x) => !(x.table === pending.table && x.dbId === pending.dbId)));
      setPending(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  const totalRows = (rows ?? []).reduce((s, r) => s + r.count, 0);
  const thClass = 'px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap';
  const tdClass = 'px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Unlink size={15} className="text-red-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Orphan value rows' : 'Verwaiste Wert-Zeilen'}
            </h2>
            {rows && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({rows.length} {isEn ? 'groups' : 'Gruppen'} · {totalRows.toLocaleString()}{' '}
                {isEn ? 'rows' : 'Zeilen'})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copySql}
              title={isEn ? 'Copy the scan query' : 'Scan-Abfrage kopieren'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Copy size={12} />
              SQL
            </button>
            <button
              onClick={scan}
              disabled={scanning}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              {rows ? (isEn ? 'Rescan' : 'Neu scannen') : isEn ? 'Scan' : 'Scannen'}
            </button>
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
          {scanning ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              {isEn ? 'Scanning value tables…' : 'Scanne Wert-Tabellen…'}
              {progress && (
                <span className="tabular-nums text-xs text-gray-400 dark:text-gray-500">
                  {progress.done}/{progress.total}
                </span>
              )}
            </div>
          ) : scanError ? (
            <div className="flex items-start gap-2 px-5 py-16 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{isEn ? 'Scan failed' : 'Scan fehlgeschlagen'}</div>
                <div className="text-xs text-red-500/80 mt-1">{scanError}</div>
              </div>
            </div>
          ) : rows === null ? (
            <div className="px-6 py-14 text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
              <p>
                {isEn
                  ? 'Finds value rows whose datapoint id no longer exists in the datapoints table.'
                  : 'Findet Wert-Zeilen, deren Datenpunkt-ID nicht mehr in der Tabelle datapoints existiert.'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {isEn
                  ? 'Probes only the gaps in the datapoints id sequence, using the (id, ts) index — no full table scan.'
                  : 'Prüft nur die Lücken in der datapoints-ID-Folge über den (id, ts)-Index — kein vollständiger Tabellen-Scan.'}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
              {isEn ? 'No orphan value rows found.' : 'Keine verwaisten Wert-Zeilen gefunden.'}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={thClass}>{isEn ? 'Table' : 'Tabelle'}</th>
                  <th className={thClass}>{isEn ? 'DB id' : 'DB-ID'}</th>
                  <th className={`${thClass} text-right`}>{isEn ? 'Rows' : 'Zeilen'}</th>
                  <th className={thClass}>{isEn ? 'First' : 'Erster'}</th>
                  <th className={thClass}>{isEn ? 'Last' : 'Letzter'}</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.table}:${r.dbId}`}
                    className="border-b border-gray-100 dark:border-gray-800 group bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20"
                  >
                    <td className={`${tdClass} font-mono`}>{r.table}</td>
                    <td className={`${tdClass} font-mono tabular-nums`}>{r.dbId}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{r.count.toLocaleString()}</td>
                    <td className={`${tdClass} tabular-nums`}>{formatTs(r.firstTs)}</td>
                    <td className={`${tdClass} tabular-nums`}>{formatTs(r.lastTs)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button
                        title={
                          isEn
                            ? `Delete ${r.count} orphan rows from ${r.table}`
                            : `${r.count} verwaiste Zeilen aus ${r.table} löschen`
                        }
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPending(r);
                        }}
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

        {/* Inline delete confirmation */}
        {pending && (
          <div className="shrink-0 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-700 dark:text-red-300 flex-1">
                {isEn
                  ? `Delete ${pending.count.toLocaleString()} rows from ${pending.table} (id ${pending.dbId})? This cannot be undone.`
                  : `${pending.count.toLocaleString()} Zeilen aus ${pending.table} (ID ${pending.dbId}) löschen? Nicht rückgängig zu machen.`}
              </span>
            </div>
            <pre className="text-[11px] font-mono text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded border border-red-200 dark:border-red-800 px-2 py-1.5 overflow-x-auto">
              {buildOrphanDeleteSql(pending.table, pending.dbId)}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPending(null)}
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
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function formatTs(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}
