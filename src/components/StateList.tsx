import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown, SlidersHorizontal, History, Mic2, Maximize2, RotateCcw, Plus, Lock, Trash2, Search, Link2, FileEdit, Download } from 'lucide-react';
import { useExtendObject, useAllRoles, useAllUnits, useDeleteObject, useSetState, useRoomEnums, useUpdateRoomMembership, useUpdateRoomMembershipBatch, useFunctionEnums, useUpdateFunctionMembership, useUpdateFunctionMembershipBatch } from '../hooks/useStates';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';
import NewDatapointModal from './NewDatapointModal';
import ObjectEditModal from './ObjectEditModal';
import CreateAliasModal from './CreateAliasModal';
import CopyDatapointModal from './CopyDatapointModal';
import HistoryModal from './HistoryModal';
import ConfirmDialog from './ConfirmDialog';
import MultiDeleteDialog from './MultiDeleteDialog';
import { hasHistory, isGlobPattern } from '../api/iobroker';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';

interface StateListProps {
  ids: string[];
  states: Record<string, IoBrokerState>;
  objects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;
  functionMap: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  colFilters: Partial<Record<SortKey, string>>;
  onColFilterChange: (filters: Partial<Record<SortKey, string>>) => void;
  pattern?: string;
  aliasMap?: Map<string, string[]>;
  onNavigateTo?: (ids: string[]) => void;
  exportIds?: string[];
  treeFilter?: string | null;
  onClearTreeFilter?: () => void;
  sidebarToggleSeq?: number;
  fulltextEnabled?: boolean;
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

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  } else {
    copyTextFallback(text);
  }
}
function copyTextFallback(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function EditableNameCell({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const extend = useExtendObject();

  const [copied, setCopied] = useState(false);

  if (!editing) {
    return (
      <td data-col="name" className="px-3 py-2 overflow-hidden group/name">
        <div className="flex items-center gap-1.5">
          <span className="truncate" title={name}>{name}</span>
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              function done() { setCopied(true); setTimeout(() => setCopied(false), 1500); }
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(name).then(done).catch(fallback);
              } else {
                fallback();
              }
              function fallback() {
                const ta = document.createElement('textarea');
                ta.value = name;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                done();
              }
            }}
            className="opacity-0 group-hover/name:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            title="Name kopieren"
          >
            {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
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
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();

  const filtered = filter
    ? suggestions.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
    : suggestions;

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setFilter('');
    setActiveIndex(-1);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setFilter('');
  }

  function commit(val: string) {
    extend.mutate({ id, common: { role: val } });
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="role"
      className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono overflow-hidden group/role"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {role ? (
          <>
            <span className="truncate" title={role}>{role}</span>
            <Pencil size={12} className="opacity-0 group-hover/role:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic font-sans">Rolle wählen…</span>
        )}
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: Math.max(180, cellRect.width) }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-1.5 border-b border-gray-200 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setActiveIndex(-1); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
                  else if (e.key === 'Enter') {
                    if (activeIndex >= 0 && filtered[activeIndex]) commit(filtered[activeIndex]);
                    else if (filter.trim()) commit(filter.trim());
                    else close();
                  }
                  else if (e.key === 'Escape') close();
                }}
                placeholder="Filtern…"
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  „{filter.trim()}" verwenden
                </li>
              )}
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                    i === activeIndex || (activeIndex < 0 && s === role)
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
}

function EditableUnitCell({ id, unit, suggestions }: { id: string; unit: string; suggestions: string[] }) {
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();

  const filtered = filter
    ? suggestions.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
    : suggestions;

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setFilter('');
    setActiveIndex(-1);
    setEditing(true);
  }

  function close() { setEditing(false); setFilter(''); }

  function commit(val: string) {
    extend.mutate({ id, common: { unit: val } });
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="unit"
      className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono overflow-hidden group/unit"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {unit ? (
          <>
            <span className="truncate" title={unit}>{unit}</span>
            <Pencil size={12} className="opacity-0 group-hover/unit:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic font-sans">Einheit…</span>
        )}
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: Math.max(140, cellRect.width) }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-1.5 border-b border-gray-200 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setActiveIndex(-1); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
                  else if (e.key === 'Enter') {
                    if (activeIndex >= 0 && filtered[activeIndex]) commit(filtered[activeIndex]);
                    else if (filter.trim()) commit(filter.trim());
                    else close();
                  }
                  else if (e.key === 'Escape') close();
                }}
                placeholder="Filtern…"
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  „{filter.trim()}" verwenden
                </li>
              )}
              {unit && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(''); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  — leer —
                </li>
              )}
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    i === activeIndex
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
}

function EditableValueCell({ id, state, obj }: { id: string; state: IoBrokerState | undefined; obj: IoBrokerObject | undefined }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const setStateVal = useSetState();
  const prevValRef = useRef<unknown>(undefined);

  const isReadonly = obj?.common?.write === false;
  const valType = obj?.common?.type;

  function startEdit() {
    setDraft(state ? formatValue(state.val) : '');
    setEditing(true);
  }

  function commit() {
    let parsed: unknown = draft;
    if (valType === 'number') {
      const n = parseFloat(draft);
      if (!isNaN(n)) parsed = n;
    } else if (valType === 'boolean') {
      parsed = draft === 'true' || draft === '1';
    }
    setStateVal.mutate({ id, val: parsed });
    setEditing(false);
  }

  if (!editing) {
    const val = state?.val;
    const isNull = val === null || val === undefined;
    const isBoolean = typeof val === 'boolean';
    const isNumber = typeof val === 'number';

    let valueColor = 'text-gray-900 dark:text-white';
    if (isNull) valueColor = 'text-gray-300 dark:text-gray-600';
    else if (isBoolean) valueColor = val ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';

    let trendIcon: React.ReactNode = null;
    const prev = prevValRef.current;
    if (isNumber && prev !== undefined && prev !== val) {
      trendIcon = (val as number) > (prev as number)
        ? <ArrowUp  size={10} className="text-green-500 dark:text-green-400 shrink-0" />
        : <ArrowDown size={10} className="text-red-400 dark:text-red-400 shrink-0" />;
    }
    prevValRef.current = val;

    return (
      <td data-col="value" className="px-3 py-2 text-right font-mono font-medium overflow-hidden whitespace-nowrap group/value">
        <div className={`flex items-center justify-end gap-1 ${valueColor}`}>
          {!isReadonly && (
            <button
              onClick={(e) => { e.stopPropagation(); startEdit(); }}
              className="opacity-0 group-hover/value:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
              title="Wert bearbeiten"
            >
              <Pencil size={12} />
            </button>
          )}
          {trendIcon}
          {state ? (() => {
            const v = formatValue(val);
            const truncated = v.length > 16 ? v.slice(0, 16) + '…' : v;
            return <span title={v}>{truncated}</span>;
          })() : <span className="text-gray-300 dark:text-gray-600">…</span>}
        </div>
      </td>
    );
  }

  return (
    <td data-col="value" className="px-3 py-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 justify-end">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          disabled={setStateVal.isPending}
          className="flex-1 min-w-0 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 text-right font-mono"
        />
        <button onClick={commit} disabled={setStateVal.isPending} className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 shrink-0 disabled:opacity-50">
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} disabled={setStateVal.isPending} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 disabled:opacity-50">
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

function EditableRoomCell({ id, currentRoomEnumId, roomName, roomEnums, onSelectRoom, forceEdit, onEditEnd }: {
  id: string;
  currentRoomEnumId: string | null;
  roomName: string;
  roomEnums: { id: string; name: string }[];
  onSelectRoom: (objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => void;
  forceEdit?: boolean;
  onEditEnd?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (forceEdit && !editing) {
      if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
      setEditing(true);
    }
  }, [forceEdit]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setEditing(true);
  }

  function close() {
    setEditing(false);
    onEditEnd?.();
  }

  function select(newRoomEnumId: string | null) {
    onSelectRoom(id, currentRoomEnumId, newRoomEnumId);
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="room"
      className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs overflow-hidden group/room"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {roomName ? (
          <>
            <span className="truncate" title={roomName}>{roomName}</span>
            <Pencil
              size={12}
              className="opacity-0 group-hover/room:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic">Raum wählen…</span>
        )}
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: 160 }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="max-h-56 overflow-y-auto py-1">
              <li
                onMouseDown={(e) => { e.preventDefault(); select(null); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 ${
                  !currentRoomEnumId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic'
                }`}
              >
                Kein Raum
              </li>
              {roomEnums.map((room) => (
                <li
                  key={room.id}
                  onMouseDown={(e) => { e.preventDefault(); select(room.id); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    currentRoomEnumId === room.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {room.name}
                </li>
              ))}
              {roomEnums.length === 0 && (
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">Lädt…</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
}

function EditableFunctionCell({ id, currentFnEnumId, fnName, fnEnums, onSelectFunction, forceEdit, onEditEnd }: {
  id: string;
  currentFnEnumId: string | null;
  fnName: string;
  fnEnums: { id: string; name: string }[];
  onSelectFunction: (objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => void;
  forceEdit?: boolean;
  onEditEnd?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (forceEdit && !editing) {
      if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
      setEditing(true);
    }
  }, [forceEdit]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setEditing(true);
  }

  function close() {
    setEditing(false);
    onEditEnd?.();
  }

  function select(newFnEnumId: string | null) {
    onSelectFunction(id, currentFnEnumId, newFnEnumId);
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="function"
      className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs overflow-hidden group/fn"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {fnName ? (
          <>
            <span className="truncate" title={fnName}>{fnName}</span>
            <Pencil
              size={12}
              className="opacity-0 group-hover/fn:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic">Funktion wählen…</span>
        )}
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: 160 }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="max-h-56 overflow-y-auto py-1">
              <li
                onMouseDown={(e) => { e.preventDefault(); select(null); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 ${
                  !currentFnEnumId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic'
                }`}
              >
                Keine Funktion
              </li>
              {fnEnums.map((fn) => (
                <li
                  key={fn.id}
                  onMouseDown={(e) => { e.preventDefault(); select(fn.id); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    currentFnEnumId === fn.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {fn.name}
                </li>
              ))}
              {fnEnums.length === 0 && (
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">Lädt…</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
}

export type SortKey = 'checkbox' | 'write' | 'alias' | 'id' | 'name' | 'room' | 'function' | 'type' | 'role' | 'value' | 'unit' | 'ack' | 'ts' | 'history' | 'smart' | 'relevanz';

const ALL_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'checkbox', label: 'Auswahl' },
  { key: 'write',   label: 'Schreibschutz' },
  { key: 'history', label: 'History' },
  { key: 'smart',   label: 'SmartName' },
  { key: 'alias',   label: 'Alias' },
  { key: 'id',      label: 'ID' },
  { key: 'name',    label: 'Name' },
  { key: 'room',      label: 'Raum' },
  { key: 'function',  label: 'Funktion' },
  { key: 'role',    label: 'Rolle' },
  { key: 'value',   label: 'Wert' },
  { key: 'unit',    label: 'Einheit' },
  { key: 'ack',     label: 'Ack' },
  { key: 'ts',      label: 'Letztes Update' },
];

const DEFAULT_COLS: SortKey[] = ['checkbox', 'write', 'history', 'smart', 'alias', 'id', 'name', 'room', 'function', 'role', 'value', 'unit', 'ack', 'ts'];
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

const DEL_COL_WIDTH = 32;
const CHK_COL_WIDTH = 28;
const VIRTUAL_ROW_HEIGHT = 37;
const VIRTUAL_OVERSCAN = 10;
const VIRTUALIZE_THRESHOLD = 120;
const DEFAULT_WIDTHS: Record<SortKey, number> = {
  checkbox: CHK_COL_WIDTH,
  write: 22, history: 22, smart: 22, alias: 30,
  id: 220, name: 160, room: 110, function: 110, type: 70, role: 130, value: 100,
  unit: 70, ack: 35, ts: 160, relevanz: 100,
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
            <div
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 select-none"
            >
              <StyledCheckbox checked={visible.includes(key)} onChange={() => toggle(key)} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StyledCheckbox({ checked, indeterminate, onChange, title }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  title?: string;
}) {
  return (
    <label className="inline-flex items-center justify-center cursor-pointer select-none" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        ref={(el) => { if (el) el.indeterminate = !!indeterminate; }}
        className="sr-only"
      />
      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked
          ? 'bg-blue-500 border-blue-500'
          : indeterminate
          ? 'bg-blue-400/60 border-blue-400'
          : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
      }`}>
        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
        {!checked && indeterminate && <span className="block w-2 h-[1.5px] bg-white rounded" />}
      </span>
    </label>
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

function patternToInitialId(pattern: string): string {
  if (!pattern || pattern === '*') return '';
  if (pattern.endsWith('.*')) return pattern.slice(0, -1); // e.g. "javascript.0.*" → "javascript.0."
  if (pattern.endsWith('*')) return pattern.slice(0, -1);
  return pattern;
}

interface StateRowProps {
  id: string;
  state: IoBrokerState | undefined;
  obj: IoBrokerObject | undefined;
  roomName: string;
  fnName: string;
  isSelected: boolean;
  isChecked: boolean;
  aliasIds: string[] | undefined;
  visibleCols: SortKey[];
  colWidths: Record<SortKey, number>;
  roles: string[];
  units: string[];
  roomEnums: { id: string; name: string }[];
  fnEnums: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onHistoryClick: (id: string) => void;
  onNavigateTo?: (ids: string[]) => void;
  onDeleteClick: (id: string) => void;
  onSelectRoom: (objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => void;
  onSelectFunction: (objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => void;
  roomEditForced: boolean;
  fnEditForced: boolean;
  onRoomEditEnd: () => void;
  onFnEditEnd: () => void;
}

function aliasIdsEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const StateRow = React.memo(function StateRow({
  id, state, obj, roomName, fnName,
  isSelected, isChecked, aliasIds,
  visibleCols, colWidths, roles, units, roomEnums, fnEnums,
  onSelect, onCheck, onContextMenu, onHistoryClick, onNavigateTo, onDeleteClick,
  onSelectRoom, onSelectFunction,
  roomEditForced, fnEditForced, onRoomEditEnd, onFnEditEnd,
}: StateRowProps) {
  const show = (key: SortKey) => visibleCols.includes(key);
  const w = (key: SortKey) => colWidths[key];
  const unit = obj?.common?.unit || '';
  const name = getObjectName(obj);
  const roomEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.rooms.')) ?? null;
  const fnEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.functions.')) ?? null;
  const ownTarget = obj?.common?.alias?.id ?? (obj?.common?.alias as { read?: string } | undefined)?.read;
  const hasAlias = (aliasIds && aliasIds.length > 0) || !!ownTarget;
  const aliasTooltip = aliasIds?.length
    ? `Alias: ${aliasIds.join(', ')}`
    : ownTarget ? `Quelle: ${ownTarget}` : undefined;

  return (
    <tr
      onClick={() => onSelect(id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY, id); }}
      className={`border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-600/20 text-blue-700 dark:text-blue-200'
          : 'hover:bg-gray-100/80 text-gray-700 dark:hover:bg-gray-800/50 dark:text-gray-300'
      }`}
    >
      {show('checkbox') && (
        <td style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center">
            <StyledCheckbox
              checked={isChecked}
              onChange={(e) => onCheck(id, e.target.checked)}
            />
          </div>
        </td>
      )}
      {show('write') && (
        <td style={{ width: colWidths['write'], minWidth: colWidths['write'] }} className="py-2 align-middle" title={obj?.common?.write === false ? 'Schreibgeschützt' : undefined}>
          <div className="flex items-center justify-center">
            {obj?.common?.write === false && <Lock size={11} className="text-gray-400 dark:text-gray-500" />}
          </div>
        </td>
      )}
      {show('history') && (
        <td style={{ width: colWidths['history'], minWidth: colWidths['history'] }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {obj && hasHistory(obj) && (
              <button
                onClick={(e) => { e.currentTarget.blur(); e.stopPropagation(); onHistoryClick(id); }}
                title="History anzeigen"
                className="p-0.5 rounded text-blue-500 dark:text-blue-400 hover:bg-blue-500/15 dark:hover:bg-blue-500/20 transition-colors"
              >
                <History size={13} />
              </button>
            )}
          </div>
        </td>
      )}
      {show('smart') && (
        <td
          style={{ width: colWidths['smart'], minWidth: colWidths['smart'] }}
          className="py-2 align-middle"
          title={obj && hasSmartName(obj) ? (
            typeof obj.common.smartName === 'string'
              ? obj.common.smartName
              : typeof obj.common.smartName === 'object' && obj.common.smartName
                ? Object.values(obj.common.smartName).join(' / ')
                : 'SmartName'
          ) : undefined}
        >
          <div className="flex items-center justify-center">
            {obj && hasSmartName(obj) && (
              <span className="p-0.5 rounded hover:bg-violet-500/15 dark:hover:bg-violet-500/20 transition-colors">
                <Mic2 size={13} className="text-violet-500 dark:text-violet-400" />
              </span>
            )}
          </div>
        </td>
      )}
      {show('alias') && (
        <td style={{ width: w('alias'), minWidth: w('alias') }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {hasAlias && (
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  e.stopPropagation();
                  const targets = aliasIds?.length ? aliasIds : ownTarget ? [ownTarget] : [];
                  onNavigateTo?.(targets);
                }}
                title={aliasTooltip}
                className="relative p-0.5 rounded text-amber-500 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 transition-colors"
              >
                <Link2 size={13} />
                {aliasIds && aliasIds.length > 1 && (
                  <span className="absolute -top-1.5 -right-2 text-[8px] font-bold leading-none bg-amber-500 text-white rounded-full min-w-[13px] h-[13px] flex items-center justify-center px-0.5">
                    {aliasIds.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </td>
      )}
      {show('id') && (
        <td data-col="id" className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 overflow-hidden group/id">
          <div className="flex items-center gap-1.5">
            <span className="truncate" title={id}>{id}</span>
            <CopyIdButton id={id} />
          </div>
        </td>
      )}
      {show('name') && <EditableNameCell id={id} name={name} />}
      {show('room') && (
        <EditableRoomCell
          id={id}
          currentRoomEnumId={roomEnumId}
          roomName={roomName}
          roomEnums={roomEnums}
          onSelectRoom={onSelectRoom}
          forceEdit={roomEditForced}
          onEditEnd={onRoomEditEnd}
        />
      )}
      {show('function') && (
        <EditableFunctionCell
          id={id}
          currentFnEnumId={fnEnumId}
          fnName={fnName}
          fnEnums={fnEnums}
          onSelectFunction={onSelectFunction}
          forceEdit={fnEditForced}
          onEditEnd={onFnEditEnd}
        />
      )}
      {show('role') && <EditableRoleCell id={id} role={obj?.common?.role || ''} suggestions={roles} />}
      {show('value') && <EditableValueCell id={id} state={state} obj={obj} />}
      {show('unit') && <EditableUnitCell id={id} unit={unit} suggestions={units} />}
      {show('ack') && (
        <td data-col="ack" className="px-3 py-2">
          {state ? (
            <span
              className={`inline-block w-2 h-2 rounded-full ${state.ack ? 'bg-green-500' : 'bg-yellow-500'}`}
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
      <td style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} className="py-1 pr-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDeleteClick(id)}
          title="Datenpunkt löschen"
          className="p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
        ><Trash2 size={13} /></button>
      </td>
    </tr>
  );
}, (prev, next) => {
  const prevState = prev.state;
  const nextState = next.state;
  const prevObj = prev.obj;
  const nextObj = next.obj;

  return (
    prev.id === next.id &&
    prevState?.val === nextState?.val &&
    prevState?.ack === nextState?.ack &&
    prevState?.ts === nextState?.ts &&
    prevObj === nextObj &&
    prev.roomName === next.roomName &&
    prev.fnName === next.fnName &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    aliasIdsEqual(prev.aliasIds, next.aliasIds) &&
    prev.visibleCols === next.visibleCols &&
    prev.colWidths === next.colWidths &&
    prev.roles === next.roles &&
    prev.units === next.units &&
    prev.roomEnums === next.roomEnums &&
    prev.fnEnums === next.fnEnums &&
    prev.roomEditForced === next.roomEditForced &&
    prev.fnEditForced === next.fnEditForced &&
    prev.onNavigateTo === next.onNavigateTo &&
    prev.onSelectRoom === next.onSelectRoom &&
    prev.onSelectFunction === next.onSelectFunction
  );
});

function StateList({ ids, states, objects, roomMap, functionMap, selectedId, onSelect, colFilters, onColFilterChange, pattern = '*', aliasMap, onNavigateTo, exportIds, treeFilter, onClearTreeFilter, sidebarToggleSeq, fulltextEnabled = true }: StateListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(loadVisibleCols);
  const [colWidths, setColWidths] = useState<Record<SortKey, number>>(loadColWidths);
  const containerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const autoFitRef = useRef(!localStorage.getItem(LS_WIDTHS_KEY));
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [newDatapointOpen, setNewDatapointOpen] = useState(false);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [multiDeleteOpen, setMultiDeleteOpen] = useState(false);
  const deleteObject = useDeleteObject();
  const extend = useExtendObject();
  const { data: roles = [] } = useAllRoles();
  const { data: units = [] } = useAllUnits();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: fnEnums = [] } = useFunctionEnums();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();
  const updateRoomBatch = useUpdateRoomMembershipBatch();
  const updateFnBatch = useUpdateFunctionMembershipBatch();
  const [batchRole, setBatchRole] = useState('');
  const [batchUnit, setBatchUnit] = useState('');
  const [batchRoomEnumId, setBatchRoomEnumId] = useState('');
  const [batchFnEnumId, setBatchFnEnumId] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [roomEditId, setRoomEditId] = useState<string | null>(null);
  const [fnEditId, setFnEditId] = useState<string | null>(null);
  const [aliasSourceId, setAliasSourceId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [editObjId, setEditObjId] = useState<string | null>(null);

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
    const ICON_COLS: SortKey[] = ['checkbox', 'write', 'history', 'smart', 'alias'];
    const scalable = visibleCols.filter((k) => !ICON_COLS.includes(k));
    const iconWidth = ICON_COLS.filter((k) => show(k)).reduce((s, k) => s + colWidths[k], 0);
    const available = containerWidth - iconWidth - DEL_COL_WIDTH;
    const currentTotal = scalable.reduce((sum, k) => sum + colWidths[k], 0);
    const scale = available / currentTotal;
    const next = { ...colWidths };
    let allocated = 0;
    for (let i = 0; i < scalable.length; i++) {
      const k = scalable[i];
      if (i === scalable.length - 1) {
        next[k] = Math.max(40, available - allocated);
      } else {
        next[k] = Math.max(40, Math.floor(colWidths[k] * scale));
        allocated += next[k];
      }
    }
    // Icon cols stay at their fixed default width — never modified by fitToContainer
    for (const k of ICON_COLS) {
      next[k] = DEFAULT_WIDTHS[k];
    }
    setColWidths(next);
    localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
  }

  useEffect(() => {
    if (!autoFitRef.current || ids.length === 0) return;
    autoFitRef.current = false;
    requestAnimationFrame(() => fitToContainer());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useEffect(() => {
    const container = containerRef.current;
    const thead = theadRef.current;
    if (!container) return;

    const measure = () => {
      setViewportHeight(container.clientHeight);
      setHeaderHeight(thead?.offsetHeight ?? 0);
    };
    measure();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) {
      ro.observe(container);
      if (thead) ro.observe(thead);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!sidebarToggleSeq) return;
    fitToContainer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarToggleSeq]);

  useEffect(() => {
    if (fulltextEnabled && pattern && !isGlobPattern(pattern) && pattern !== '*') {
      setSortKey('relevanz');
      setSortDir('asc');
    } else {
      setSortKey('id');
      setSortDir('asc');
    }
  }, [pattern]);

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

  const sortNeedsState = sortKey === 'value' || sortKey === 'ack' || sortKey === 'ts';
  const sortNeedsObject = sortKey === 'name' || sortKey === 'role' || sortKey === 'history' || sortKey === 'smart' || sortKey === 'unit' || sortKey === 'type';
  const sortNeedsRoomMap = sortKey === 'room';
  const sortNeedsFunctionMap = sortKey === 'function';

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
        case 'function':
          return mul * (functionMap[a] || '').localeCompare(functionMap[b] || '');
        case 'type':
          return mul * (objA?.type || '').localeCompare(objB?.type || '');
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
        case 'relevanz':
          return 0; // preserve relevance order from input
        default:
          return 0;
      }
    });
  }, [
    ids,
    sortKey,
    sortDir,
    sortNeedsState ? states : null,
    sortNeedsObject ? objects : null,
    sortNeedsRoomMap ? roomMap : null,
    sortNeedsFunctionMap ? functionMap : null,
  ]);

  // metadata + icon filters applied in App.tsx before pagination
  // value is filtered here (page-local)
  const valueFilter = colFilters.value?.trim().toLowerCase() || '';
  const filteredIds = useMemo(() => {
    if (!valueFilter) return sortedIds;
    return sortedIds.filter((id) => formatValue(states[id]?.val).toLowerCase().includes(valueFilter));
  }, [sortedIds, valueFilter, valueFilter ? states : null]);

  const hasColFilters = Object.values(colFilters).some((v) => v.trim() !== '');

  const totalWidth = DEL_COL_WIDTH + visibleCols.reduce((sum, k) => sum + colWidths[k], 0);

  const allOnPageChecked = filteredIds.length > 0 && filteredIds.every((id) => checkedIds.has(id));
  const someChecked = filteredIds.some((id) => checkedIds.has(id));

  function toggleCheckAll() {
    if (allOnPageChecked) {
      setCheckedIds((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setCheckedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function handleDeleteOne(id: string) {
    deleteObject.mutate(id);
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function handleDeleteAll(ids: string[]) {
    Promise.all(ids.map((id) => deleteObject.mutateAsync(id))).then(() => {
      setCheckedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    });
  }

  const handleCheckRow = React.useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const handleRowContextMenu = React.useCallback((x: number, y: number, id: string) => {
    setCtxMenu({ x, y, id });
  }, []);

  const handleRowHistoryClick = React.useCallback((id: string) => {
    setHistoryModalId(id);
  }, []);

  const handleRowDeleteClick = React.useCallback((id: string) => {
    setDeletingId(id);
  }, []);

  const handleSelectRoom = React.useCallback((objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => {
    updateRoom.mutate({ objectId, oldRoomEnumId, newRoomEnumId });
  }, [updateRoom]);

  const handleSelectFunction = React.useCallback((objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => {
    updateFn.mutate({ objectId, oldFnEnumId, newFnEnumId });
  }, [updateFn]);

  const handleRoomEditEnd = React.useCallback(() => setRoomEditId(null), []);
  const handleFnEditEnd = React.useCallback(() => setFnEditId(null), []);

  function handleBatchApply() {
    const ids = [...checkedIds];
    if (batchRole.trim()) {
      ids.forEach((id) => extend.mutate({ id, common: { role: batchRole.trim() } }));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => extend.mutate({ id, common: { unit: batchUnit.trim() } }));
    }
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === '__none__' ? null : batchRoomEnumId;
      updateRoomBatch.mutate({ objectIds: ids, newRoomEnumId });
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === '__none__' ? null : batchFnEnumId;
      updateFnBatch.mutate({ objectIds: ids, newFnEnumId });
    }
    setBatchRole('');
    setBatchUnit('');
    setBatchRoomEnumId('');
    setBatchFnEnumId('');
  }

  function handleExport(format: 'json' | 'csv') {
    const allIds = exportIds ?? ids;
    const rows = allIds.map((id) => {
      const obj = objects[id];
      return {
        id,
        name: obj?.common?.name ? (typeof obj.common.name === 'string' ? obj.common.name : (obj.common.name.de || obj.common.name.en || '')) : '',
        type: obj?.type || '',
        role: obj?.common?.role || '',
        unit: obj?.common?.unit || '',
        room: roomMap[id] || '',
        function: functionMap[id] || '',
        read: obj?.common?.read !== false ? 'true' : 'false',
        write: obj?.common?.write === true ? 'true' : 'false',
      };
    });
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
      mime = 'application/json';
      ext = 'json';
    } else {
      const headers = ['id', 'name', 'type', 'role', 'unit', 'room', 'function', 'read', 'write'];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      content = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(String(r[h as keyof typeof r]))).join(';'))].join('\r\n');
      mime = 'text/csv;charset=utf-8';
      ext = 'csv';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iobroker-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toolbar = (
    <div className="flex items-center justify-between pl-1 pr-3 py-1 shrink-0 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setNewDatapointOpen(true)}
          title="Neuer Datenpunkt"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-green-600 bg-green-500/10 hover:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/20 transition-colors"
        >
          <Plus size={16} />
        </button>
        <div className="relative group/export">
          <button
            title="Exportieren"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors"
          >
            <Download size={16} />
          </button>
          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/export:flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden min-w-[90px]">
            <button
              onMouseDown={() => handleExport('csv')}
              className="px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              CSV
            </button>
            <button
              onMouseDown={() => handleExport('json')}
              className="px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              JSON
            </button>
          </div>
        </div>
        {checkedIds.size > 0 && (
          <button
            onClick={() => setMultiDeleteOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={13} />
            {checkedIds.size} löschen
          </button>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        {treeFilter && onClearTreeFilter && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-400/30 text-blue-600 dark:text-blue-400 text-sm font-mono max-w-[520px]">
            <span className="truncate">{treeFilter.replace(/\.$/, '')}</span>
            <button onClick={onClearTreeFilter} title="Filter entfernen" className="shrink-0 hover:text-blue-800 dark:hover:text-blue-200">
              <X size={10} />
            </button>
          </span>
        )}
        {fulltextEnabled && pattern && !isGlobPattern(pattern) && pattern !== '*' && (
          <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-600 dark:text-violet-400 text-xs">
            Volltext
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={fitToContainer}
          title="Spalten auf 100% strecken"
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        >
          <Maximize2 size={17} />
        </button>
        {hasColFilters && (
          <button
            onClick={() => onColFilterChange({})}
            title="Spaltenfilter löschen"
            className="p-2 rounded-lg transition-colors text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
          >
            <X size={17} />
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
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
        >
          <RotateCcw size={17} />
        </button>
        <ColPicker visible={visibleCols} onChange={handleColChange} />
      </div>
    </div>
  );

  const existingIds = useMemo(() => new Set(Object.keys(objects)), [objects]);

  const batchCanApply = batchRole.trim() !== '' || batchUnit.trim() !== '' || batchRoomEnumId !== '' || batchFnEnumId !== '';
  const bodyViewportHeight = Math.max(0, viewportHeight - headerHeight);
  const virtualEnabled = filteredIds.length > VIRTUALIZE_THRESHOLD && bodyViewportHeight > 0;
  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);
  const virtualStart = virtualEnabled
    ? Math.max(0, Math.floor(bodyScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
    : 0;
  const virtualVisibleCount = virtualEnabled
    ? Math.ceil(bodyViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
    : filteredIds.length;
  const virtualEnd = virtualEnabled
    ? Math.min(filteredIds.length, virtualStart + virtualVisibleCount)
    : filteredIds.length;
  const visibleRowIds = virtualEnabled ? filteredIds.slice(virtualStart, virtualEnd) : filteredIds;
  const topSpacer = virtualEnabled ? virtualStart * VIRTUAL_ROW_HEIGHT : 0;
  const bottomSpacer = virtualEnabled ? (filteredIds.length - virtualEnd) * VIRTUAL_ROW_HEIGHT : 0;
  const rowColSpan = visibleCols.length + 1;

  function handleBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    const next = e.currentTarget.scrollTop;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(next);
      scrollRafRef.current = null;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 flex-wrap">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0 whitespace-nowrap">
            {checkedIds.size} ausgewählt:
          </span>
          <input
            type="text"
            value={batchRole}
            onChange={(e) => setBatchRole(e.target.value)}
            list="batch-roles"
            placeholder="Rolle…"
            className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
          />
          <datalist id="batch-roles">
            {roles.map((r) => <option key={r} value={r} />)}
          </datalist>
          <input
            type="text"
            value={batchUnit}
            onChange={(e) => setBatchUnit(e.target.value)}
            list="batch-units"
            placeholder="Einheit…"
            className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 w-20"
          />
          <datalist id="batch-units">
            {units.map((u) => <option key={u} value={u} />)}
          </datalist>
          <select
            value={batchRoomEnumId}
            onChange={(e) => setBatchRoomEnumId(e.target.value)}
            className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Raum…</option>
            <option value="__none__">— Kein Raum —</option>
            {roomEnums.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select
            value={batchFnEnumId}
            onChange={(e) => setBatchFnEnumId(e.target.value)}
            className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Funktion…</option>
            <option value="__none__">— Keine Funktion —</option>
            {fnEnums.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button
            onClick={handleBatchApply}
            disabled={!batchCanApply}
            className="px-2.5 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Anwenden
          </button>
        </div>
      )}
      {newDatapointOpen && (
        <NewDatapointModal
          onClose={() => setNewDatapointOpen(false)}
          existingIds={existingIds}
          initialId={patternToInitialId(pattern)}
        />
      )}
      {historyModalId && (
        <HistoryModal
          stateId={historyModalId}
          unit={objects[historyModalId]?.common?.unit}
          objects={objects}
          onClose={() => setHistoryModalId(null)}
        />
      )}
      {deletingId && (
        <ConfirmDialog
          title="Datenpunkt löschen"
          message={deletingId}
          onConfirm={() => { deleteObject.mutate(deletingId); setDeletingId(null); }}
          onCancel={() => setDeletingId(null)}
        />
      )}
      {multiDeleteOpen && (
        <MultiDeleteDialog
          ids={[...checkedIds]}
          onDeleteOne={handleDeleteOne}
          onDeleteAll={handleDeleteAll}
          onClose={() => setMultiDeleteOpen(false)}
        />
      )}
      {aliasSourceId && (
        <CreateAliasModal
          sourceId={aliasSourceId}
          sourceObj={objects[aliasSourceId]}
          existingIds={existingIds}
          onClose={() => setAliasSourceId(null)}
          onCreated={(newId) => onNavigateTo?.([newId])}
        />
      )}
      {copySourceId && (
        <CopyDatapointModal
          sourceId={copySourceId}
          sourceObj={objects[copySourceId]}
          existingIds={existingIds}
          onClose={() => setCopySourceId(null)}
        />
      )}
      {editObjId && objects[editObjId] && (
        <ObjectEditModal
          id={editObjId}
          obj={objects[editObjId]}
          onClose={() => setEditObjId(null)}
          onOpenHistory={hasHistory(objects[editObjId]) ? () => setHistoryModalId(editObjId) : undefined}
        />
      )}

      {ctxMenu && (() => {
        const { x, y, id: ctxId } = ctxMenu;
        const ctxState = states[ctxId];
        const ctxObj = objects[ctxId];
        const ctxName = getObjectName(ctxObj);
        const items: ContextMenuEntry[] = [];
        items.push({ icon: <Copy size={13} />, label: 'ID kopieren', onClick: () => copyText(ctxId) });
        if (ctxName) items.push({ icon: <Copy size={13} />, label: 'Name kopieren', onClick: () => copyText(ctxName) });
        if (ctxState) items.push({ icon: <Copy size={13} />, label: 'Wert kopieren', onClick: () => copyText(formatValue(ctxState.val)) });
        items.push({ separator: true } as const);
        if (ctxObj && hasHistory(ctxObj)) {
          items.push({ icon: <History size={13} />, label: 'History anzeigen', onClick: () => setHistoryModalId(ctxId) });
          items.push({ separator: true } as const);
        }
        items.push({ icon: <Search size={13} />, label: 'Als Filter setzen', onClick: () => onColFilterChange({ ...colFilters, id: ctxId }) });
        items.push({ icon: <Pencil size={13} />, label: 'Raum bearbeiten', onClick: () => setRoomEditId(ctxId) });
        items.push({ icon: <Pencil size={13} />, label: 'Funktion bearbeiten', onClick: () => setFnEditId(ctxId) });
        items.push({ icon: <FileEdit size={13} />, label: 'Objekt bearbeiten', onClick: () => setEditObjId(ctxId) });
        items.push({ separator: true } as const);
        items.push({ icon: <Copy size={13} />, label: 'Datenpunkt kopieren', onClick: () => setCopySourceId(ctxId) });
        if (!ctxId.startsWith('alias.0.')) {
          items.push({ icon: <Link2 size={13} />, label: 'Alias anlegen', onClick: () => setAliasSourceId(ctxId) });
        }
        items.push({ separator: true } as const);
        items.push({ icon: <Trash2 size={13} />, label: 'Datenpunkt löschen', onClick: () => setDeletingId(ctxId), danger: true });
        return <ContextMenu x={x} y={y} items={items} onClose={() => setCtxMenu(null)} />;
      })()}

      <div ref={containerRef} onScroll={handleBodyScroll} className="overflow-x-auto overflow-y-auto flex-1">
        <table className="text-sm text-left table-fixed" style={{ width: totalWidth }}>
          <thead ref={theadRef} className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {show('checkbox') && <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} />}
              {show('write')   && <th style={{ width: colWidths['write'],   minWidth: colWidths['write']   }} />}
              {show('history') && <th style={{ width: colWidths['history'], minWidth: colWidths['history'] }} />}
              {show('smart')   && <th style={{ width: colWidths['smart'],   minWidth: colWidths['smart']   }} />}
              {show('alias')   && <th style={{ width: w('alias'),           minWidth: w('alias')           }} />}
              {show('id')      && <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('id')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('name')    && <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('name')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('room')     && <SortHeader label="Raum"     sortKey="room"     activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('room')}     onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('function') && <SortHeader label="Funktion" sortKey="function" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('function')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('role')    && <SortHeader label="Rolle" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('role')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('value')   && <SortHeader label="Wert" sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('value')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} className="text-right" />}
              {show('unit')    && <SortHeader label="Einheit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('unit')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('ack')     && <SortHeader label="Ack" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ack')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              {show('ts')      && <SortHeader label="Letztes Update" sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ts')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} />}
              <th style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
            </tr>
            <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {show('checkbox') && (
                <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                  <StyledCheckbox
                    checked={allOnPageChecked}
                    indeterminate={someChecked && !allOnPageChecked}
                    onChange={toggleCheckAll}
                    title="Alle auswählen"
                  />
                </th>
              )}
              {(['write','history','smart','alias','id','name','room','function','role','value','unit','ack','ts'] as SortKey[]).filter(show).map((key) => {
                const filterable = ['id','name','room','function','role','value','unit'].includes(key);
                const isIconToggle = ['write','history','smart','alias'].includes(key);
                const isActive = colFilters[key] === '1';

                if (isIconToggle) {
                  const icon = key === 'write'
                    ? <Lock size={11} />
                    : key === 'history'
                    ? <History size={11} />
                    : key === 'alias'
                    ? <Link2 size={11} />
                    : <Mic2 size={11} />;
                  const activeClass = key === 'write'
                    ? 'text-gray-500 dark:text-gray-300 bg-gray-300/60 dark:bg-gray-500/40'
                    : key === 'history'
                    ? 'text-blue-500 bg-blue-500/20'
                    : key === 'alias'
                    ? 'text-amber-500 bg-amber-500/20'
                    : 'text-violet-500 bg-violet-500/20';
                  const title = key === 'write' ? 'Nur Schreibgeschützte' : key === 'history' ? 'Nur mit History' : key === 'alias' ? 'Nur mit Alias' : 'Nur mit SmartName';
                  return (
                    <th key={key} style={{ width: w(key) }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onColFilterChange({ ...colFilters, [key]: isActive ? '' : '1' })}
                        title={title}
                        className={`p-0.5 rounded transition-colors ${isActive ? activeClass : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'}`}
                      >
                        {icon}
                      </button>
                    </th>
                  );
                }

                return (
                  <th key={key} style={{ width: w(key) }} className="px-2 py-1 normal-case font-normal align-middle">
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
              <th style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
            </tr>
          </thead>
          <tbody>
            {filteredIds.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 3} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  {ids.length === 0
                    ? 'Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.'
                    : 'Keine Einträge entsprechen den gesetzten Filtern.'}
                </td>
              </tr>
            )}
            {topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={rowColSpan} style={{ height: topSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleRowIds.map((id) => (
              <StateRow
                key={id}
                id={id}
                state={states[id]}
                obj={objects[id]}
                roomName={roomMap[id] || ''}
                fnName={functionMap[id] || ''}
                isSelected={selectedId === id}
                isChecked={checkedIds.has(id)}
                aliasIds={aliasMap?.get(id)}
                visibleCols={visibleCols}
                colWidths={colWidths}
                roles={roles}
                units={units}
                roomEnums={roomEnums}
                fnEnums={fnEnums}
                onSelect={onSelect}
                onCheck={handleCheckRow}
                onContextMenu={handleRowContextMenu}
                onHistoryClick={handleRowHistoryClick}
                onNavigateTo={onNavigateTo}
                onDeleteClick={handleRowDeleteClick}
                onSelectRoom={handleSelectRoom}
                onSelectFunction={handleSelectFunction}
                roomEditForced={roomEditId === id}
                fnEditForced={fnEditId === id}
                onRoomEditEnd={handleRoomEditEnd}
                onFnEditEnd={handleFnEditEnd}
              />
            ))}
            {bottomSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={rowColSpan} style={{ height: bottomSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(StateList);
