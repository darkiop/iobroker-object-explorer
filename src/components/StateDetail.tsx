import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useStateDetail, useObjectDetail, useExtendObject, useAllRoles, useAllUnits } from '../hooks/useStates';
import { hasHistory } from '../api/iobroker';
import HistoryChart from './HistoryChart';

interface StateDetailProps {
  stateId: string;
  onClose: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'string') return val;
  return JSON.stringify(val, null, 2);
}

function getObjectName(common: { name: string | Record<string, string> } | undefined): string {
  if (!common?.name) return '';
  if (typeof common.name === 'string') return common.name;
  return common.name.de || common.name.en || Object.values(common.name)[0] || '';
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 text-sm break-all">{value}</span>
    </div>
  );
}

function EditableRow({ label, value, onSave, isPending, suggestions }: {
  label: string;
  value: string;
  onSave: (val: string) => void;
  isPending: boolean;
  suggestions?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions && draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()))
    : (suggestions ?? []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function commit(val: string) {
    onSave(val);
    setEditing(false);
    setShowSuggestions(false);
  }

  if (!editing) {
    return (
      <div className="group/edit flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800">
        <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
        <span className="text-gray-800 dark:text-gray-200 text-sm break-all flex-1">{value || '—'}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); setShowSuggestions(!!suggestions); setActiveIndex(-1); }}
          className="opacity-0 group-hover/edit:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
          title="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide pt-1">{label}</span>
      <div className="flex-1 flex gap-1.5 items-start">
        <div className="relative flex-1" ref={wrapperRef}>
          <input
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setShowSuggestions(true); setActiveIndex(-1); }}
            onFocus={() => suggestions && setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
              } else if (e.key === 'Enter') {
                if (activeIndex >= 0 && filtered[activeIndex]) {
                  commit(filtered[activeIndex]);
                } else {
                  commit(draft);
                }
              } else if (e.key === 'Escape') {
                if (showSuggestions) { setShowSuggestions(false); }
                else { setEditing(false); }
              }
            }}
            autoFocus
            disabled={isPending}
            className="w-full bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
          />
          {showSuggestions && filtered.length > 0 && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-0.5 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg dark:bg-gray-800 dark:border-gray-600">
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`px-2 py-1 text-sm cursor-pointer ${i === activeIndex ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => commit(draft)}
          disabled={isPending}
          className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50 mt-0.5"
          title="Speichern"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-50 mt-0.5"
          title="Abbrechen"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function StateDetail({ stateId, onClose }: StateDetailProps) {
  const { data: state, isLoading: stateLoading } = useStateDetail(stateId);
  const { data: object, isLoading: objectLoading } = useObjectDetail(stateId);
  const extend = useExtendObject();
  const { data: roles } = useAllRoles();
  const { data: units } = useAllUnits();

  const isLoading = stateLoading || objectLoading;

  function saveField(field: string, value: string) {
    extend.mutate({ id: stateId, common: { [field]: value } });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-800/80 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-4">{stateId}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">Laden...</div>
      ) : (
        <div className="space-y-0">
          {object && (
            <>
              <EditableRow
                label="Name"
                value={getObjectName(object.common)}
                onSave={(v) => saveField('name', v)}
                isPending={extend.isPending}
              />
              <DetailRow label="Typ" value={object.common?.type || '—'} />
              <EditableRow
                label="Rolle"
                value={object.common?.role || ''}
                onSave={(v) => saveField('role', v)}
                isPending={extend.isPending}
                suggestions={roles}
              />
              <EditableRow
                label="Einheit"
                value={object.common?.unit || ''}
                onSave={(v) => saveField('unit', v)}
                isPending={extend.isPending}
                suggestions={units}
              />
              <EditableRow
                label="Beschreibung"
                value={
                  typeof object.common?.desc === 'string'
                    ? object.common.desc
                    : object.common?.desc
                      ? JSON.stringify(object.common.desc)
                      : ''
                }
                onSave={(v) => saveField('desc', v)}
                isPending={extend.isPending}
              />
              <DetailRow
                label="Lesen/Schreiben"
                value={`${object.common?.read ? 'R' : '-'}${object.common?.write ? 'W' : '-'}`}
              />
              {object.common?.min !== undefined && (
                <DetailRow label="Min/Max" value={`${object.common.min} / ${object.common.max}`} />
              )}
            </>
          )}

          {state && (
            <>
              <DetailRow
                label="Wert"
                value={
                  <span className="font-mono font-bold text-gray-900 dark:text-white text-base">
                    {formatValue(state.val)}
                    {object?.common?.unit && (
                      <span className="text-gray-500 dark:text-gray-400 ml-1 text-sm font-normal">
                        {object.common.unit}
                      </span>
                    )}
                  </span>
                }
              />
              <DetailRow
                label="Acknowledged"
                value={
                  <span className={state.ack ? 'text-green-500 dark:text-green-400' : 'text-yellow-500 dark:text-yellow-400'}>
                    {state.ack ? 'Ja' : 'Nein'}
                  </span>
                }
              />
              <DetailRow label="Qualität" value={state.q} />
              <DetailRow label="Zeitstempel" value={formatTimestamp(state.ts)} />
              <DetailRow label="Letzte Änderung" value={formatTimestamp(state.lc)} />
              <DetailRow label="Von" value={state.from || '—'} />
              {state.c && <DetailRow label="Kommentar" value={state.c} />}
            </>
          )}

          {object && hasHistory(object) && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">History</div>
              <HistoryChart stateId={stateId} unit={object?.common?.unit} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
