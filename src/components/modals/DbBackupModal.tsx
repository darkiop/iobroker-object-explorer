import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, AlertTriangle, Loader2, X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDbBackup, type RestorePlan, type RestoreReport } from '../../hooks/useDbBackup';

interface Props {
  language: 'en' | 'de';
  onClose: () => void;
}

// Restores a JSON dump written by the backup-before-delete flow. Every series is
// classified against the live datapoints table first; only writable ones can be
// selected, and the write itself is INSERT IGNORE, so re-running is harmless.
export default function DbBackupModal({ language, onClose }: Props) {
  useEscapeKey(onClose);
  const isEn = language === 'en';
  const backup = useDbBackup();
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setReport(null);
    setPlan(null);
    try {
      const p = await backup.prepareRestore(await file.text());
      setPlan(p);
      // Preselect exactly what can be written; missing and blocked stay off.
      setSelected(new Set(p.series.filter((s) => s.status === 'ok').map((s) => s.index)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRun() {
    if (!plan) return;
    setRunning(true);
    try {
      setReport(await backup.runRestore(plan, [...selected]));
    } finally {
      setRunning(false);
    }
  }

  function toggle(index: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Restore database values' : 'DB-Werte wiederherstellen'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            className="text-xs text-gray-600 dark:text-gray-300"
          />

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {plan?.dump.truncated && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {isEn
                  ? 'This dump was truncated when it was created — it does not contain every row of the original range.'
                  : 'Dieser Dump wurde beim Erstellen abgeschnitten — er enthält nicht alle Zeilen des ursprünglichen Bereichs.'}
              </span>
            </div>
          )}

          {plan && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 dark:text-gray-400 text-left">
                <tr>
                  <th className="py-1 w-8"></th>
                  <th className="py-1">{isEn ? 'Series' : 'Serie'}</th>
                  <th className="py-1">{isEn ? 'Table' : 'Tabelle'}</th>
                  <th className="py-1 text-right">{isEn ? 'Rows' : 'Zeilen'}</th>
                  <th className="py-1 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.series.map((s) => (
                  <tr key={s.index} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1">
                      <input
                        type="checkbox"
                        checked={selected.has(s.index)}
                        disabled={s.status !== 'ok'}
                        onChange={() => toggle(s.index)}
                      />
                    </td>
                    <td className="py-1 font-mono text-gray-700 dark:text-gray-300">
                      {s.series.kind === 'named' ? s.series.id : `#${s.series.dbId}`}
                    </td>
                    <td className="py-1 text-gray-600 dark:text-gray-400">{s.series.table}</td>
                    <td className="py-1 text-right text-gray-600 dark:text-gray-400">{s.series.count.toLocaleString()}</td>
                    <td className="py-1 pl-3">
                      <span
                        className={
                          s.status === 'ok'
                            ? 'text-green-600 dark:text-green-400'
                            : s.status === 'missing'
                              ? 'text-gray-500'
                              : 'text-red-600 dark:text-red-400'
                        }
                        title={s.reason}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {backup.progress && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <Loader2 size={12} className="animate-spin" />
              <span>
                {backup.progress.done.toLocaleString()} / {backup.progress.total.toLocaleString()}
              </span>
              <button onClick={backup.abort} className="underline">
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
            </div>
          )}

          {report && (
            <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
              <div>
                {isEn
                  ? `${report.inserted.toLocaleString()} inserted, ${report.skipped.toLocaleString()} already present, ${report.missing} missing, ${report.blocked} blocked`
                  : `${report.inserted.toLocaleString()} eingefügt, ${report.skipped.toLocaleString()} bereits vorhanden, ${report.missing} fehlend, ${report.blocked} blockiert`}
              </div>
              {report.unresolvedSources > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  {isEn
                    ? `${report.unresolvedSources.toLocaleString()} row(s) had a source name that no longer exists — written with no source.`
                    : `${report.unresolvedSources.toLocaleString()} Zeile(n) hatten einen nicht mehr vorhandenen Quellnamen — ohne Quelle geschrieben.`}
                </div>
              )}
              {report.error && (
                <div className="text-red-600 dark:text-red-400">
                  {isEn
                    ? `Aborted after series ${report.lastCompleted}: ${report.error}. Re-running with the same file is safe — rows already written are skipped.`
                    : `Abgebrochen nach Serie ${report.lastCompleted}: ${report.error}. Ein erneuter Lauf mit derselben Datei ist gefahrlos — bereits geschriebene Zeilen werden übersprungen.`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {isEn ? 'Close' : 'Schließen'}
          </button>
          <button
            onClick={() => void handleRun()}
            disabled={!plan || selected.size === 0 || running}
            className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {running && <Loader2 size={12} className="animate-spin" />}
            {isEn ? 'Restore' : 'Wiederherstellen'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
