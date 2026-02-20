import { useStateDetail, useObjectDetail } from '../hooks/useStates';
import HistoryChart from './HistoryChart';

interface StateDetailProps {
  stateId: string;
  onClose: () => void;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('de-DE');
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

export default function StateDetail({ stateId, onClose }: StateDetailProps) {
  const { data: state, isLoading: stateLoading } = useStateDetail(stateId);
  const { data: object, isLoading: objectLoading } = useObjectDetail(stateId);

  const isLoading = stateLoading || objectLoading;

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
              <DetailRow label="Name" value={getObjectName(object.common)} />
              <DetailRow label="Typ" value={object.common?.type || '—'} />
              <DetailRow label="Rolle" value={object.common?.role || '—'} />
              {object.common?.unit && <DetailRow label="Einheit" value={object.common.unit} />}
              {object.common?.desc && (
                <DetailRow
                  label="Beschreibung"
                  value={
                    typeof object.common.desc === 'string'
                      ? object.common.desc
                      : JSON.stringify(object.common.desc)
                  }
                />
              )}
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
