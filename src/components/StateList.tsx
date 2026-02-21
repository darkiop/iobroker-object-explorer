import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown, SlidersHorizontal, History, Mic2, Maximize2, RotateCcw, Plus, Lock } from 'lucide-react';
import { useExtendObject, useAllRoles } from '../hooks/useStates';
import NewDatapointModal from './NewDatapointModal';
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
  colFilters: Partial<Record<SortKey, string>>;
  onColFilterChange: (filters: Partial<Record<SortKey, string>>) => void;
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
      <td data-col="name" className="px-3 py-2 overflow-hidden group/name">
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
    <td data-col="name" className="px-3 py-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
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

function EditableRoleCell({ id, role, suggestions }: { id: string; role: string; suggestions: string[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(role);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const extend = useExtendObject();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()))
    : suggestions;

  useEffect(() => {
    if (!showSuggestions) return;
    function onOutside(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showSuggestions]);

  useEffect(() => {
    if (editing && inputRef.current) {
      setDropdownRect(inputRef.current.getBoundingClientRect());
      setShowSuggestions(true);
    }
  }, [editing]);

  function openSuggestions() {
    if (inputRef.current) setDropdownRect(inputRef.current.getBoundingClientRect());
    setShowSuggestions(true);
  }

  function commit(val: string) {
    extend.mutate({ id, common: { role: val } });
    setEditing(false);
    setShowSuggestions(false);
  }

  if (!editing) {
    return (
      <td data-col="role" className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono overflow-hidden group/role">
        <div className="flex items-center gap-1.5">
          <span className="truncate">{role}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDraft(role);
              setActiveIndex(-1);
              setEditing(true);
            }}
            className="opacity-0 group-hover/role:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            title="Rolle bearbeiten"
          >
            <Pencil size={12} />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td data-col="role" className="px-3 py-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); openSuggestions(); setActiveIndex(-1); }}
            onFocus={openSuggestions}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
              else if (e.key === 'Enter') { activeIndex >= 0 && filtered[activeIndex] ? commit(filtered[activeIndex]) : commit(draft); }
              else if (e.key === 'Escape') { showSuggestions ? setShowSuggestions(false) : setEditing(false); }
            }}
            autoFocus
            disabled={extend.isPending}
            className="w-full bg-white text-gray-800 text-xs font-mono rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
          />
          {showSuggestions && filtered.length > 0 && dropdownRect && createPortal(
            <ul
              style={{ position: 'fixed', top: dropdownRect.bottom + 2, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999 }}
              className="max-h-48 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg dark:bg-gray-800 dark:border-gray-600"
            >
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`px-2 py-1 text-xs font-mono cursor-pointer ${i === activeIndex ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {s}
                </li>
              ))}
            </ul>,
            document.body
          )}
        </div>
        <button
          onClick={() => commit(draft)}
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

export type SortKey = 'id' | 'name' | 'room' | 'role' | 'value' | 'unit' | 'ack' | 'ts' | 'history' | 'smart';

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

const DEFAULT_WIDTHS: Record<SortKey, number> = {
  id: 220, name: 160, room: 110, role: 130, value: 100,
  unit: 70, ack: 35, ts: 160, history: 65, smart: 65,
};
const LS_WIDTHS_KEY = 'iobroker-col-widths';

function loadColWidths(): Record<SortKey, number> {
  try {
    const raw = localStorage.getItem(LS_WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<SortKey, number>>;
      return { ...DEFAULT_WIDTHS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_WIDTHS };
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
    if (next.length === 0) return;
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

function SortHeader({ label, sortKey, activeKey, dir, onSort, width, onResizeStart, onAutoFit, className }: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent, key: SortKey) => void;
  onAutoFit: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th
      data-col={sortKey}
      style={{ width, minWidth: 40 }}
      className={`relative px-3 py-2 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 overflow-hidden ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        <span className="truncate">{label}</span>
        {active && (dir === 'asc' ? <ArrowUp size={12} className="shrink-0" /> : <ArrowDown size={12} className="shrink-0" />)}
      </div>
      {/* Resize handle */}
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-col-resize z-20 flex items-center justify-center group/resize hover:bg-blue-500/10"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onResizeStart(e, sortKey);
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onAutoFit(sortKey); }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-px h-4 bg-gray-400 dark:bg-gray-500 group-hover/resize:bg-blue-500 group-hover/resize:h-full transition-all" />
      </div>
    </th>
  );
}

export default function StateList({ ids, totalCount, states, objects, roomMap, selectedId, onSelect, colFilters, onColFilterChange }: StateListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(loadVisibleCols);
  const [colWidths, setColWidths] = useState<Record<SortKey, number>>(loadColWidths);
  const containerRef = useRef<HTMLDivElement>(null);
  const [newDatapointOpen, setNewDatapointOpen] = useState(false);
  const { data: roles = [] } = useAllRoles();

  function handleColChange(cols: SortKey[]) {
    setVisibleCols(cols);
    localStorage.setItem(LS_KEY, JSON.stringify(cols));
  }

  function handleResizeStart(e: React.MouseEvent, key: SortKey) {
    const startX = e.clientX;
    const startWidth = colWidths[key];

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      setColWidths((prev) => ({ ...prev, [key]: newWidth }));
    }

    function onMouseUp(ev: MouseEvent) {
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      setColWidths((prev) => {
        const next = { ...prev, [key]: newWidth };
        localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
        return next;
      });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleAutoFit(key: SortKey) {
    if (!containerRef.current) return;
    const cells = containerRef.current.querySelectorAll<HTMLElement>(`[data-col="${key}"]`);
    let maxWidth = 0;
    cells.forEach((cell) => {
      const inner = cell.firstElementChild as HTMLElement | null;
      maxWidth = Math.max(maxWidth, inner ? inner.scrollWidth : cell.scrollWidth);
    });
    if (maxWidth === 0) return;
    const newWidth = Math.max(40, maxWidth + 24); // 24px = px-3 beidseitig
    setColWidths((prev) => {
      const next = { ...prev, [key]: newWidth };
      localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function fitToContainer() {
    const containerWidth = containerRef.current?.clientWidth;
    if (!containerWidth) return;
    const currentTotal = visibleCols.reduce((sum, k) => sum + colWidths[k], 0);
    const scale = containerWidth / currentTotal;
    const next = { ...colWidths };
    let allocated = 0;
    for (let i = 0; i < visibleCols.length; i++) {
      const k = visibleCols[i];
      if (i === visibleCols.length - 1) {
        next[k] = Math.max(40, containerWidth - allocated);
      } else {
        next[k] = Math.max(40, Math.floor(colWidths[k] * scale));
        allocated += next[k];
      }
    }
    setColWidths(next);
    localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
  }

  const show = (key: SortKey) => visibleCols.includes(key);
  const w = (key: SortKey) => colWidths[key];

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

  // metadata filters (id, name, room, role, unit) are applied in App.tsx before pagination
  // only value is filtered here (page-local, state data)
  const filteredIds = useMemo(() => {
    const valueFilter = colFilters.value?.trim().toLowerCase();
    if (!valueFilter) return sortedIds;
    return sortedIds.filter((id) =>
      formatValue(states[id]?.val).toLowerCase().includes(valueFilter)
    );
  }, [sortedIds, colFilters.value, states]);

  const hasColFilters = Object.values(colFilters).some((v) => v.trim() !== '');

  const WRITE_COL_WIDTH = 26;
  const totalWidth = WRITE_COL_WIDTH + visibleCols.reduce((sum, k) => sum + colWidths[k], 0);

  const toolbar = (
    <div className="flex items-center justify-between px-3 py-1 shrink-0 border-b border-gray-200 dark:border-gray-800">
      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
        <span className="text-gray-600 dark:text-gray-300 font-medium">{Object.keys(states).length}</span>
        {' '}Datenpunkte
        <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
        <span className="text-gray-600 dark:text-gray-300 font-medium">{totalCount}</span>
        {' '}Objekte
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={fitToContainer}
          title="Spalten auf 100% strecken"
          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        >
          <Maximize2 size={15} />
        </button>
        {hasColFilters && (
          <button
            onClick={() => onColFilterChange({})}
            title="Spaltenfilter löschen"
            className="p-1.5 rounded-lg transition-colors text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
          >
            <X size={15} />
          </button>
        )}
        <button
          onClick={() => {
            localStorage.removeItem(LS_KEY);
            localStorage.removeItem(LS_WIDTHS_KEY);
            setVisibleCols(DEFAULT_COLS);
            setColWidths({ ...DEFAULT_WIDTHS });
            onColFilterChange({});
          }}
          title="Einstellungen zurücksetzen"
          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
        >
          <RotateCcw size={15} />
        </button>
        <ColPicker visible={visibleCols} onChange={handleColChange} />
        <button
          onClick={() => setNewDatapointOpen(true)}
          title="Neuer Datenpunkt"
          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-green-600 hover:bg-green-500/10 dark:text-gray-500 dark:hover:text-green-400 dark:hover:bg-green-500/10"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );

  const existingIds = useMemo(() => new Set(Object.keys(objects)), [objects]);

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      {newDatapointOpen && (
        <NewDatapointModal
          onClose={() => setNewDatapointOpen(false)}
          existingIds={existingIds}
        />
      )}

      <div ref={containerRef} className="overflow-x-auto overflow-y-auto flex-1">
        <table className="text-sm text-left table-fixed" style={{ width: totalWidth }}>
          <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              <th style={{ width: WRITE_COL_WIDTH, minWidth: WRITE_COL_WIDTH }} className="px-1 py-2" />
              {show('id')      && <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('id')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('name')    && <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('name')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('room')    && <SortHeader label="Raum" sortKey="room" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('room')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('role')    && <SortHeader label="Rolle" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('role')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('value')   && <SortHeader label="Wert" sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('value')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} className="text-right" />}
              {show('unit')    && <SortHeader label="Einheit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('unit')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('ack')     && <SortHeader label="Ack" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ack')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('ts')      && <SortHeader label="Letztes Update" sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ts')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('history') && <SortHeader label="History" sortKey="history" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('history')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('smart')   && <SortHeader label="Smart" sortKey="smart" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('smart')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
            </tr>
            <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th style={{ width: WRITE_COL_WIDTH, minWidth: WRITE_COL_WIDTH }} className="px-1 py-1" />
              {(['id','name','room','role','value','unit','ack','ts','history','smart'] as SortKey[]).filter(show).map((key) => {
                const filterable = ['id','name','room','role','value','unit'].includes(key);
                return (
                  <th key={key} style={{ width: w(key) }} className="px-2 py-1 normal-case font-normal">
                    {filterable ? (
                      <div className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={colFilters[key] || ''}
                          onChange={(e) => onColFilterChange({ ...colFilters, [key]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Escape' && colFilters[key]?.trim()) { e.stopPropagation(); onColFilterChange({ ...colFilters, [key]: '' }); } }}
                          placeholder="Filter..."
                          className={`w-full py-0.5 text-xs rounded border bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 ${
                            colFilters[key]?.trim()
                              ? 'pl-1.5 pr-5 border-blue-400 dark:border-blue-500'
                              : 'px-1.5 border-gray-300 dark:border-gray-600'
                          }`}
                        />
                        {colFilters[key]?.trim() && (
                          <button
                            onMouseDown={(e) => { e.preventDefault(); onColFilterChange({ ...colFilters, [key]: '' }); }}
                            className="absolute right-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredIds.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  {ids.length === 0
                    ? 'Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.'
                    : 'Keine Einträge entsprechen den gesetzten Filtern.'}
                </td>
              </tr>
            )}
            {filteredIds.map((id) => {
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
                  <td style={{ width: WRITE_COL_WIDTH, minWidth: WRITE_COL_WIDTH }} className="px-1 py-2 text-center">
                    {obj?.common?.write === false && (
                      <span title="Schreibgeschützt">
                        <Lock size={11} className="text-gray-400 dark:text-gray-500 inline-block" />
                      </span>
                    )}
                  </td>
                  {show('id') && (
                    <td data-col="id" className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 overflow-hidden group/id">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{id}</span>
                        <CopyIdButton id={id} />
                      </div>
                    </td>
                  )}
                  {show('name') && <EditableNameCell id={id} name={name} />}
                  {show('room') && (
                    <td data-col="room" className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs overflow-hidden">
                      <span className="truncate block">{roomMap[id] || ''}</span>
                    </td>
                  )}
                  {show('role') && <EditableRoleCell id={id} role={obj?.common?.role || ''} suggestions={roles} />}
                  {show('value') && (
                    <td data-col="value" className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-white overflow-hidden whitespace-nowrap">
                      {state ? (() => {
                        const v = formatValue(state.val);
                        const truncated = v.length > 16 ? v.slice(0, 16) + '…' : v;
                        return <span title={v}>{truncated}</span>;
                      })() : <span className="text-gray-300 dark:text-gray-600">...</span>}
                    </td>
                  )}
                  {show('unit') && (
                    <td data-col="unit" className="px-3 py-2 text-gray-400 dark:text-gray-500 overflow-hidden">
                      <span className="truncate block">{unit}</span>
                    </td>
                  )}
                  {show('ack') && (
                    <td data-col="ack" className="px-3 py-2">
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
                    <td data-col="ts" className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs overflow-hidden">
                      <span className="truncate block">{state ? formatTimestamp(state.ts) : ''}</span>
                    </td>
                  )}
                  {show('history') && (
                    <td data-col="history" className="px-3 py-2">
                      {obj && hasHistory(obj) && (
                        <span title="History aktiv (sql.0)"><History size={13} className="text-blue-500 dark:text-blue-400" /></span>
                      )}
                    </td>
                  )}
                  {show('smart') && (
                    <td data-col="smart" className="px-3 py-2">
                      {obj && hasSmartName(obj) && (
                        <span title={
                          typeof obj.common.smartName === 'string'
                            ? obj.common.smartName
                            : typeof obj.common.smartName === 'object' && obj.common.smartName
                              ? Object.values(obj.common.smartName).join(' / ')
                              : ''
                        }><Mic2 size={13} className="text-violet-500 dark:text-violet-400" /></span>
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
