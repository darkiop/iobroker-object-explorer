import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertTriangle } from 'lucide-react';
import { usePutObject } from '../hooks/useStates';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  id: string;
  obj: IoBrokerObject;
  onClose: () => void;
}

export default function ObjectEditModal({ id, obj, onClose }: Props) {
  const [draft, setDraft] = useState(() => JSON.stringify(obj, null, 2));
  const [error, setError] = useState<string | null>(null);
  const putObject = usePutObject();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSave() {
    let parsed: IoBrokerObject;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setError('Ungültiges JSON: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setError(null);
    putObject.mutate({ id, obj: parsed }, { onSuccess: onClose });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl flex flex-col h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            Objekt bearbeiten:{' '}
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{id}</span>
          </span>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={15} />
          </button>
        </div>

        {/* Editor */}
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          className="flex-1 min-h-0 p-4 font-mono text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none focus:outline-none border-0"
          spellCheck={false}
        />

        {/* Error */}
        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-500 border-t border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20 shrink-0">
            <AlertTriangle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={putObject.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            Speichern
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
