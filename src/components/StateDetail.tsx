import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useStateDetail, useObjectDetail, useExtendObject } from '../hooks/useStates';
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
    <div className="flex gap-4 py-1.5 border-b border-gray-800">
      <span className="text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
      <span className="text-gray-200 text-sm break-all">{value}</span>
    </div>
  );
}

function EditableRow({ label, value, onSave, isPending }: {
  label: string;
  value: string;
  onSave: (val: string) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="group/edit flex gap-4 py-1.5 border-b border-gray-800">
        <span className="text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
        <span className="text-gray-200 text-sm break-all flex-1">{value || '—'}</span>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="opacity-0 group-hover/edit:opacity-100 text-gray-500 hover:text-gray-300 shrink-0 transition-opacity"
          title="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-4 py-1 border-b border-gray-800">
      <span className="text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide pt-1">{label}</span>
      <div className="flex-1 flex gap-1.5 items-center">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          disabled={isPending}
          className="flex-1 bg-gray-700 text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          disabled={isPending}
          className="text-green-400 hover:text-green-300 disabled:opacity-50"
          title="Speichern"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
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

  const isLoading = stateLoading || objectLoading;

  function saveField(field: string, value: string) {
    extend.mutate({ id: stateId, common: { [field]: value } });
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300 truncate pr-4">{stateId}</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-sm">Laden...</div>
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
              />
              <EditableRow
                label="Einheit"
                value={object.common?.unit || ''}
                onSave={(v) => saveField('unit', v)}
                isPending={extend.isPending}
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
              <div className="mt-3 mb-1 text-xs text-gray-500 uppercase tracking-wide">
                Aktueller Zustand
              </div>
              <DetailRow
                label="Wert"
                value={
                  <span className="font-mono font-bold text-white text-base">
                    {formatValue(state.val)}
                    {object?.common?.unit && (
                      <span className="text-gray-400 ml-1 text-sm font-normal">
                        {object.common.unit}
                      </span>
                    )}
                  </span>
                }
              />
              <DetailRow
                label="Acknowledged"
                value={
                  <span className={state.ack ? 'text-green-400' : 'text-yellow-400'}>
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

          <div className="mt-4 pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">History</div>
            <HistoryChart stateId={stateId} unit={object?.common?.unit} />
          </div>
        </div>
      )}
    </div>
  );
}
