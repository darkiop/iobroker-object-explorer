import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import HistoryChart from './HistoryChart';

interface Props {
  stateId: string;
  unit?: string;
  onClose: () => void;
}

export default function HistoryModal({ stateId, unit, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col"
        style={{ width: '80vw', height: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate">{stateId}</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ml-3"
          >
            <X size={16} />
          </button>
        </div>

        {/* Chart */}
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          <HistoryChart stateId={stateId} unit={unit} />
        </div>
      </div>
    </div>,
    document.body
  );
}
