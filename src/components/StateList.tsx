import { useState, useMemo, useRef, useEffect } from 'react';
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown, SlidersHorizontal, History, Mic2 } from 'lucide-react';
import { useExtendObject } from '../hooks/useStates';
import { hasHistory } from '../api/iobroker';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';

interface StateListProps {
  ids: string[];
  totalCount: number;
  states: Record<string, IoBrokerState>;
  objects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;
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
            className="opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
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
          className="flex-1 min-w-0 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
        />
        <button
          onClick={() => {
            extend.mutate({ id, common: { name: draft } });
            setEditing(false);
          }}
          disabled={extend.isPending}
          className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 shrink-0 disabled:opacity-50"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={extend.isPending}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 disabled:opacity-50"
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
      className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
      title={id}
    >
      {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

type SortKey = 'id' | 'name' | 'room' | 'role' | 'value' | 'unit' | 'ack' | 'ts' | 'history' | 'smart';

const ALL_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'id',      label: 'ID' },
  { key: 'name',    label: 'Name' },
  { key: 'room',    label: 'Raum' },
  { key: 'role',    label: 'Rolle' },
  { key: 'value',   label: 'Wert' },
  { key: 'unit',    label: 'Einheit' },
  { key: 'ack',     label: 'Ack' },
  { key: 'ts',      label: 'Letztes Update' },
  { key: 'history', label: 'History' },
  { key: 'smart',   label: 'SmartName' },
];

const DEFAULT_COLS: SortKey[] = ['id', 'name', 'room', 'role', 'value', 'unit', 'ack', 'ts', 'history', 'smart'];
const LS_KEY = 'iobroker-visible-cols';

function loadVisibleCols(): SortKey[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SortKey[];
      const valid = parsed.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
      if (valid.length > 0) return valid;
    }
  } catch { /* ignore */ }
  return DEFAULT_COLS;
}

function hasSmartName(obj: IoBrokerObject | undefined): boolean {
  if (!obj) return false;
  const sn = obj.common?.smartName;
  if (!sn) return false;
  if (typeof sn === 'string') return sn.trim().length > 0;
  if (typeof sn === 'object') return Object.values(sn).some((v) => v && String(v).trim().length > 0);
  return false;
}

function ColPicker({ visible, onChange }: { visible: SortKey[]; onChange: (cols: SortKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function toggle(key: SortKey) {
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : ALL_COLUMNS.map((c) => c.key).filter((k) => visible.includes(k) || k === key);
    if (next.length === 0) return; // mindestens eine Spalte
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Spalten konfigurieren"
        className={`p-1.5 rounded-lg transition-colors ${open ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700'}`}
      >
        <SlidersHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[140px]">
          {ALL_COLUMNS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 select-none"
            >
              <input
                type="checkbox"
                checked={visible.includes(key)}
                onChange={() => toggle(key)}
                className="accent-blue-500"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
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
      className={`px-3 py-2 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </div>
    </th>
  );
}

export default function StateList({ ids, totalCount, states, objects, roomMap, selectedId, onSelect }: StateListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(loadVisibleCols);

  function handleColChange(cols: SortKey[]) {
    setVisibleCols(cols);
    localStorage.setItem(LS_KEY, JSON.stringify(cols));
  }

  const show = (key: SortKey) => visibleCols.includes(key);

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
        case 'room':
          return mul * (roomMap[a] || '').localeCompare(roomMap[b] || '');
        case 'role':
          return mul * (objA?.common?.role || '').localeCompare(objB?.common?.role || '');
        case 'history': {
          const hA = objA ? (hasHistory(objA) ? 1 : 0) : 0;
          const hB = objB ? (hasHistory(objB) ? 1 : 0) : 0;
          return mul * (hA - hB);
        }
        case 'smart': {
          const sA = hasSmartName(objA) ? 1 : 0;
          const sB = hasSmartName(objB) ? 1 : 0;
          return mul * (sA - sB);
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
  }, [ids, states, objects, roomMap, sortKey, sortDir]);

  const toolbar = (
    <div className="flex items-center justify-between px-3 py-1 shrink-0 border-b border-gray-200 dark:border-gray-800">
      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
        <span className="text-gray-600 dark:text-gray-300 font-medium">{Object.keys(states).length}</span>
        {' '}Datenpunkte
        <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
        <span className="text-gray-600 dark:text-gray-300 font-medium">{totalCount}</span>
        {' '}Objekte
      </span>
      <ColPicker visible={visibleCols} onChange={handleColChange} />
    </div>
  );

  if (ids.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="text-gray-400 dark:text-gray-500 text-sm p-8 text-center">
          Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {toolbar}

      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {show('id')    && <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('name')  && <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('room')  && <SortHeader label="Raum" sortKey="room" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('role')  && <SortHeader label="Rolle" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('value') && <SortHeader label="Wert" sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />}
              {show('unit')  && <SortHeader label="Einheit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('ack')   && <SortHeader label="Ack" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('ts')      && <SortHeader label="Letztes Update" sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('history') && <SortHeader label="History" sortKey="history" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              {show('smart')   && <SortHeader label="Smart" sortKey="smart" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
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
                  className={`border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
                    selectedId === id
                      ? 'bg-blue-600/20 text-blue-700 dark:text-blue-200'
                      : 'hover:bg-gray-100/80 text-gray-700 dark:hover:bg-gray-800/50 dark:text-gray-300'
                  }`}
                >
                  {show('id') && (
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-xs group/id">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{id}</span>
                        <CopyIdButton id={id} />
                      </div>
                    </td>
                  )}
                  {show('name') && <EditableNameCell id={id} name={name} />}
                  {show('room') && (
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">
                      {roomMap[id] || ''}
                    </td>
                  )}
                  {show('role') && (
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono">
                      {obj?.common?.role || ''}
                    </td>
                  )}
                  {show('value') && (
                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                      {state ? (() => {
                        const v = formatValue(state.val);
                        const truncated = v.length > 20 ? v.slice(0, 20) + '…' : v;
                        return <span title={v}>{truncated}</span>;
                      })() : <span className="text-gray-300 dark:text-gray-600">...</span>}
                    </td>
                  )}
                  {show('unit') && (
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{unit}</td>
                  )}
                  {show('ack') && (
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
                  )}
                  {show('ts') && (
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">
                      {state ? formatTimestamp(state.ts) : ''}
                    </td>
                  )}
                  {show('history') && (
                    <td className="px-3 py-2">
                      {obj && hasHistory(obj) && (
                        <History size={13} className="text-blue-500 dark:text-blue-400" title="History aktiv (sql.0)" />
                      )}
                    </td>
                  )}
                  {show('smart') && (
                    <td className="px-3 py-2">
                      {obj && hasSmartName(obj) && (
                        <Mic2 size={13} className="text-violet-500 dark:text-violet-400" title={
                          typeof obj.common.smartName === 'string'
                            ? obj.common.smartName
                            : typeof obj.common.smartName === 'object' && obj.common.smartName
                              ? Object.values(obj.common.smartName).join(' / ')
                              : ''
                        } />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
