import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { useToasts } from '../context/ToastContext';

export default function ToastContainer() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-lg border text-sm max-w-sm animate-in slide-in-from-bottom-2 duration-200 ${
            t.type === 'success'
              ? 'bg-white dark:bg-gray-800 border-emerald-200 dark:border-emerald-700 text-gray-800 dark:text-gray-100'
              : 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-700 text-gray-800 dark:text-gray-100'
          }`}
        >
          {t.type === 'success'
            ? <CheckCircle size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
            : <AlertCircle size={16} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          }
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
