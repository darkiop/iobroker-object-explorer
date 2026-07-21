import { useEffect, useState } from 'react';
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
import { useAppSettingsContext } from '../../context/UIContext';
import { useDbBackup } from '../../hooks/useDbBackup';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
}

// Value rows in ts_number / ts_string / ts_bool whose numeric id no longer has a
// row in `datapoints` — they are unreachable through the adapter (which always
// joins via datapoints) and just take up space.
export default function OrphanValuesModal({ onClose, language }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';
  const showToast = useToast();

  const [rows, setRows] = useState<OrphanValueGroup[] | null>(null);
  // Starts true: the scan kicks off on mount, so the empty state would only
  // flash for a frame before the spinner replaces it.
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pending, setPending] = useState<OrphanValueGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { appSettings } = useAppSettingsContext();
  const backup = useDbBackup();
  const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number } | null>(null);

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

  // The gap-probing scan is fast enough to run unprompted; the button in the
  // header is only there to re-run it.
  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copySql() {
    copyToClipboard(buildOrphanValuesSql())
      .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
  }

  // Backup first when enabled; a failed export aborts the delete, since a dump
  // written afterwards would be worthless.
  async function handleDeleteConfirm(acceptCap = false) {
    if (!pending) return;
    setDeleting(true);
    try {
      if (appSettings.dbBackupBeforeDelete) {
        const res = await backup.exportOrphan({
          table: pending.table,
          dbId: pending.dbId,
          count: pending.count,
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
      await deleteOrphanValueRows(pending.table, pending.dbId);
      showToast(
        isEn
          ? `Deleted ${pending.count.toLocaleString()} orphan rows (${pending.table} #${pending.dbId})`
          : `${pending.count.toLocaleString()} verwaiste Zeilen gelöscht (${pending.table} #${pending.dbId})`,
        'success'
      );
      setRows((r) => (r ?? []).filter((x) => !(x.table === pending.table && x.dbId === pending.dbId)));
      setPending(null);
      setCapPrompt(null);
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
              {isEn ? 'Rescan' : 'Neu scannen'}
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
          ) : rows === null || rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
              <p>{isEn ? 'No orphan value rows found.' : 'Keine verwaisten Wert-Zeilen gefunden.'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {isEn
                  ? 'Every value row still has its datapoint in the datapoints table.'
                  : 'Jede Wert-Zeile hat noch ihren Datenpunkt in der Tabelle datapoints.'}
              </p>
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
            {capPrompt && (
              <div className="flex items-start gap-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                  <span>
                    {isEn
                      ? `${capPrompt.total.toLocaleString()} rows exceed the export limit of ${capPrompt.cap.toLocaleString()}. Only the newest ${capPrompt.cap.toLocaleString()} can be backed up — the oldest rows would be lost from the dump.`
                      : `${capPrompt.total.toLocaleString()} Zeilen überschreiten das Export-Limit von ${capPrompt.cap.toLocaleString()}. Nur die neuesten ${capPrompt.cap.toLocaleString()} können gesichert werden — die ältesten Zeilen fehlen dann im Dump.`}
                  </span>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => { setCapPrompt(null); setPending(null); }}
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
                </div>
              </div>
            )}

            {backup.progress && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <Loader2 size={12} className="animate-spin" />
                <span>
                  {backup.progress.phase === 'fetching'
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

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPending(null)}
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
