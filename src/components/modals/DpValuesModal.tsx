import { createPortal } from 'react-dom';
import { X, Table2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Pencil, Check, Trash2, Copy, Rows3, RefreshCw, Plus, LineChart, Download } from 'lucide-react';
import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDpValues, useDpValueSpan, useDpNumericId } from '../../hooks/useObjectQueries';
import { updateDpValue, insertDpValue, deleteHistoryEntry, deleteHistoryRange, getDpValueCount, tsTableForType, buildDpValuesSql, buildDpPurgeSql, buildDpInsertSql, buildDpDedupeSql, findConsecutiveDuplicateTs, findConsecutiveDuplicateRows, deleteDpValuesByTs } from '../../api/iobroker';
import type { DumpRow } from '../../api/dbBackup';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from '../../context/ToastContext';
import { useAppSettingsContext } from '../../context/UIContext';
import { useDbBackup } from '../../hooks/useDbBackup';
import { ColoredId } from '../../utils/coloredId';
import StyledCheckbox from '../ui/StyledCheckbox';
import HistoryModal from './HistoryModal';

const PAGE_SIZE = 20;

interface Props {
  id: string;
  type: unknown;
  language: 'en' | 'de';
  onClose: () => void;
}

// Paginated view of the raw stored value rows of a single datapoint (from ts_*).
export default function DpValuesModal({ id, type, language, onClose }: Props) {
  const isEn = language === 'en';
  const [page, setPage] = useState(0);
  const [fromStr, setFromStr] = useState('');
  const [toStr, setToStr] = useState('');
  const [rawTs, setRawTs] = useState(false);
  const showToast = useToast();
  const { appSettings } = useAppSettingsContext();
  const backup = useDbBackup();
  const [capPrompt, setCapPrompt] = useState<{ total: number; cap: number; action: 'purge' } | null>(null);
  const [dedupeRows, setDedupeRows] = useState<DumpRow[] | null>(null);
  // Manual export is independent of the delete guard and carries its own cap
  // decision; capPrompt belongs to the purge flow.
  const [exportCap, setExportCap] = useState<{ total: number; cap: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const startTs = fromStr ? new Date(fromStr).getTime() : null;
  const endTs = toStr ? new Date(toStr).getTime() : null;

  const { data, isLoading, isFetching, isError, error, refetch } = useDpValues(id, type, page, PAGE_SIZE, startTs, endTs);
  const rows = data ?? [];
  const hasNext = rows.length === PAGE_SIZE;
  const { data: dpNumericId } = useDpNumericId(id);
  const { data: span, isFetching: spanFetching, refetch: refetchSpan } = useDpValueSpan(id, type, startTs, endTs);

  const [historyOpen, setHistoryOpen] = useState(false);
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
  const [confirmDedupe, setConfirmDedupe] = useState(false);
  const [scanningDedupe, setScanningDedupe] = useState(false);
  const [dedupeTs, setDedupeTs] = useState<number[] | null>(null);
  const [deduping, setDeduping] = useState(false);
  // When set, the dedupe ignores the timestamp filter and scans the whole datapoint.
  const [dedupeWholeDp, setDedupeWholeDp] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTs, setAddTs] = useState(Date.now());
  const [addVal, setAddVal] = useState('');
  const [addAck, setAddAck] = useState(true);
  const [adding, setAdding] = useState(false);

  const hasTsFilter = startTs != null || endTs != null;
  const addTsValid = Number.isFinite(addTs) && addTs > 0;
  // Numbers must be entered explicitly; '' would silently become 0.
  const addValValid = String(type) === 'string' || String(type) === 'boolean' || addVal.trim() !== '';

  // Escape closes an open confirm first, the modal only when none is open.
  useEscapeKey(() => {
    if (confirmPurge) {
      if (!purging) setConfirmPurge(false);
    } else if (confirmDedupe) {
      if (!deduping && !scanningDedupe) setConfirmDedupe(false);
    } else if (addOpen) {
      if (!adding) setAddOpen(false);
    } else {
      onClose();
    }
  });

  // Every mutation changes the header summary too, so both queries reload together.
  async function reload() {
    await Promise.all([refetch(), refetchSpan()]);
  }

  // Opens the "add row" dialog, prefilled with the current time.
  function startAdd() {
    setAddTs(Date.now());
    setAddVal('');
    setAddAck(true);
    setAddOpen(true);
  }

  // Inserts a new value row for this datapoint.
  async function addRow() {
    if (!addTsValid || !addValValid) return;
    setAdding(true);
    try {
      await insertDpValue(id, type, addTs, addVal, addAck);
      showToast(isEn ? 'Value added' : 'Wert hinzugefügt', 'success');
      setAddOpen(false);
      setPage(0);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAdding(false);
    }
  }

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
  async function purgeOld(acceptCap = false) {
    if (purgeCutoff == null) return;
    setPurging(true);
    try {
      if (appSettings.dbBackupBeforeDelete) {
        const res = await backup.exportNamed({
          id, type, trigger: 'purge', startTs: null, endTs: purgeCutoff, acceptCap,
        });
        if (!res.ok) {
          if ('needsCapDecision' in res) {
            setCapPrompt({ total: res.total, cap: res.cap, action: 'purge' });
            return;
          }
          showToast(
            isEn ? `Backup failed, nothing deleted: ${res.error}` : `Backup fehlgeschlagen, nichts gelöscht: ${res.error}`,
            'error',
          );
          return;
        }
      }
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
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setPurging(false);
    }
  }

  // Downloads a dump of this datapoint without deleting anything. Honours the
  // active timestamp filter, so a narrowed view exports exactly what it shows.
  async function handleManualExport(acceptCap = false) {
    setExporting(true);
    try {
      const res = await backup.exportNamed({
        id, type, trigger: 'manual', startTs, endTs, acceptCap,
      });
      if (!res.ok) {
        if ('needsCapDecision' in res) {
          setExportCap({ total: res.total, cap: res.cap });
          return;
        }
        showToast(isEn ? `Export failed: ${res.error}` : `Export fehlgeschlagen: ${res.error}`, 'error');
        return;
      }
      setExportCap(null);
      showToast(
        isEn
          ? `Exported ${res.rows.toLocaleString()} value(s)`
          : `${res.rows.toLocaleString()} Wert(e) exportiert`,
        'success',
      );
    } finally {
      setExporting(false);
    }
  }

  // Opens the confirm and previews which rows the dedupe would delete.
  async function scanDedupe(wholeDp: boolean) {
    setDedupeTs(null);
    setDedupeRows(null);
    setConfirmDedupe(true);
    setScanningDedupe(true);
    try {
      // The scan reads ack/q/source too, so the dedupe backup needs no second
      // pass over the table.
      const scanned = await findConsecutiveDuplicateRows(id, type, wholeDp ? null : startTs, wholeDp ? null : endTs);
      setDedupeRows(scanned);
      setDedupeTs(scanned.map((r) => r[0]));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      setDedupeTs([]);
      setDedupeRows([]);
    } finally {
      setScanningDedupe(false);
    }
  }

  // Delete every row that merely repeats the previous value; the first row of
  // each run is kept, so the step curve stays identical.
  async function runDedupe() {
    if (dedupeTs == null || dedupeTs.length === 0) return;
    setDeduping(true);
    try {
      if (appSettings.dbBackupBeforeDelete && dedupeRows && dedupeRows.length > 0) {
        // No cap prompt here: the rows are already in memory from the scan, so
        // there is nothing left to fetch and nothing to truncate.
        const res = await backup.exportRows({ id, type, trigger: 'dedupe', rows: dedupeRows });
        if (!res.ok) {
          showToast(
            isEn
              ? `Backup failed, nothing deleted: ${'error' in res ? res.error : ''}`
              : `Backup fehlgeschlagen, nichts gelöscht: ${'error' in res ? res.error : ''}`,
            'error',
          );
          return;
        }
      }
      await deleteDpValuesByTs(id, type, dedupeTs);
      // Verify by re-scanning instead of trusting the delete response.
      const remaining = await findConsecutiveDuplicateTs(id, type, dedupeWholeDp ? null : startTs, dedupeWholeDp ? null : endTs);
      const deleted = dedupeTs.length - remaining.length;
      if (remaining.length > 0) {
        showToast(
          isEn
            ? `${remaining.length.toLocaleString()} duplicate value(s) could not be deleted`
            : `${remaining.length.toLocaleString()} doppelte Wert(e) konnten nicht gelöscht werden`,
          'error',
        );
      } else {
        showToast(
          isEn
            ? `${deleted.toLocaleString()} duplicate value(s) deleted`
            : `${deleted.toLocaleString()} doppelte Wert(e) gelöscht`,
          'success',
        );
      }
      setConfirmDedupe(false);
      setDedupeTs(null);
      setDedupeRows(null);
      setPage(0);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeduping(false);
    }
  }

  function copyId() {
    copyToClipboard(id)
      .then(() => showToast(isEn ? 'ID copied' : 'ID kopiert', 'success'))
      .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
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
      await reload();
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
      await reload();
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
      onClick={historyOpen ? undefined : onClose}
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
            <button
              onClick={copyId}
              title={isEn ? 'Copy ID' : 'ID kopieren'}
              className="shrink-0 p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Copy size={12} />
            </button>
            <span
              className="shrink-0 px-1.5 py-0.5 rounded bg-gray-500/10 text-xs font-mono text-gray-600 dark:text-gray-300"
              title={isEn ? 'Source table' : 'Quell-Tabelle'}
            >
              {tsTableForType(type)}
            </span>
            {dpNumericId != null && (
              <span
                className="shrink-0 px-1.5 py-0.5 rounded bg-blue-500/10 text-xs font-mono text-blue-600 dark:text-blue-400"
                title={isEn ? 'Database id (datapoints.id)' : 'Datenbank-ID (datapoints.id)'}
              >
                id={dpNumericId}
              </span>
            )}
            {spanFetching && !span ? (
              <Loader2 size={12} className="shrink-0 animate-spin text-gray-400" />
            ) : span ? (
              <>
                <span
                  className="shrink-0 px-1.5 py-0.5 rounded bg-blue-500/10 text-xs tabular-nums text-blue-600 dark:text-blue-300"
                  title={
                    hasTsFilter
                      ? (isEn ? 'Stored value rows in the selected range' : 'Gespeicherte Wert-Zeilen im gewählten Bereich')
                      : (isEn ? 'Stored value rows' : 'Gespeicherte Wert-Zeilen')
                  }
                >
                  {span.count.toLocaleString()} {isEn ? 'rows' : 'Zeilen'}
                  {hasTsFilter && <span className="opacity-60"> ({isEn ? 'filtered' : 'gefiltert'})</span>}
                </span>
                {span.firstTs != null && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 text-xs tabular-nums text-emerald-600 dark:text-emerald-300"
                    title={isEn ? 'Oldest stored value' : 'Ältester gespeicherter Wert'}
                  >
                    {isEn ? 'since' : 'seit'} {rawTs ? span.firstTs : new Date(span.firstTs).toLocaleString()}
                  </span>
                )}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => reload()}
              disabled={isFetching}
              title={isEn ? 'Refresh rows' : 'Zeilen aktualisieren'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : undefined} />
              {isEn ? 'Refresh' : 'Aktualisieren'}
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              title={isEn ? 'Show history chart' : 'History-Diagramm anzeigen'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <LineChart size={12} />
              {isEn ? 'Chart' : 'Diagramm'}
            </button>
            <button
              onClick={startAdd}
              title={isEn ? 'Add a new value row' : 'Neue Wert-Zeile hinzufügen'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Plus size={12} />
              {isEn ? 'New row' : 'Neue Zeile'}
            </button>
            <button
              onClick={() => void handleManualExport()}
              disabled={exporting}
              title={
                hasTsFilter
                  ? (isEn ? 'Export the values in the selected range as JSON' : 'Werte im gewählten Zeitraum als JSON exportieren')
                  : (isEn ? 'Export all stored values as JSON' : 'Alle gespeicherten Werte als JSON exportieren')
              }
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {isEn ? 'Export' : 'Export'}
            </button>
            <button
              onClick={startPurge}
              title={isEn ? 'Delete all values older than 3 months' : 'Alle Werte älter als 3 Monate löschen'}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-700"
            >
              <Trash2 size={12} />
              {isEn ? '> 3M' : '> 3M'}
            </button>
            <button
              onClick={() => { setDedupeWholeDp(false); scanDedupe(false); }}
              title={
                isEn
                  ? 'Delete consecutive duplicate values (keeps the first of each run)'
                  : 'Aufeinanderfolgende gleiche Werte löschen (der erste einer Serie bleibt)'
              }
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-700"
            >
              <Rows3 size={12} />
              {isEn ? 'Dedupe' : 'Dedupe'}
            </button>
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

        {/* Manual export: cap decision and progress */}
        {exportCap && (
          <div className="shrink-0 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-2.5 flex items-center gap-3">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
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
              onClick={() => { setExportCap(null); void handleManualExport(true); }}
              className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isEn ? 'Export newest' : 'Neueste exportieren'}
            </button>
          </div>
        )}
        {exporting && backup.progress && (
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-5 py-2 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            <Loader2 size={12} className="animate-spin" />
            <span>
              {backup.progress.phase === 'counting'
                ? (isEn ? 'Counting rows…' : 'Zeilen zählen…')
                : backup.progress.phase === 'fetching'
                  ? (isEn
                      ? `Exporting ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`
                      : `Exportiere ${backup.progress.done.toLocaleString()} / ${backup.progress.total.toLocaleString()}`)
                  : (isEn ? 'Writing file…' : 'Datei schreiben…')}
            </span>
            <button onClick={backup.abort} className="underline">
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
          </div>
        )}

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
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-52" />
                <col className="w-40" />
                <col className="w-14" />
                <col className="w-12" />
                <col />
                <col className="w-16" />
              </colgroup>
              <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={thClass}>{isEn ? 'Timestamp' : 'Zeitstempel'}</th>
                  <th className={`${thClass} text-right`}>{isEn ? 'Value' : 'Wert'}</th>
                  <th className={`${thClass} text-center`}>Ack</th>
                  <th className={`${thClass} text-center`}>Q</th>
                  <th className={thClass}>{isEn ? 'Source' : 'Quelle'}</th>
                  <th className="px-2 py-2" />
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
                    <td className={`${tdClass} font-mono text-gray-500 dark:text-gray-400 truncate`} title={r.src ?? undefined}>{r.src ?? '—'}</td>
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

      {/* Purge confirm — sits above the modal */}
      {confirmPurge && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!purging) setConfirmPurge(false);
          }}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-red-300 dark:border-red-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <AlertTriangle size={15} className="text-red-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {isEn ? 'Delete values older than 3 months' : 'Werte älter als 3 Monate löschen'}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ColoredId id={id} className="font-mono" />
              </div>

              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                {countingPurge ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    {isEn ? 'Counting…' : 'Zähle…'}
                  </>
                ) : purgeCount == null ? (
                  isEn ? 'Delete values older than 3 months?' : 'Werte älter als 3 Monate löschen?'
                ) : purgeCount === 0 ? (
                  isEn ? 'No values older than 3 months' : 'Keine Werte älter als 3 Monate'
                ) : isEn ? (
                  `Delete ${purgeCount.toLocaleString()} value${purgeCount === 1 ? '' : 's'} older than 3 months? This cannot be undone.`
                ) : (
                  `${purgeCount.toLocaleString()} ${purgeCount === 1 ? 'Wert' : 'Werte'} älter als 3 Monate löschen? Das kann nicht rückgängig gemacht werden.`
                )}
              </p>

              {purgeCutoff != null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {isEn ? 'SQL to be executed' : 'Auszuführendes SQL'}
                    </span>
                    <button
                      onClick={() => {
                        copyToClipboard(buildDpPurgeSql(id, type, purgeCutoff))
                          .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
                          .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Copy size={12} />
                      SQL
                    </button>
                  </div>
                  <pre className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre">
                    {buildDpPurgeSql(id, type, purgeCutoff)}
                  </pre>
                </div>
              )}
              {capPrompt && (
                <div className="flex items-start gap-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                    <span>
                      {isEn
                        ? `${capPrompt.total.toLocaleString()} rows exceed the export limit of ${capPrompt.cap.toLocaleString()}. Only the newest ${capPrompt.cap.toLocaleString()} can be backed up — the oldest rows would be lost from the dump.`
                        : `${capPrompt.total.toLocaleString()} Zeilen überschreiten das Export-Limit von ${capPrompt.cap.toLocaleString()}. Nur die neuesten ${capPrompt.cap.toLocaleString()} können gesichert werden — die ältesten Zeilen fehlen dann im Dump.`}
                    </span>
                    {capPrompt.action === 'purge' && (
                      <span className="block mt-1">
                        {isEn
                          ? 'For a 3-month purge these are the rows immediately before the cutoff — the oldest values are the ones that drop out of the dump.'
                          : 'Beim 3-Monats-Purge sind das die Zeilen direkt vor dem Cutoff — gerade die ältesten Werte fallen aus dem Dump.'}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => setCapPrompt(null)}
                        className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {isEn ? 'Cancel' : 'Abbrechen'}
                      </button>
                      <button
                        onClick={() => { setCapPrompt(null); void purgeOld(true); }}
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
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setConfirmPurge(false)}
                disabled={purging}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={() => void purgeOld()}
                disabled={purging || countingPurge || purgeCount === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
              >
                {purging ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {isEn ? 'Delete' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add row dialog — sits above the modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!adding) setAddOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <Plus size={15} className="text-blue-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {isEn ? 'Add value row' : 'Wert-Zeile hinzufügen'}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ColoredId id={id} className="font-mono" />
                <span className="px-1.5 py-0.5 rounded bg-gray-500/10 font-mono text-gray-600 dark:text-gray-300">
                  {tsTableForType(type)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0">
                  {isEn ? 'Timestamp' : 'Zeitstempel'}
                </span>
                <input
                  type="datetime-local"
                  step="1"
                  value={addTsValid ? toLocalInput(addTs) : ''}
                  onChange={(e) => {
                    const ms = new Date(e.target.value).getTime();
                    if (!Number.isNaN(ms)) setAddTs(ms);
                  }}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:light] dark:[color-scheme:dark]"
                />
                <input
                  type="number"
                  value={Number.isFinite(addTs) ? addTs : ''}
                  onChange={(e) => setAddTs(Number(e.target.value))}
                  title={isEn ? 'Raw epoch (ms)' : 'Roh-Epoch (ms)'}
                  className="w-40 px-2 py-1 text-xs font-mono tabular-nums rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => setAddTs(Date.now())}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {isEn ? 'Now' : 'Jetzt'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0">
                  {isEn ? 'Value' : 'Wert'}
                </span>
                {String(type) === 'boolean' ? (
                  <select
                    value={addVal === 'true' ? 'true' : 'false'}
                    onChange={(e) => setAddVal(e.target.value)}
                    className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    autoFocus
                    type={String(type) === 'string' ? 'text' : 'number'}
                    value={addVal}
                    onChange={(e) => setAddVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !adding) addRow(); }}
                    className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                  <StyledCheckbox checked={addAck} onChange={(e) => setAddAck(e.target.checked)} />
                  Ack
                </label>
              </div>

              {addTsValid && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {isEn ? 'SQL to be executed' : 'Auszuführendes SQL'}
                    </span>
                    <button
                      onClick={() => {
                        copyToClipboard(safeInsertSql(id, type, addTs, addVal, addAck))
                          .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
                          .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Copy size={12} />
                      SQL
                    </button>
                  </div>
                  <pre className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre">
                    {safeInsertSql(id, type, addTs, addVal, addAck)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setAddOpen(false)}
                disabled={adding}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={addRow}
                disabled={adding || !addTsValid || !addValValid}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40"
              >
                {adding ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {isEn ? 'Add' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedupe confirm — sits above the modal */}
      {confirmDedupe && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!deduping && !scanningDedupe) setConfirmDedupe(false);
          }}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-red-300 dark:border-red-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <AlertTriangle size={15} className="text-red-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {isEn ? 'Delete consecutive duplicate values' : 'Aufeinanderfolgende gleiche Werte löschen'}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ColoredId id={id} className="font-mono" />
              </div>

              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                {scanningDedupe ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    {isEn ? 'Scanning…' : 'Scanne…'}
                  </>
                ) : dedupeTs == null ? (
                  isEn ? 'Delete consecutive duplicate values?' : 'Aufeinanderfolgende gleiche Werte löschen?'
                ) : dedupeTs.length === 0 ? (
                  isEn ? 'No consecutive duplicate values found' : 'Keine aufeinanderfolgenden gleichen Werte gefunden'
                ) : isEn ? (
                  `Delete ${dedupeTs.length.toLocaleString()} duplicate value${dedupeTs.length === 1 ? '' : 's'}? This cannot be undone.`
                ) : (
                  `${dedupeTs.length.toLocaleString()} doppelte ${dedupeTs.length === 1 ? 'Wert' : 'Werte'} löschen? Das kann nicht rückgängig gemacht werden.`
                )}
              </p>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isEn
                  ? 'The first (oldest) value of each run is kept, so the history curve stays identical.'
                  : 'Der erste (älteste) Wert jeder Serie bleibt erhalten — der Verlauf bleibt dadurch identisch.'}
              </p>

              {hasTsFilter && (
                <label
                  className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none"
                  title={
                    isEn
                      ? 'Ignore the timestamp filter and scan all stored values of this datapoint'
                      : 'Zeitfilter ignorieren und alle gespeicherten Werte dieses Datenpunkts scannen'
                  }
                >
                  <StyledCheckbox
                    checked={dedupeWholeDp}
                    onChange={(e) => {
                      if (scanningDedupe || deduping) return;
                      setDedupeWholeDp(e.target.checked);
                      scanDedupe(e.target.checked);
                    }}
                  />
                  {isEn ? 'Whole datapoint (ignore timestamp filter)' : 'Ganzer Datenpunkt (Zeitfilter ignorieren)'}
                </label>
              )}

              {hasTsFilter && !dedupeWholeDp && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isEn
                    ? 'Only the filtered range is scanned — its first row is always kept, even if it repeats the value before the range.'
                    : 'Es wird nur der gefilterte Bereich gescannt — dessen erste Zeile bleibt immer erhalten, auch wenn sie den Wert davor wiederholt.'}
                </p>
              )}

              {dedupeTs != null && dedupeTs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {isEn ? 'SQL to be executed' : 'Auszuführendes SQL'}
                    </span>
                    <button
                      onClick={() => {
                        // Copy the full statement — the preview truncates the ts list.
                        copyToClipboard(buildDpDedupeSql(id, type, dedupeTs, Infinity))
                          .then(() => showToast(isEn ? 'SQL copied' : 'SQL kopiert', 'success'))
                          .catch(() => showToast(isEn ? 'Copy failed' : 'Kopieren fehlgeschlagen', 'error'));
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Copy size={12} />
                      SQL
                    </button>
                  </div>
                  <pre className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre">
                    {buildDpDedupeSql(id, type, dedupeTs)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setConfirmDedupe(false)}
                disabled={deduping}
                className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={runDedupe}
                disabled={deduping || scanningDedupe || dedupeTs == null || dedupeTs.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
              >
                {deduping ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {isEn ? 'Delete' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <HistoryModal
          stateId={id}
          language={language}
          zClass="z-[70]"
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>,
    document.body
  );
}

// Epoch ms → the "YYYY-MM-DDTHH:mm:ss" string a datetime-local input expects (local time).
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 19);
}

// buildDpInsertSql throws on an unparsable number — show that instead of crashing.
function safeInsertSql(id: string, type: unknown, ts: number, val: string, ack: boolean): string {
  try {
    return buildDpInsertSql(id, type, ts, val, ack);
  } catch (err) {
    return `-- ${err instanceof Error ? err.message : String(err)}`;
  }
}

function formatVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
