import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import HistoryChart from './HistoryChart';
import type { ExtraSeries } from './HistoryChart';
import type { IoBrokerObject } from '../types/iobroker';
import { hasHistory } from '../api/iobroker';

interface Props {
  stateId: string;
  unit?: string;
  onClose: () => void;
  objects?: Record<string, IoBrokerObject>;
  language?: 'en' | 'de';
  dateFormat?: 'de' | 'us' | 'iso';
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

export default function HistoryModal({ stateId, unit, onClose, objects, language = 'en', dateFormat = 'de' }: Props) {
  const isEn = language === 'en';
  const [extraSeries, setExtraSeries] = useState<ExtraSeries[]>([]);
  const [addInput, setAddInput] = useState('');
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const historyIds = useMemo(() => {
    if (!objects) return [];
    return Object.keys(objects)
      .filter(id => id !== stateId && !extraSeries.some(s => s.id === id) && hasHistory(objects[id]))
      .sort();
  }, [objects, stateId, extraSeries]);

  const suggestions = useMemo(() => {
    const q = addInput.trim().toLowerCase();
    if (!q) return [];
    return historyIds.filter(id => id.toLowerCase().includes(q)).slice(0, 10);
  }, [historyIds, addInput]);

  useEffect(() => setSuggestionIdx(-1), [suggestions]);

  function selectSuggestion(id: string) {
    const obj = objects?.[id];
    const name = getObjectName(obj) || id.split('.').slice(-2).join('.');
    const u = obj?.common?.unit;
    setExtraSeries(prev => [...prev, { id, label: name, unit: u }]);
    setAddInput('');
    setSuggestionIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function addSeries() {
    const id = addInput.trim();
    if (!id || extraSeries.length >= 4 || extraSeries.some(s => s.id === id) || id === stateId) return;
    selectSuggestion(id);
  }

  function removeSeries(id: string) {
    setExtraSeries(prev => prev.filter(s => s.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (suggestionIdx >= 0 && suggestions[suggestionIdx]) {
        selectSuggestion(suggestions[suggestionIdx]);
      } else {
        addSeries();
      }
    }
  }

  const showSuggestions = inputFocused && suggestions.length > 0;

  // Preview: name of the typed ID (if found in objects and no suggestions shown)
  const previewName = !showSuggestions && addInput.trim() && objects?.[addInput.trim()]
    ? getObjectName(objects[addInput.trim()]) || null
    : null;

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
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
          {/* Primary ID + extra series chips */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            <span className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate max-w-xs" title={stateId}>
              {stateId}
            </span>
            {extraSeries.map((s, i) => (
              <span
                key={s.id}
                className="flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium border"
                style={{
                  borderColor: ['#10b981','#f59e0b','#ef4444','#8b5cf6'][i],
                  color: ['#10b981','#f59e0b','#ef4444','#8b5cf6'][i],
                  backgroundColor: ['#10b98115','#f59e0b15','#ef444415','#8b5cf615'][i],
                }}
                title={s.id}
              >
                <span className="truncate max-w-[100px]">{s.label}</span>
                <button
                  onClick={() => removeSeries(s.id)}
                  className="ml-0.5 hover:opacity-70 shrink-0"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>

          {/* Add series input */}
          {extraSeries.length < 4 && (
            <div className="relative flex items-center gap-1 shrink-0">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setTimeout(() => setInputFocused(false), 100)}
                  placeholder={isEn ? 'Add datapoint ID…' : 'Datenpunkt-ID hinzufügen…'}
                  className="text-xs rounded px-2 py-1 w-52 border bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 placeholder-gray-400 dark:placeholder-gray-500"
                />
                {previewName && (
                  <span className="absolute left-2 -bottom-4 text-[10px] text-green-600 dark:text-green-400 whitespace-nowrap">
                    {previewName}
                  </span>
                )}
                {showSuggestions && (
                  <ul className="absolute top-full left-0 mt-1 w-72 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((id, i) => (
                      <li
                        key={id}
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(id); }}
                        className={`px-2 py-1 text-xs font-mono cursor-pointer truncate ${
                          i === suggestionIdx
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        title={id}
                      >
                        {id}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={addSeries}
                disabled={!addInput.trim()}
                className="p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                title={isEn ? 'Add' : 'Hinzufügen'}
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Chart */}
        <div className="px-5 py-4 flex-1 min-h-0 flex flex-col">
          <HistoryChart
            stateId={stateId}
            unit={unit}
            fillHeight
            extraSeries={extraSeries.length > 0 ? extraSeries : undefined}
            language={language}
            dateFormat={dateFormat}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
