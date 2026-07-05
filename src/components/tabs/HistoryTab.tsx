import { Maximize2 } from 'lucide-react';
import HistoryChart from '../history/HistoryChart';
import type { IoBrokerObject } from '../../types/iobroker';

interface HistoryTabProps {
  id: string;
  obj: IoBrokerObject;
  language: 'en' | 'de';
  dateFormat: 'de' | 'us' | 'iso';
  onOpenHistory?: () => void;
  onClose: () => void;
}

export default function HistoryTab({ id, obj, language, dateFormat, onOpenHistory, onClose }: HistoryTabProps) {
  const isEn = language === 'en';
  return (
    <div className="px-4 py-3 overflow-y-auto flex-1 flex flex-col gap-1">
      <HistoryChart
        stateId={id}
        unit={obj.common?.unit}
        fillHeight
        language={language}
        dateFormat={dateFormat}
        statsAction={onOpenHistory ? (
          <button
            onClick={() => { onClose(); onOpenHistory(); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
            title={isEn ? 'Open in history modal' : 'Im History-Modal öffnen'}
          >
            <Maximize2 size={13} />
            {isEn ? 'Fullscreen' : 'Vollbild'}
          </button>
        ) : undefined}
      />
    </div>
  );
}
