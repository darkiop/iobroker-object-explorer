import { createPortal } from 'react-dom';
import { X, Table2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Pencil, Check, Trash2, Copy, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDpValues } from '../../hooks/useObjectQueries';
import { updateDpValue, deleteHistoryEntry, deleteHistoryRange, getDpValueCount, tsTableForType, buildDpValuesSql } from '../../api/iobroker';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../context/ToastContext';
import { ColoredId } from '../../utils/coloredId';
import StyledCheckbox from '../ui/StyledCheckbox';

const PAGE_SIZE = 20;

interface Props {
  id: string;
  type: unknown;
  language: 'en' | 'de';
  onClose: () => void;
}

// Paginated view of the raw stored value rows of a single datapoint (from ts_*).
export default function DpValuesModal({ id, type, language, onClose }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';
  const [page, setPage] = useState(0);
  const [fromStr, setFromStr] = useState('');
  const [toStr, setToStr] = useState('');
  const [rawTs, setRawTs] = useState(false);
  const showToast = useToast();

  const startTs = fromStr ? new Date(fromStr).getTime() : null;
  const endTs = toStr ? new Date(toStr).getTime() : null;

  const { data, isLoading, isFetching, isError, error, refetch } = useDpValues(id, type, page, PAGE_SIZE, startTs, endTs);
  const rows = data ?? [];
  const hasNext = rows.length === PAGE_SIZE;

  const [editTs, setEditTs] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [delTs, setDelTs] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeCount, setPurgeCount] = useState<number | null>(null);
  const [countingPurge, setCountingPurge] = useState(false);
  // Cutoff of the purge, resolved when the confirm opens so count and delete
  // use the exact same timestamp.
  const [purgeCutoff, setPurgeCutoff] = useState<number | null>(null);

  // Opens the confirm and previews how many rows the purge would delete.
  async function startPurge() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const cutoff = d.getTime();
    setPurgeCutoff(cutoff);
    setPurgeCount(null);
    setConfirmPurge(true);
    setCountingPurge(true);
    try {
      setPurgeCount(await getDpValueCount(id, type, null, cutoff));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setCountingPurge(false);
    }
  }

  // Delete all stored values older than 3 months for this datapoint.
  async function purgeOld() {
    if (purgeCutoff == null) return;
    setPurging(true);
    try {
      await deleteHistoryRange(id, 1, purgeCutoff);
      // The sql adapter answers {success:true} unconditionally — even when it
      // discarded the request — so verify by re-counting instead of trusting it.
      const remaining = await getDpValueCount(id, type, null, purgeCutoff);
      if (remaining > 0) {
        showToast(
          isEn
            ? `${remaining.toLocaleString()} value(s) older than 3 months could not be deleted`
            : `${remaining.toLocaleString()} Wert(e) älter als 3 Monate konnten nicht gelöscht werden`,
          'error',
        );
      } else {
        showToast(isEn ? 'Values older than 3 months deleted' : 'Werte älter als 3 Monate gelöscht', 'success');
      }
      setConfirmPurge(false);
      setPage(0);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setPurging(false);
    }
  }

  function copySql() {
    const sql = buildDpValuesSql(id, type, PAGE_SIZE, page * PAGE_SIZE, startTs, endTs);
    copyToClipboard(sql)
      .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
  }

  async function confirmDelete(ts: number) {
    setDeleting(true);
    try {
      await deleteHistoryEntry(id, ts);
      showToast(isEn ? 'Value deleted' : 'Wert gelöscht', 'success');
      setDelTs(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(ts: number, val: unknown) {
    setEditTs(ts);
    setEditVal(val == null ? '' : String(val));
  }

  async function saveEdit() {
    if (editTs == null) return;
    setSaving(true);
    try {
      await updateDpValue(id, type, editTs, editVal);
      showToast(isEn ? 'Value updated' : 'Wert aktualisiert', 'success');
      setEditTs(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  const thClass = 'px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap';
  const tdClass = 'px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Table2 size={15} className="text-blue-500 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 shrink-0">
              {isEn ? 'Stored values' : 'Gespeicherte Werte'}
            </h2>
            <ColoredId id={id} className="text-xs font-mono truncate" />
            <span
              className="shrink-0 px-1.5 py-0.5 rounded bg-gray-500/10 text-xs font-mono text-gray-600 dark:text-gray-300"
              title={isEn ? 'Source table' : 'Quell-Tabelle'}
            >
              {tsTableForType(type)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {confirmPurge ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-xs text-red-600 dark:text-red-400 mr-1 flex items-center gap-1">
                  {countingPurge ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      {isEn ? 'Counting…' : 'Zähle…'}
                    </>
                  ) : purgeCount == null ? (
                    isEn ? 'Delete values > 3 months?' : 'Werte > 3 Monate löschen?'
                  ) : purgeCount === 0 ? (
                    isEn ? 'No values older than 3 months' : 'Keine Werte älter als 3 Monate'
                  ) : isEn ? (
                    `Delete ${purgeCount.toLocaleString()} value${purgeCount === 1 ? '' : 's'} older than 3 months?`
                  ) : (
                    `${purgeCount.toLocaleString()} ${purgeCount === 1 ? 'Wert' : 'Werte'} älter als 3 Monate löschen?`
                  )}
                </span>
                <button
                  onClick={purgeOld}
                  disabled={purging || countingPurge || purgeCount === 0}
                  title={isEn ? 'Confirm delete' : 'Löschen bestätigen'}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                >
                  {purging ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {isEn ? 'Confirm' : 'Bestätigen'}
                </button>
                <button
                  onClick={() => setConfirmPurge(false)}
                  disabled={purging}
                  title={isEn ? 'Cancel' : 'Abbrechen'}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              </span>
            ) : (
              <button
                onClick={startPurge}
                title={isEn ? 'Delete all values older than 3 months' : 'Alle Werte älter als 3 Monate löschen'}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-700"
              >
                <CalendarClock size={12} />
                {isEn ? '> 3M' : '> 3M'}
              </button>
            )}
            <button
              onClick={copySql}
              title={isEn ? 'Copy underlying SQL query' : 'Zugrundeliegende SQL-Abfrage kopieren'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Copy size={12} />
              SQL
            </button>
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

        {/* Timestamp filter */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">{isEn ? 'Timestamp' : 'Zeitstempel'}:</span>
          <input
            type="datetime-local"
            value={fromStr}
            onChange={(e) => { setFromStr(e.target.value); setPage(0); }}
            title={isEn ? 'From' : 'Von'}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="datetime-local"
            value={toStr}
            onChange={(e) => { setToStr(e.target.value); setPage(0); }}
            title={isEn ? 'To' : 'Bis'}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:light] dark:[color-scheme:dark]"
          />
          {(fromStr || toStr) && (
            <button
              onClick={() => { setFromStr(''); setToStr(''); setPage(0); }}
              className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {isEn ? 'Clear' : 'Zurücksetzen'}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none ml-auto" title={isEn ? 'Show timestamp as raw epoch (ms)' : 'Zeitstempel als Roh-Epoch (ms) anzeigen'}>
            <StyledCheckbox checked={rawTs} onChange={(e) => setRawTs(e.target.checked)} />
            {isEn ? 'Raw ts' : 'Roh-ts'}
          </label>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              {isEn ? 'Loading…' : 'Lade…'}
            </div>
          ) : isError ? (
            <div className="flex items-start gap-2 px-5 py-16 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error instanceof Error ? error.message : String(error)}</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
              {isEn ? 'No values on this page.' : 'Keine Werte auf dieser Seite.'}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={thClass}>{isEn ? 'Timestamp' : 'Zeitstempel'}</th>
                  <th className={`${thClass} text-right`}>{isEn ? 'Value' : 'Wert'}</th>
                  <th className={`${thClass} text-center`}>Ack</th>
                  <th className={`${thClass} text-center`}>Q</th>
                  <th className={thClass}>{isEn ? 'Source' : 'Quelle'}</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.ts}-${i}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                    <td className={`${tdClass} tabular-nums`}>{rawTs ? r.ts : new Date(r.ts).toLocaleString()}</td>
                    <td className={`${tdClass} text-right tabular-nums font-medium`}>
                      {editTs === r.ts ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            autoFocus
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !saving) saveEdit();
                              if (e.key === 'Escape') setEditTs(null);
                            }}
                            className="w-28 px-1.5 py-0.5 text-xs text-right rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            title={isEn ? 'Save' : 'Speichern'}
                            className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40"
                          >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            onClick={() => setEditTs(null)}
                            disabled={saving}
                            title={isEn ? 'Cancel' : 'Abbrechen'}
                            className="p-0.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="group inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                          title={isEn ? 'Edit value' : 'Wert bearbeiten'}
                          onClick={() => startEdit(r.ts, r.val)}
                        >
                          {formatVal(r.val)}
                          <Pencil size={11} className="opacity-0 group-hover:opacity-60" />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${r.ack ? 'bg-emerald-500' : 'bg-amber-400'}`} title={r.ack ? 'ack' : 'not ack'} />
                    </td>
                    <td className={`${tdClass} text-center ${r.q ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>{r.q}</td>
                    <td className={`${tdClass} font-mono text-gray-500 dark:text-gray-400`}>{r.src ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {delTs === r.ts ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => confirmDelete(r.ts)}
                            disabled={deleting}
                            title={isEn ? 'Confirm delete' : 'Löschen bestätigen'}
                            className="p-0.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                          >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            onClick={() => setDelTs(null)}
                            disabled={deleting}
                            title={isEn ? 'Cancel' : 'Abbrechen'}
                            className="p-0.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => { setEditTs(null); setDelTs(r.ts); }}
                          title={isEn ? 'Delete this value' : 'Diesen Wert löschen'}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            {isEn ? 'Page' : 'Seite'} {page + 1}
            {isFetching && <Loader2 size={12} className="animate-spin" />}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              {isEn ? 'Prev' : 'Zurück'}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || isFetching}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              {isEn ? 'Next' : 'Weiter'}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
