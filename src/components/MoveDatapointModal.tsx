import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderInput, AlertTriangle } from 'lucide-react';
import { useRenameDatapoint } from '../hooks/useStates';
import type { IoBrokerObject, IoBrokerState } from '../types/iobroker';
import { isValidIoBrokerId, isValidIdSegment } from '../utils/validation';

interface Props {
  sourceId: string;
  sourceObj: IoBrokerObject | undefined;
  sourceState: IoBrokerState | undefined;
  existingIds: Set<string>;
  onClose: () => void;
  onMoved: (newId: string) => void;
  language?: 'en' | 'de';
}

export default function MoveDatapointModal({ sourceId, sourceObj, sourceState, existingIds, onClose, onMoved, language = 'en' }: Props) {
  const isEn = language === 'en';
  const lastDot = sourceId.lastIndexOf('.');
  const initialPath = lastDot >= 0 ? sourceId.slice(0, lastDot) : '';
  const initialName = lastDot >= 0 ? sourceId.slice(lastDot + 1) : sourceId;

  const [newPath, setNewPath] = useState(initialPath);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useRenameDatapoint();

  const newId = newPath.trim() ? `${newPath.trim()}.${name.trim()}` : name.trim();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function validate(): string {
    if (!name.trim()) return isEn ? 'Name is required.' : 'Name ist erforderlich.';
    if (!isValidIdSegment(name)) return isEn ? 'Invalid name. Use only letters, digits, underscores and hyphens (no dots).' : 'Ungültiger Name. Nur Buchstaben, Ziffern, Unterstriche und Bindestriche erlaubt (keine Punkte).';
    if (!newPath.trim()) return isEn ? 'Path is required.' : 'Pfad ist erforderlich.';
    if (!isValidIoBrokerId(newPath)) return isEn ? 'Invalid path format. Use only letters, digits, underscores, hyphens and dots.' : 'Ungültiges Pfad-Format. Nur Buchstaben, Ziffern, Unterstriche, Bindestriche und Punkte erlaubt.';
    if (newId === sourceId) return isEn ? 'New ID must differ from current ID.' : 'Neue ID muss sich von der aktuellen unterscheiden.';
    if (existingIds.has(newId)) return isEn ? `"${newId}" already exists.` : `„${newId}" existiert bereits.`;
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
        newId,
        obj: sourceObj,
        currentVal: sourceState ? { val: sourceState.val, ack: sourceState.ack } : undefined,
      },
      {
        onSuccess: () => { onMoved(newId); onClose(); },
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
            <FolderInput size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Move datapoint' : 'Datenpunkt verschieben'}
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
          {/* Source */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
              {isEn ? 'Current ID' : 'Aktuelle ID'}
            </div>
            <div className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={sourceId}>{sourceId}</div>
          </div>

          {/* New path */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>
              {isEn ? 'New path (namespace)' : 'Neuer Pfad (Namespace)'} <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newPath}
              onChange={(e) => { setNewPath(e.target.value); setError(''); }}
              className={inputCls}
              placeholder={isEn ? 'e.g. hm-rpc.0.living_room' : 'z.B. hm-rpc.0.wohnzimmer'}
              spellCheck={false}
            />
          </div>

          {/* Name (last segment) */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>
              {isEn ? 'Name (last segment)' : 'Name (letztes Segment)'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              className={inputCls}
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
              {isEn ? 'Result' : 'Ergebnis'}
            </div>
            <div className={`font-mono text-xs truncate ${newId === sourceId ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`} title={newId}>
              {newId || '—'}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              {isEn
                ? 'The old ID will be deleted after moving. References in aliases or scripts are not updated automatically.'
                : 'Die alte ID wird nach dem Verschieben gelöscht. Verweise in Alias-Objekten oder Skripten werden nicht automatisch aktualisiert.'}
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
              <FolderInput size={13} />
              {rename.isPending ? (isEn ? 'Moving...' : 'Verschiebe...') : (isEn ? 'Move' : 'Verschieben')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
