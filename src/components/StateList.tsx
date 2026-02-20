import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';

interface StateListProps {
  ids: string[];
  states: Record<string, IoBrokerState>;
  objects: Record<string, IoBrokerObject>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('de-DE');
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

export default function StateList({ ids, states, objects, selectedId, onSelect }: StateListProps) {
  if (ids.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-8 text-center">
        Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Wert</th>
            <th className="px-3 py-2">Einheit</th>
            <th className="px-3 py-2">Ack</th>
            <th className="px-3 py-2">Letztes Update</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const state = states[id];
            const obj = objects[id];
            const unit = obj?.common?.unit || '';
            const name = getObjectName(obj);

            return (
              <tr
                key={id}
                onClick={() => onSelect(id)}
                className={`border-b border-gray-800 cursor-pointer transition-colors ${
                  selectedId === id
                    ? 'bg-blue-600/20 text-blue-200'
                    : 'hover:bg-gray-800/50 text-gray-300'
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs text-gray-400 max-w-xs truncate">{id}</td>
                <td className="px-3 py-2 truncate max-w-xs">{name}</td>
                <td className="px-3 py-2 text-right font-mono font-medium text-white">
                  {state ? formatValue(state.val) : <span className="text-gray-600">...</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">{unit}</td>
                <td className="px-3 py-2">
                  {state ? (
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        state.ack ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      title={state.ack ? 'Acknowledged' : 'Not acknowledged'}
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">
                  {state ? formatTimestamp(state.ts) : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
