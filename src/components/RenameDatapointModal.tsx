import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, PenLine, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useRenameDatapoint } from '../hooks/useStates';
import type { IoBrokerObject, IoBrokerState } from '../types/iobroker';
import { isValidIoBrokerId } from '../utils/validation';

interface Props {
  sourceId: string;
  sourceObj: IoBrokerObject | undefined;
  sourceState: IoBrokerState | undefined;
  existingIds: Set<string>;
  onClose: () => void;
  onRenamed: (newId: string) => void;
  language?: 'en' | 'de';
}

export default function RenameDatapointModal({ sourceId, sourceObj, sourceState, existingIds, onClose, onRenamed, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [newId, setNewId] = useState(sourceId);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameDatapoint();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Select the last segment so user can quickly retype it
    const lastDot = sourceId.lastIndexOf('.');
    input.setSelectionRange(lastDot + 1, sourceId.length);
  }, [sourceId]);

  useEscapeKey(onClose);

  function validate(): string {
    const id = newId.trim();
    if (!id) return isEn ? 'ID is required.' : 'ID ist erforderlich.';
    if (!isValidIoBrokerId(id)) return isEn ? 'Invalid ID format. Use only letters, digits, underscores, hyphens and dots.' : 'Ungültiges ID-Format. Nur Buchstaben, Ziffern, Unterstriche, Bindestriche und Punkte erlaubt.';
    if (id === sourceId) return isEn ? 'New ID must differ from current ID.' : 'Neue ID muss sich von der aktuellen unterscheiden.';
    if (existingIds.has(id)) return isEn ? `"${id}" already exists.` : `„${id}" existiert bereits.`;
    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    if (!sourceObj) return;

    rename.mutate(
      {
        oldId: sourceId,
        newId: newId.trim(),
        obj: sourceObj,
        currentVal: sourceState ? { val: sourceState.val, ack: sourceState.ack } : undefined,
      },
      {
        onSuccess: () => { onRenamed(newId.trim()); onClose(); },
        onError: (err) => setError(String(err)),
      }
    );
  }

  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 font-mono';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PenLine size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Rename datapoint' : 'Datenpunkt umbenennen'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {/* Source info */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
              {isEn ? 'Current ID' : 'Aktuelle ID'}
            </div>
            <div className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={sourceId}>{sourceId}</div>
          </div>

          {/* New ID */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>
              {isEn ? 'New ID' : 'Neue ID'} <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newId}
              onChange={(e) => { setNewId(e.target.value); setError(''); }}
              className={inputCls}
              spellCheck={false}
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              {isEn
                ? 'The old ID will be deleted after renaming. References in aliases or scripts are not updated automatically.'
                : 'Die alte ID wird nach dem Umbenennen gelöscht. Verweise in Alias-Objekten oder Skripten werden nicht automatisch aktualisiert.'}
            </span>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              type="submit"
              disabled={rename.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              <PenLine size={13} />
              {rename.isPending ? (isEn ? 'Renaming...' : 'Umbenenne...') : (isEn ? 'Rename' : 'Umbenennen')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
