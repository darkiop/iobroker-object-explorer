import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

interface Props {
  ids: string[];
  onDeleteOne: (id: string) => void;
  onDeleteAll: (ids: string[]) => void;
  onClose: () => void;
  language?: 'en' | 'de';
}

export default function MultiDeleteDialog({ ids, onDeleteOne, onDeleteAll, onClose, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [remaining, setRemaining] = useState<string[]>([...ids]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleDeleteOne(id: string) {
    onDeleteOne(id);
    const next = remaining.filter((x) => x !== id);
    setRemaining(next);
    if (next.length === 0) onClose();
  }

  function handleDeleteAll() {
    onDeleteAll(remaining);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={16} />
            <span className="font-semibold text-sm">
              {isEn
                ? `Delete ${remaining.length} datapoint${remaining.length !== 1 ? 's' : ''}`
                : `${remaining.length} Datenpunkt${remaining.length !== 1 ? 'e' : ''} löschen`}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={15} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1">
          {remaining.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 group"
            >
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate flex-1" title={id}>
                {id}
              </span>
              <button
                onClick={() => handleDeleteOne(id)}
                title={isEn ? 'Delete this datapoint' : 'Diesen Datenpunkt löschen'}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} />
                {isEn ? 'Delete' : 'Löschen'}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {isEn ? 'Permanent - delete individually or all at once' : 'Unwiderruflich - einzeln oder alle auf einmal löschen'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              onClick={handleDeleteAll}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              {isEn ? `Delete all (${remaining.length})` : `Alle löschen (${remaining.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
