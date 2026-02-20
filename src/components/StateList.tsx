import { useState, useMemo } from 'react';
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { useExtendObject } from '../hooks/useStates';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';

interface StateListProps {
  ids: string[];
  states: Record<string, IoBrokerState>;
  objects: Record<string, IoBrokerObject>;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
  return JSON.stringify(val);
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

function EditableNameCell({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const extend = useExtendObject();

  if (!editing) {
    return (
      <td className="px-3 py-2 max-w-xs group/name">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(name);
              setEditing(true);
            }}
            className="opacity-0 group-hover/name:opacity-100 text-gray-500 hover:text-gray-300 shrink-0 transition-opacity"
            title="Name bearbeiten"
          >
            <Pencil size={12} />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td className="px-3 py-1 max-w-xs" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              extend.mutate({ id, common: { name: draft } });
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          disabled={extend.isPending}
          className="flex-1 min-w-0 bg-gray-700 text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => {
            extend.mutate({ id, common: { name: draft } });
            setEditing(false);
          }}
          disabled={extend.isPending}
          className="text-green-400 hover:text-green-300 shrink-0 disabled:opacity-50"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={extend.isPending}
          className="text-gray-500 hover:text-gray-300 shrink-0 disabled:opacity-50"
        >
          <X size={14} />
        </button>
      </div>
    </td>
  );
}

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(id).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => fallback());
    } else {
      fallback();
    }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = id;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover/id:opacity-100 text-gray-500 hover:text-gray-300 shrink-0 transition-opacity"
      title={id}
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

type SortKey = 'id' | 'name' | 'value' | 'unit' | 'ack' | 'ts';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, activeKey, dir, onSort, className }: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none hover:text-gray-200 ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </div>
    </th>
  );
}

export default function StateList({ ids, states, objects, selectedId, onSelect }: StateListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedIds = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...ids].sort((a, b) => {
      const stateA = states[a];
      const stateB = states[b];
      const objA = objects[a];
      const objB = objects[b];

      switch (sortKey) {
        case 'id':
          return mul * a.localeCompare(b);
        case 'name':
          return mul * getObjectName(objA).localeCompare(getObjectName(objB));
        case 'value': {
          const vA = stateA?.val;
          const vB = stateB?.val;
          if (vA == null && vB == null) return 0;
          if (vA == null) return mul;
          if (vB == null) return -mul;
          if (typeof vA === 'number' && typeof vB === 'number') return mul * (vA - vB);
          return mul * String(vA).localeCompare(String(vB));
        }
        case 'unit':
          return mul * (objA?.common?.unit || '').localeCompare(objB?.common?.unit || '');
        case 'ack': {
          const aA = stateA?.ack ? 1 : 0;
          const aB = stateB?.ack ? 1 : 0;
          return mul * (aA - aB);
        }
        case 'ts':
          return mul * ((stateA?.ts || 0) - (stateB?.ts || 0));
        default:
          return 0;
      }
    });
  }, [ids, states, objects, sortKey, sortDir]);

  if (ids.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-8 text-center">
        Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-auto h-full">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0 z-10">
          <tr>
            <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Wert" sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
            <SortHeader label="Einheit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Ack" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Letztes Update" sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedIds.map((id) => {
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
                <td className="px-3 py-2 font-mono text-xs text-gray-400 max-w-xs group/id">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{id}</span>
                    <CopyIdButton id={id} />
                  </div>
                </td>
                <EditableNameCell id={id} name={name} />
                <td className="px-3 py-2 text-right font-mono font-medium text-white">
                  {state ? (() => {
                    const v = formatValue(state.val);
                    const truncated = v.length > 20 ? v.slice(0, 20) + '…' : v;
                    return <span title={v}>{truncated}</span>;
                  })() : <span className="text-gray-600">...</span>}
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
