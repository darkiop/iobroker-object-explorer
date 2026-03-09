import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  language?: 'en' | 'de';
}

export default function ConfirmDialog({ title, message, description, confirmLabel, onConfirm, onCancel, language = 'en' }: Props) {
  const isEn = language === 'en';
  const effectiveConfirmLabel = confirmLabel ?? (isEn ? 'Delete' : 'Löschen');
  const effectiveDescription = description ?? (isEn ? 'The following datapoint will be deleted permanently:' : 'Folgender Datenpunkt wird unwiderruflich gelöscht:');
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onConfirm, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={16} />
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{effectiveDescription}</p>
          <p className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all whitespace-pre-line">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {isEn ? 'Cancel' : 'Abbrechen'}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            {effectiveConfirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
