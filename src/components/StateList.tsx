import React, { useState, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Check, X, Copy, ArrowUp, ArrowDown, SlidersHorizontal, History, Mic2, Maximize2, Trash2, Plus, Minus, Lock, Search, Link2, FileEdit, Download, ChevronDown, ChevronRight, RefreshCw, CalendarDays, Wrench, Zap, PenLine, FolderInput, Home, Upload, RotateCcw, Tag, FolderOpen } from 'lucide-react';
import { useExtendObject, useAllRoles, useAllUnits, useDeleteObject, useSetState, useRoomEnums, useUpdateRoomMembership, useUpdateRoomMembershipBatch, useFunctionEnums, useUpdateFunctionMembership, useUpdateFunctionMembershipBatch } from '../hooks/useStates';
import ContextMenu from './ContextMenu';
import type { ContextMenuEntry } from './ContextMenu';
import NewDatapointModal from './NewDatapointModal';
import ImportDatapointsModal from './ImportDatapointsModal';
import ObjectEditModal from './ObjectEditModal';
import CreateAliasModal from './CreateAliasModal';
import CopyDatapointModal from './CopyDatapointModal';
import RenameDatapointModal from './RenameDatapointModal';
import MoveDatapointModal from './MoveDatapointModal';
import HistoryModal from './HistoryModal';
import ConfirmDialog from './ConfirmDialog';
import MultiDeleteDialog from './MultiDeleteDialog';
import ValueEditModal from './ValueEditModal';
import { hasHistory, isGlobPattern } from '../api/iobroker';
import type { IoBrokerState, IoBrokerObject } from '../types/iobroker';
import { copyText } from '../utils/clipboard';
import { ColoredId } from '../utils/coloredId';
import { getTypeColor } from '../utils/typeColor';
import { getRoleColor } from '../utils/roleColor';
import { useToast } from '../context/ToastContext';

export interface StateListHandle {
  fitToContainer: () => void;
}

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
  allObjectIds?: Set<string>;
  onNavigateTo?: (ids: string[]) => void;
  exportIds?: string[];
  treeFilter?: string | null;
  onClearTreeFilter?: () => void;
  sidebarToggleSeq?: number;
  onManualRefresh?: () => void;
  fulltextEnabled?: boolean;
  dateFormat?: DateFormatSetting;
  settingsVisibleCols?: SortKey[];
  language?: 'en' | 'de';
  expertMode?: boolean;
  onToggleExpertMode?: () => void;
  toolbarLabels?: boolean;
  onToggleToolbarLabels?: () => void;
  onOpenEnumManager?: () => void;
  onOpenAliasReplace?: (initialStr?: string) => void;
  tableFontSize?: 'small' | 'normal' | 'large' | 'xl';
  showDesc?: boolean;
  groupByPath?: boolean;
  onToggleGroupByPath?: () => void;
  customDefaultWidths?: Partial<Record<SortKey, number>>;
  customMaxWidths?: Partial<Record<SortKey, number>>;
}

function formatTimestamp(ts: number, dateFormat: DateFormatSetting): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const day = p(d.getDate());
  const month = p(d.getMonth() + 1);
  const year = d.getFullYear();
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  if (dateFormat === 'iso') return `${year}-${month}-${day} ${time}`;
  if (dateFormat === 'us') return `${month}/${day}/${year} ${time}`;
  return `${day}.${month}.${year} ${time}`;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function getThresholdStatus(
  val: unknown,
  min: number | undefined,
  max: number | undefined,
): 'exceeded' | 'warn' | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (min === undefined && max === undefined) return null;

  if ((max !== undefined && val > max) || (min !== undefined && val < min)) return 'exceeded';

  if (min !== undefined && max !== undefined && max > min) {
    const warnZone = (max - min) * 0.1;
    if (val <= min + warnZone || val >= max - warnZone) return 'warn';
  }

  return null;
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

function resolveI18n(val: string | Record<string, string> | undefined): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  return val.de || val.en || Object.values(val)[0] || undefined;
}

const EditableNameCell = React.memo(function EditableNameCell({ id, name, desc, showDesc = true }: { id: string; name: string; desc?: string; showDesc?: boolean }) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const extend = useExtendObject();

  const [copied, setCopied] = useState(false);

  if (!editing) {
    return (
      <td data-col="name" className="px-3 py-2 overflow-hidden group/name">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="truncate" title={name}>{name}</div>
            {showDesc && <div className={`truncate text-[10px] italic text-gray-400 dark:text-gray-500 leading-tight ${desc ? 'mt-1' : 'h-0 overflow-hidden'}`} title={desc}>{desc || '.'}</div>}
          </div>
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
              extend.mutate({ id, common: { name: draft } }, { onError: (err) => showToast('Speichern fehlgeschlagen: ' + String(err)) });
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
            extend.mutate({ id, common: { name: draft } }, { onError: (err) => showToast('Speichern fehlgeschlagen: ' + String(err)) });
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
});

const EditableRoleCell = React.memo(function EditableRoleCell({ id, role, suggestions, language = 'en' }: { id: string; role: string; suggestions: string[]; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();
  const showToast = useToast();

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
    extend.mutate({ id, common: { role: val } }, { onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)) });
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
            <span className={`truncate font-semibold ${getRoleColor(role)}`} title={role}>{role}</span>
            <Pencil size={12} className="opacity-0 group-hover/role:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic font-sans">{isEn ? 'Select role…' : 'Rolle wählen…'}</span>
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
                placeholder={isEn ? 'Filter…' : 'Filtern…'}
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? `Use "${filter.trim()}"` : `„${filter.trim()}" verwenden`}
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
});

const EditableUnitCell = React.memo(function EditableUnitCell({ id, unit, suggestions, language = 'en' }: { id: string; unit: string; suggestions: string[]; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();
  const showToast = useToast();

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
    extend.mutate({ id, common: { unit: val } }, { onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)) });
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
        {unit && <span className="truncate min-w-0" title={unit}>{unit}</span>}
        <Pencil size={12} className="opacity-0 group-hover/unit:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
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
                placeholder={isEn ? 'Filter…' : 'Filtern…'}
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? `Use "${filter.trim()}"` : `„${filter.trim()}" verwenden`}
                </li>
              )}
              {unit && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(''); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? '- empty -' : '— leer —'}
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
});


const EditableTypeCell = React.memo(function EditableTypeCell({ id, typeValue, language = 'en' }: { id: string; typeValue: string; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();
  const showToast = useToast();

  const filtered = filter
    ? TYPE_OPTIONS.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
    : TYPE_OPTIONS;

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
    const trimmed = val.trim();
    extend.mutate({ id, common: { type: trimmed || undefined } }, { onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)) });
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="type"
      className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs font-mono overflow-hidden group/type"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {typeValue ? (
          <>
            <span className={`truncate font-semibold ${getTypeColor(typeValue)}`} title={typeValue}>{typeValue}</span>
            <Pencil size={12} className="opacity-0 group-hover/type:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
          </>
        ) : (
          <span className="text-gray-300 dark:text-gray-600 italic font-sans">{isEn ? 'Select type…' : 'Typ wählen…'}</span>
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
                placeholder={isEn ? 'Filter…' : 'Filtern…'}
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? `Use "${filter.trim()}"` : `„${filter.trim()}" verwenden`}
                </li>
              )}
              {typeValue && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(''); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? '- empty -' : '— leer —'}
                </li>
              )}
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  onMouseEnter={() => setActiveIndex(i)}
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
});

const EditableValueCell = React.memo(function EditableValueCell({
  id,
  state,
  obj,
  expertMode = false,
  onOpen,
  language = 'en',
}: {
  id: string;
  state: IoBrokerState | undefined;
  obj: IoBrokerObject | undefined;
  expertMode?: boolean;
  onOpen: (id: string) => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
  const setStateVal = useSetState();
  const prevValRef = useRef<unknown>(undefined);
  const val = state?.val;
  const isNull = val === null || val === undefined;
  const isBoolean = typeof val === 'boolean';
  const isNumber = typeof val === 'number';
  const role = obj?.common?.role ?? '';
  const isWritable = obj?.common?.write === true;
  const isSwitch = role === 'switch' || role.startsWith('switch.');
  const isButton = role === 'button' || role.startsWith('button.');

  const thresholdStatus = isNumber
    ? getThresholdStatus(val, obj?.common?.min, obj?.common?.max)
    : null;

  let valueColor = 'text-gray-900 dark:text-white';
  if (isNull) valueColor = 'text-gray-300 dark:text-gray-600';
  else if (isBoolean) valueColor = val ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  else if (thresholdStatus === 'exceeded') valueColor = 'text-red-600 dark:text-red-400 font-semibold';
  else if (thresholdStatus === 'warn') valueColor = 'text-yellow-600 dark:text-yellow-400';

  let trendIcon: React.ReactNode = null;
  const prev = prevValRef.current;
  if (isNumber && prev !== undefined && prev !== val) {
    trendIcon = (val as number) > (prev as number)
      ? <ArrowUp size={10} className="text-green-500 dark:text-green-400 shrink-0" />
      : <ArrowDown size={10} className="text-red-400 dark:text-red-400 shrink-0" />;
  }
  prevValRef.current = val;

  if (!expertMode && state && (isSwitch || isButton)) {
    return (
      <td data-col="value" className="px-3 py-1.5 text-left overflow-hidden whitespace-nowrap group/value" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-start gap-1.5">
          {isSwitch ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isWritable) return;
                setStateVal.mutate({ id, val: !Boolean(state.val) });
              }}
              disabled={setStateVal.isPending || !isWritable}
              title={isWritable ? (isEn ? 'Toggle value' : 'Wert umschalten') : (isEn ? 'Read only' : 'Schreibgeschützt')}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                Boolean(state.val) ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
              } ${(setStateVal.isPending || !isWritable) ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 mt-[3px] rounded-full bg-white shadow transition-transform ${Boolean(state.val) ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isWritable) return;
                setStateVal.mutate({ id, val: true });
              }}
              disabled={setStateVal.isPending || !isWritable}
              title={isEn ? 'Trigger' : 'Auslösen'}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 transition-colors"
            >
              <Zap size={12} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(id); }}
            className="opacity-0 group-hover/value:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
            title={isEn ? 'Edit value' : 'Wert bearbeiten'}
          >
            <Pencil size={12} />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      data-col="value"
      className="px-3 py-2 text-xs text-left font-mono overflow-hidden whitespace-nowrap group/value"
      onClick={(e) => { e.stopPropagation(); onOpen(id); }}
    >
      <div className={`flex items-center justify-start gap-1 ${valueColor}`}>
        {trendIcon}
        {state ? (() => {
          const v = formatValue(val);
          const truncated = v.length > 16 ? v.slice(0, 16) + '…' : v;
          return <span title={v}>{truncated}</span>;
        })() : <span className="text-gray-300 dark:text-gray-600">…</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(id); }}
          className="opacity-0 group-hover/value:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
          title={isEn ? 'Edit value' : 'Wert bearbeiten'}
        >
          <Pencil size={12} />
        </button>
      </div>
    </td>
  );
});


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

const EditableRoomCell = React.memo(function EditableRoomCell({ id, currentRoomEnumId, roomName, roomEnums, onSelectRoom, forceEdit, onEditEnd, language = 'en' }: {
  id: string;
  currentRoomEnumId: string | null;
  roomName: string;
  roomEnums: { id: string; name: string }[];
  onSelectRoom: (objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => void;
  forceEdit?: boolean;
  onEditEnd?: () => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
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
        {roomName && <span className="truncate min-w-0" title={roomName}>{roomName}</span>}
        <Pencil
          size={12}
          className="opacity-0 group-hover/room:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
        />
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
                {isEn ? 'No room' : 'Kein Raum'}
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
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{isEn ? 'Loading…' : 'Lädt…'}</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
});

const EditableFunctionCell = React.memo(function EditableFunctionCell({ id, currentFnEnumId, fnName, fnEnums, onSelectFunction, forceEdit, onEditEnd, language = 'en' }: {
  id: string;
  currentFnEnumId: string | null;
  fnName: string;
  fnEnums: { id: string; name: string }[];
  onSelectFunction: (objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => void;
  forceEdit?: boolean;
  onEditEnd?: () => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
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
        {fnName && <span className="truncate min-w-0" title={fnName}>{fnName}</span>}
        <Pencil
          size={12}
          className="opacity-0 group-hover/fn:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity"
        />
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
                {isEn ? 'No function' : 'Keine Funktion'}
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
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{isEn ? 'Loading…' : 'Lädt…'}</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
});

function BatchComboControl({
  value,
  onChange,
  placeholder,
  options,
  className = '',
  language = 'en',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  className?: string;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const source = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return source.slice(0, 80);
  }, [options, value]);

  function openMenu() {
    if (!anchorRef.current) return;
    setRect(anchorRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <div
        ref={anchorRef}
        className={`h-7 px-2 text-xs font-normal rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 focus-within:outline-none focus-within:ring-1 focus-within:ring-blue-400 transition-colors flex items-center justify-between gap-2 ${className}`}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={openMenu}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }}
          className={`shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${value.trim() ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label={isEn ? `Clear ${placeholder}` : `${placeholder} leeren`}
        >
          <X size={12} />
        </button>
        <button
          type="button"
          onClick={open ? closeMenu : openMenu}
          className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label={isEn ? `Open ${placeholder}` : `${placeholder} öffnen`}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={closeMenu} />
          <div
            style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 9999, minWidth: rect.width }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length > 0 ? (
                filtered.map((opt) => (
                  <li
                    key={opt}
                    onMouseDown={(e) => { e.preventDefault(); onChange(opt); closeMenu(); }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${
                      value === opt
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {opt}
                  </li>
                ))
              ) : (
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{isEn ? 'No matches' : 'Keine Treffer'}</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function parseTsFilter(raw: string): { mode: 'none' | 'text' | 'range'; text?: string; from?: number; to?: number } {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: 'none' };
  if (trimmed.startsWith(TS_RANGE_PREFIX)) {
    const payload = trimmed.slice(TS_RANGE_PREFIX.length);
    const [fromRaw = '', toRaw = ''] = payload.split(TS_RANGE_SEP);
    const from = fromRaw ? Date.parse(fromRaw) : NaN;
    const to = toRaw ? Date.parse(toRaw) : NaN;
    return {
      mode: 'range',
      from: Number.isFinite(from) ? from : undefined,
      to: Number.isFinite(to) ? to : undefined,
    };
  }
  return { mode: 'text', text: trimmed.toLowerCase() };
}

function encodeTsRangeFilter(from: string, to: string): string {
  if (!from && !to) return '';
  return `${TS_RANGE_PREFIX}${from}${TS_RANGE_SEP}${to}`;
}

function TsRangeFilterControl({
  value,
  onChange,
  language = 'en',
}: {
  value: string;
  onChange: (value: string) => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const payload = value.startsWith(TS_RANGE_PREFIX) ? value.slice(TS_RANGE_PREFIX.length) : '';
  const [from = '', to = ''] = payload.split(TS_RANGE_SEP);
  const hasRange = !!from || !!to;

  function openMenu() {
    if (!anchorRef.current) return;
    setRect(anchorRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  const summary = hasRange
    ? `${from ? from.replace('T', ' ') : '…'} - ${to ? to.replace('T', ' ') : '…'}`
    : (isEn ? 'Filter…' : 'Filtern…');

  return (
    <>
      <div
        ref={anchorRef}
        className="h-7 px-2 text-xs font-normal rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 focus-within:outline-none focus-within:ring-1 focus-within:ring-blue-400 transition-colors flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={open ? closeMenu : openMenu}
          className={`flex-1 min-w-0 text-left truncate ${hasRange ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}
          aria-label={isEn ? 'Open date filter' : 'Datumsfilter öffnen'}
        >
          {summary}
        </button>
        <CalendarDays size={12} className="shrink-0 text-gray-400 dark:text-gray-500" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }}
          className={`shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${hasRange ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label={isEn ? 'Clear date filter' : 'Datumsfilter leeren'}
        >
          <X size={12} />
        </button>
      </div>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={closeMenu} />
          <div
            style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 9999, minWidth: Math.max(260, rect.width) }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg p-2"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'From' : 'Von'}</span>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => onChange(encodeTsRangeFilter(e.target.value, to))}
                  className="w-full bg-gray-50/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'To' : 'Bis'}</span>
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => onChange(encodeTsRangeFilter(from, e.target.value))}
                  className="w-full bg-gray-50/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export type { SortKey, DateFormatSetting } from './stateListColumns';
export { ALL_COLUMNS, getColumnLabel, DEFAULT_COLS } from './stateListColumns';
import type { SortKey, DateFormatSetting } from './stateListColumns';
import { DEFAULT_COLS, getColumnLabel as _getColumnLabel, BUILTIN_DEFAULT_WIDTHS, BUILTIN_MAX_WIDTHS } from './stateListColumns';
const getColumnLabel = _getColumnLabel;
const LS_KEY = 'iobroker-visible-cols';

function loadVisibleCols(): SortKey[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsedCols: unknown = JSON.parse(raw);
      const parsed = Array.isArray(parsedCols) ? parsedCols as unknown[] : [];
      const valid = parsed.filter((k): k is SortKey => typeof k === 'string' && ALL_COLUMNS.some((c) => c.key === k));
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
const TYPE_OPTIONS = ['number', 'string', 'boolean', 'array', 'object', 'mixed'] as const;
const TS_RANGE_PREFIX = 'range:';
const TS_RANGE_SEP = '|~|';
const MIN_COL_WIDTHS: Partial<Record<SortKey, number>> = { id: 150, name: 120 };
function minColWidth(key: SortKey) { return MIN_COL_WIDTHS[key] ?? 40; }
const LS_WIDTHS_KEY = 'iobroker-col-widths';

function clampColWidthsWith(
  widths: Record<SortKey, number>,
  effectiveMax: Partial<Record<SortKey, number>>,
): Record<SortKey, number> {
  const result = { ...widths };
  for (const k of Object.keys(result) as SortKey[]) {
    const mx = effectiveMax[k] ?? Infinity;
    result[k] = Math.min(mx, Math.max(minColWidth(k), result[k]));
  }
  return result;
}

function loadColWidths(
  effectiveDefaults: Record<SortKey, number>,
  effectiveMax: Partial<Record<SortKey, number>>,
): Record<SortKey, number> {
  try {
    const raw = localStorage.getItem(LS_WIDTHS_KEY);
    if (raw) {
      const parsedWidths: unknown = JSON.parse(raw);
      if (typeof parsedWidths === 'object' && parsedWidths !== null && !Array.isArray(parsedWidths)) {
        const validated = Object.fromEntries(
          Object.entries(parsedWidths as Record<string, unknown>)
            .filter(([k, v]) => ALL_COLUMNS.some((c) => c.key === k) && typeof v === 'number')
            .map(([k, v]) => [k, v as number])
        ) as Partial<Record<SortKey, number>>;
        return clampColWidthsWith({ ...effectiveDefaults, ...validated }, effectiveMax);
      }
    }
  } catch { /* ignore */ }
  return clampColWidthsWith({ ...effectiveDefaults }, effectiveMax);
}

function hasSmartName(obj: IoBrokerObject | undefined): boolean {
  if (!obj) return false;
  const sn = obj.common?.smartName;
  if (!sn) return false;
  if (typeof sn === 'string') return sn.trim().length > 0;
  if (typeof sn === 'object') return Object.values(sn).some((v) => v && String(v).trim().length > 0);
  return false;
}

function ColPicker({ visible, onChange, language = 'de' }: { visible: SortKey[]; onChange: (cols: SortKey[]) => void; language?: 'en' | 'de' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isEn = language === 'en';

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
        title={isEn ? 'Configure columns' : 'Spalten konfigurieren'}
        className={`p-1.5 rounded-lg transition-colors ${open ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700'}`}
      >
        <SlidersHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[140px]">
          {ALL_COLUMNS.map(({ key }) => (
            <div
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 select-none"
            >
              <StyledCheckbox checked={visible.includes(key)} onChange={() => toggle(key)} />
              {getColumnLabel(key, language)}
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

function SortHeader({ label, sortKey, activeKey, dir, onSort, width, onResizeStart, onAutoFit, onHide, className }: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent, key: SortKey) => void;
  onAutoFit: (key: SortKey) => void;
  onHide?: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th
      data-col={sortKey}
      style={{ width, minWidth: 40 }}
      className={`group/hdr relative px-3 py-2 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 overflow-hidden ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        <span className="truncate">{label}</span>
        {active && (dir === 'asc' ? <ArrowUp size={12} className="shrink-0" /> : <ArrowDown size={12} className="shrink-0" />)}
        {onHide && (
          <button
            className="ml-auto shrink-0 opacity-0 group-hover/hdr:opacity-100 transition-opacity text-gray-400 hover:text-red-400 dark:hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); onHide(sortKey); }}
            title="Hide column"
            tabIndex={-1}
          >
            <Minus size={10} />
          </button>
        )}
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
  ownTargetExists: boolean;
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
  onOpenValueModal: (id: string) => void;
  roomEditForced: boolean;
  fnEditForced: boolean;
  onRoomEditEnd: () => void;
  onFnEditEnd: () => void;
  dateFormat: DateFormatSetting;
  language: 'en' | 'de';
  expertMode: boolean;
  isFocused: boolean;
  showDesc?: boolean;
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
  isSelected, isChecked, aliasIds, ownTargetExists,
  visibleCols, colWidths, roles, units, roomEnums, fnEnums,
  onSelect, onCheck, onContextMenu, onHistoryClick, onNavigateTo, onDeleteClick,
  onSelectRoom, onSelectFunction, onOpenValueModal,
  roomEditForced, fnEditForced, onRoomEditEnd, onFnEditEnd,
  dateFormat, language, expertMode, isFocused, showDesc = true,
}: StateRowProps) {
  const isEn = language === 'en';
  const show = (key: SortKey) => visibleCols.includes(key);
  const w = (key: SortKey) => colWidths[key];
  const unit = obj?.common?.unit || '';
  const name = getObjectName(obj);
  const roomEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.rooms.')) ?? null;
  const fnEnumId = Object.keys(obj?.enums ?? {}).find(k => k.startsWith('enum.functions.')) ?? null;
  const rawOwnTarget = obj?.common?.alias?.id;
  const ownTarget = typeof rawOwnTarget === 'object' ? (rawOwnTarget?.read ?? rawOwnTarget?.write) : rawOwnTarget;
  const isAliasObject = id.startsWith('alias.0.');
  const danglingAlias = isAliasObject && !ownTarget;
  const hasAlias = (aliasIds && aliasIds.length > 0) || !!ownTarget || danglingAlias;
  const aliasTooltip = aliasIds?.length
    ? `Alias: ${aliasIds.join(', ')}`
    : ownTarget
      ? `${isEn ? 'Source' : 'Quelle'}: ${ownTarget}`
      : danglingAlias
        ? (isEn ? 'Alias without source' : 'Alias ohne Quelle')
        : undefined;

  return (
    <tr
      onClick={() => onSelect(id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY, id); }}
      className={`border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-600/20 text-blue-700 dark:text-blue-200'
          : isFocused
            ? 'bg-blue-100/60 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100 outline outline-1 -outline-offset-1 outline-blue-400 dark:outline-blue-500'
            : isChecked
              ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
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
        <td style={{ width: colWidths['write'], minWidth: colWidths['write'] }} className="py-2 align-middle" title={obj?.common?.write === false ? 'Read-only' : undefined}>
          <div className="flex items-center justify-center">
            {obj?.common?.write === false && <Lock size={13} className="text-red-500 dark:text-red-400" />}
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
                <History size={15} />
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
                <Mic2 size={15} className="text-violet-500 dark:text-violet-400" />
              </span>
            )}
          </div>
        </td>
      )}
      {show('alias') && (
        <td style={{ width: w('alias'), minWidth: w('alias') }} className="py-2 align-middle">
          <div className="flex items-center justify-center">
            {danglingAlias && (
              <span
                title={aliasTooltip}
                className="relative p-0.5 rounded text-red-500 dark:text-red-400"
              >
                <Link2 size={15} />
              </span>
            )}
            {hasAlias && !danglingAlias && (
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
                <Link2 size={15} />
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
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <ColoredId id={id} />
              <CopyIdButton id={id} />
            </div>
            {!!onNavigateTo && (
              <div className={`text-[10px] leading-4 text-gray-400 dark:text-gray-500 truncate ${!(ownTarget || (aliasIds && aliasIds.length > 0)) ? 'invisible' : ''}`}>
                {ownTarget && (
                  <>
                    <span className="mr-1">{isEn ? 'Source:' : 'Quelle:'}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateTo([ownTarget]); }}
                      className={`font-mono underline decoration-dotted ${ownTargetExists ? 'hover:text-blue-500 dark:hover:text-blue-400' : 'text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300'}`}
                      title={ownTargetExists ? ownTarget : `${ownTarget} (${isEn ? 'target does not exist' : 'Ziel existiert nicht'})`}
                    >
                      {ownTarget}
                    </button>
                  </>
                )}
                {ownTarget && aliasIds && aliasIds.length > 0 && <span className="mx-1">|</span>}
                {aliasIds && aliasIds.length > 0 && (
                  <>
                    <span className="mr-1">{isEn ? 'Target:' : 'Ziel:'}</span>
                    {aliasIds.map((aid, idx) => (
                      <React.Fragment key={aid}>
                        {idx > 0 && <span>, </span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateTo([aid]); }}
                          className="font-mono underline decoration-dotted hover:text-blue-500 dark:hover:text-blue-400"
                          title={aid}
                        >
                          {aid}
                        </button>
                      </React.Fragment>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </td>
      )}
      {show('name') && <EditableNameCell id={id} name={name} desc={resolveI18n(obj?.common?.desc)} showDesc={showDesc} />}
      {show('room') && (
        <EditableRoomCell
          id={id}
          currentRoomEnumId={roomEnumId}
          roomName={roomName}
          roomEnums={roomEnums}
          onSelectRoom={onSelectRoom}
          forceEdit={roomEditForced}
          onEditEnd={onRoomEditEnd}
          language={language}
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
          language={language}
        />
      )}
      {show('type') && <EditableTypeCell id={id} typeValue={obj?.common?.type || ''} language={language} />}
      {show('role') && <EditableRoleCell id={id} role={obj?.common?.role || ''} suggestions={roles} language={language} />}
      {show('value') && <EditableValueCell id={id} state={state} obj={obj} expertMode={expertMode} onOpen={onOpenValueModal} language={language} />}
      {show('unit') && <EditableUnitCell id={id} unit={unit} suggestions={units} language={language} />}
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
        <td data-col="ts" className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs font-mono overflow-hidden">
          <span className="truncate block">{state ? formatTimestamp(state.ts, dateFormat) : ''}</span>
        </td>
      )}
      <td style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} className="py-1 pr-2 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDeleteClick(id)}
          title="Delete datapoint"
          className={`p-1 rounded transition-colors hover:bg-red-500/10 ${isChecked ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400'}`}
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
    prev.ownTargetExists === next.ownTargetExists &&
    prev.visibleCols === next.visibleCols &&
    prev.colWidths === next.colWidths &&
    prev.roles === next.roles &&
    prev.units === next.units &&
    prev.roomEnums === next.roomEnums &&
    prev.fnEnums === next.fnEnums &&
    prev.roomEditForced === next.roomEditForced &&
    prev.fnEditForced === next.fnEditForced &&
    prev.dateFormat === next.dateFormat &&
    prev.language === next.language &&
    prev.expertMode === next.expertMode &&
    prev.onNavigateTo === next.onNavigateTo &&
    prev.onSelectRoom === next.onSelectRoom &&
    prev.onSelectFunction === next.onSelectFunction &&
    prev.onOpenValueModal === next.onOpenValueModal &&
    prev.isFocused === next.isFocused
  );
});

function StateList({ ids, states, objects, roomMap, functionMap, selectedId, onSelect, colFilters, onColFilterChange, pattern = '*', aliasMap, allObjectIds, onNavigateTo, exportIds, treeFilter, onClearTreeFilter, sidebarToggleSeq, onManualRefresh, fulltextEnabled = true, dateFormat = 'de', settingsVisibleCols, language = 'en', expertMode = false, onToggleExpertMode, toolbarLabels = true, onOpenEnumManager, onOpenAliasReplace, tableFontSize = 'normal', showDesc = true, groupByPath = false, onToggleGroupByPath, customDefaultWidths, customMaxWidths }: StateListProps, ref: React.ForwardedRef<StateListHandle>) {
  const effectiveDefaults: Record<SortKey, number> = { ...BUILTIN_DEFAULT_WIDTHS, ...(customDefaultWidths ?? {}) };
  const effectiveMax: Partial<Record<SortKey, number>> = { ...BUILTIN_MAX_WIDTHS, ...(customMaxWidths ?? {}) };
  const effectiveMaxRef = useRef(effectiveMax);
  effectiveMaxRef.current = effectiveMax;
  const isEn = language === 'en';
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(loadVisibleCols);
  const [colWidths, setColWidths] = useState<Record<SortKey, number>>(() => loadColWidths(effectiveDefaults, effectiveMax));
  const containerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const autoFitRef = useRef(true);
  const saveWidthsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const isFilterActive = !!(pattern && pattern !== '*') || !!treeFilter;
  // null = "all collapsed". new Set() = all expanded.
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Set<string> | null>(() => isFilterActive ? null : new Set());
  useEffect(() => {
    setCollapsedPrefixes(isFilterActive ? null : new Set());
  }, [isFilterActive]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [newDatapointOpen, setNewDatapointOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [valueEditId, setValueEditId] = useState<string | null>(null);
  const [confirmResetLs, setConfirmResetLs] = useState(false);
  const showToolbarLabels = toolbarLabels;
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [multiDeleteOpen, setMultiDeleteOpen] = useState(false);
  const [colFiltersDraft, setColFiltersDraft] = useState<Partial<Record<SortKey, string>>>(colFilters);
  const colFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propagatingRef = useRef(false);
  const showToast = useToast();
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
  const [renameId, setRenameId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [editObjId, setEditObjId] = useState<string | null>(null);
  const updateRoomMutateRef = useRef(updateRoom.mutate);
  const updateFnMutateRef = useRef(updateFn.mutate);

  useEffect(() => {
    updateRoomMutateRef.current = updateRoom.mutate;
  }, [updateRoom.mutate]);

  useEffect(() => {
    updateFnMutateRef.current = updateFn.mutate;
  }, [updateFn.mutate]);

  function handleColChange(cols: SortKey[]) {
    setVisibleCols(cols);
    localStorage.setItem(LS_KEY, JSON.stringify(cols));
  }

  function handleHideCol(key: SortKey) {
    handleColChange(visibleCols.filter((k) => k !== key));
  }

  function handleResizeStart(e: React.MouseEvent, key: SortKey) {
    const startX = e.clientX;
    const startWidth = colWidths[key];
    let latestWidths: Record<SortKey, number> = colWidths;

    function clampWidth(w: number) {
      return Math.min(effectiveMaxRef.current[key] ?? Infinity, Math.max(minColWidth(key), w));
    }

    function onMouseMove(ev: MouseEvent) {
      const newWidth = clampWidth(startWidth + ev.clientX - startX);
      setColWidths((prev) => {
        latestWidths = { ...prev, [key]: newWidth };
        return latestWidths;
      });
      if (saveWidthsTimerRef.current !== null) clearTimeout(saveWidthsTimerRef.current);
      saveWidthsTimerRef.current = setTimeout(() => {
        localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(latestWidths));
        saveWidthsTimerRef.current = null;
      }, 500);
    }

    function onMouseUp(ev: MouseEvent) {
      if (saveWidthsTimerRef.current !== null) {
        clearTimeout(saveWidthsTimerRef.current);
        saveWidthsTimerRef.current = null;
      }
      const newWidth = clampWidth(startWidth + ev.clientX - startX);
      const finalWidths = { ...latestWidths, [key]: newWidth };
      setColWidths(finalWidths);
      localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(finalWidths));
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
    const next = { ...colWidths };

    // Iteratively lock columns that hit their maxColWidth, redistribute remaining
    // space to uncapped columns. Columns with no defined max expand freely.
    const capped = new Set<SortKey>();
    let remaining = available;
    let prevSize = -1;
    while (capped.size !== prevSize) {
      prevSize = capped.size;
      const free = scalable.filter((k) => !capped.has(k));
      const freeTotal = free.reduce((sum, k) => sum + colWidths[k], 0);
      if (freeTotal === 0) break;
      const scale = remaining / freeTotal;
      for (const k of free) {
        const max = effectiveMax[k] ?? Infinity;
        if (max !== Infinity && colWidths[k] * scale >= max) {
          next[k] = max;
          capped.add(k);
        }
      }
      remaining = available - scalable.filter((k) => capped.has(k)).reduce((sum, k) => sum + next[k], 0);
    }

    // Distribute remaining space proportionally among uncapped columns
    const free = scalable.filter((k) => !capped.has(k));
    if (free.length > 0) {
      const freeTotal = free.reduce((sum, k) => sum + colWidths[k], 0);
      const scale = freeTotal > 0 ? remaining / freeTotal : 0;
      let allocated = 0;
      for (let i = 0; i < free.length; i++) {
        const k = free[i];
        if (i === free.length - 1) {
          next[k] = Math.max(minColWidth(k), remaining - allocated);
        } else {
          const w = Math.max(minColWidth(k), Math.floor(colWidths[k] * scale));
          next[k] = w;
          allocated += w;
        }
      }
    }

    // Icon cols stay at their fixed default width — never modified by fitToContainer
    for (const k of ICON_COLS) {
      next[k] = effectiveDefaults[k];
    }
    setColWidths(next);
    localStorage.setItem(LS_WIDTHS_KEY, JSON.stringify(next));
  }

  useImperativeHandle(ref, () => ({ fitToContainer }), []);

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
    if (!settingsVisibleCols || settingsVisibleCols.length === 0) return;
    setVisibleCols(settingsVisibleCols);
    localStorage.setItem(LS_KEY, JSON.stringify(settingsVisibleCols));
  }, [settingsVisibleCols]);

  // Sync external colFilters → draft (e.g. context menu, clear from App.tsx)
  useEffect(() => {
    if (propagatingRef.current) return;
    setColFiltersDraft(colFilters);
  }, [colFilters]);

  useEffect(() => {
    if (fulltextEnabled && pattern && !isGlobPattern(pattern) && pattern !== '*') {
      setSortKey('relevanz');
      setSortDir('asc');
    } else {
      setSortKey('id');
      setSortDir('asc');
    }
  }, [pattern]);

  function setDraftAndDebounce(draft: Partial<Record<SortKey, string>>) {
    setColFiltersDraft(draft);
    if (colFilterDebounceRef.current) clearTimeout(colFilterDebounceRef.current);
    colFilterDebounceRef.current = setTimeout(() => {
      colFilterDebounceRef.current = null;
      propagatingRef.current = true;
      onColFilterChange(draft);
      setTimeout(() => { propagatingRef.current = false; }, 0);
    }, 350);
  }

  function setDraftAndPropagate(draft: Partial<Record<SortKey, string>>) {
    if (colFilterDebounceRef.current) { clearTimeout(colFilterDebounceRef.current); colFilterDebounceRef.current = null; }
    setColFiltersDraft(draft);
    propagatingRef.current = true;
    onColFilterChange(draft);
    setTimeout(() => { propagatingRef.current = false; }, 0);
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
          return mul * (objA?.common?.type || objA?.type || '').localeCompare(objB?.common?.type || objB?.type || '');
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
  // value/timestamp are filtered here (page-local)
  const valueFilter = colFilters.value?.trim().toLowerCase() || '';
  const tsFilterParsed = useMemo(() => parseTsFilter(colFilters.ts || ''), [colFilters.ts]);
  const filteredIds = useMemo(() => {
    if (!valueFilter && tsFilterParsed.mode === 'none') return sortedIds;
    return sortedIds.filter((id) => {
      const valueOk = !valueFilter || formatValue(states[id]?.val).toLowerCase().includes(valueFilter);
      let tsOk = true;
      if (tsFilterParsed.mode === 'text') {
        tsOk = formatTimestamp(states[id]?.ts ?? NaN, dateFormat).toLowerCase().includes(tsFilterParsed.text || '');
      } else if (tsFilterParsed.mode === 'range') {
        const ts = states[id]?.ts;
        tsOk = Number.isFinite(ts);
        if (tsOk && tsFilterParsed.from !== undefined) tsOk = (ts as number) >= tsFilterParsed.from;
        if (tsOk && tsFilterParsed.to !== undefined) tsOk = (ts as number) <= tsFilterParsed.to;
      }
      return valueOk && tsOk;
    });
  }, [sortedIds, valueFilter, tsFilterParsed, dateFormat, (valueFilter || tsFilterParsed.mode !== 'none') ? states : null]);

  type DisplayItem = { kind: 'row'; id: string } | { kind: 'sep'; prefix: string };
  const displayItems = useMemo((): DisplayItem[] => {
    if (!groupByPath) return filteredIds.map((id) => ({ kind: 'row' as const, id }));
    // Group IDs by prefix, preserving filteredIds order within each group
    const groups = new Map<string, string[]>();
    for (const id of filteredIds) {
      const parts = id.split('.');
      const prefix = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(id);
    }
    // Sort prefixes alphabetically (case-insensitive) so groups always appear in A-Z order
    const sortedPrefixes = [...groups.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    const items: DisplayItem[] = [];
    for (const prefix of sortedPrefixes) {
      items.push({ kind: 'sep', prefix });
      const isCollapsed = collapsedPrefixes === null || collapsedPrefixes.has(prefix);
      if (!isCollapsed) {
        for (const id of groups.get(prefix)!) {
          items.push({ kind: 'row', id });
        }
      }
    }
    return items;
  }, [filteredIds, groupByPath, collapsedPrefixes]);

  const hasColFilters = Object.values(colFiltersDraft).some((v) => v.trim() !== '');

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
    deleteObject.mutate(id, {
      onSuccess: () => showToast(isEn ? `Deleted: ${id}` : `Gelöscht: ${id}`, 'success'),
      onError: (err) => showToast((isEn ? 'Delete failed: ' : 'Löschen fehlgeschlagen: ') + String(err)),
    });
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function handleDeleteAll(ids: string[]) {
    Promise.all(ids.map((id) => deleteObject.mutateAsync(id)))
      .then(() => {
        setCheckedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
        showToast(isEn ? `${ids.length} datapoints deleted` : `${ids.length} Datenpunkte gelöscht`, 'success');
      })
      .catch((err) => showToast((isEn ? 'Delete failed: ' : 'Löschen fehlgeschlagen: ') + String(err)));
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
  const handleOpenValueModal = React.useCallback((id: string) => {
    setValueEditId(id);
  }, []);

  const handleSelectRoom = React.useCallback((objectId: string, oldRoomEnumId: string | null, newRoomEnumId: string | null) => {
    updateRoomMutateRef.current({ objectId, oldRoomEnumId, newRoomEnumId });
  }, []);

  const handleSelectFunction = React.useCallback((objectId: string, oldFnEnumId: string | null, newFnEnumId: string | null) => {
    updateFnMutateRef.current({ objectId, oldFnEnumId, newFnEnumId });
  }, []);

  const handleRoomEditEnd = React.useCallback(() => setRoomEditId(null), []);
  const handleFnEditEnd = React.useCallback(() => setFnEditId(null), []);

  function handleBatchApply() {
    const ids = [...checkedIds];
    const onErr = (err: unknown) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err));
    if (batchRole.trim()) {
      ids.forEach((id) => extend.mutate({ id, common: { role: batchRole.trim() } }, { onError: onErr }));
    }
    if (batchUnit.trim()) {
      ids.forEach((id) => extend.mutate({ id, common: { unit: batchUnit.trim() } }, { onError: onErr }));
    }
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === '__none__' ? null : batchRoomEnumId;
      updateRoomBatch.mutate({ objectIds: ids, newRoomEnumId }, { onError: onErr });
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === '__none__' ? null : batchFnEnumId;
      updateFnBatch.mutate({ objectIds: ids, newFnEnumId }, { onError: onErr });
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
        type: obj?.common?.type || obj?.type || '',
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

  function exportDatapointsToJson(idsToExport: string[]) {
    const result: Record<string, object> = {};
    for (const id of idsToExport) {
      const obj = objects[id] ?? { _id: id };
      const { enums: _enums, ...rest } = obj as unknown as Record<string, unknown>;
      result[id] = rest;
    }
    const content = JSON.stringify(result, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iobroker-datenpunkt-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toolbar = (
    <div className="flex items-center justify-between pl-1 pr-3 py-1 shrink-0 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setNewDatapointOpen(true)}
          title={isEn ? 'New datapoint' : 'Neuer Datenpunkt'}
          className={`flex items-center gap-1.5 rounded-lg text-green-600 bg-green-500/10 hover:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/20 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Plus size={16} />
          {showToolbarLabels && <span>{isEn ? 'New' : 'Neu'}</span>}
        </button>
        <div className="relative group/export">
          <button
            title="Exportieren"
            className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
          >
            <Download size={16} />
            {showToolbarLabels && <span>Export</span>}
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
        <button
          onClick={() => setImportOpen(true)}
          title={isEn ? 'Import datapoints (JSON)' : 'Datenpunkte importieren (JSON)'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-violet-600 hover:bg-violet-500/10 dark:text-gray-400 dark:hover:text-violet-400 dark:hover:bg-violet-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Upload size={16} />
          {showToolbarLabels && <span>Import</span>}
        </button>
        <button
          onClick={() => onManualRefresh?.()}
          title={isEn ? 'Refresh data' : 'Daten aktualisieren'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-500/10 dark:text-gray-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <RefreshCw size={15} />
          {showToolbarLabels && <span>{isEn ? 'Refresh API' : 'API aktualisieren'}</span>}
        </button>
        <button
          onClick={() => onOpenEnumManager?.()}
          title={isEn ? 'Manage enums (rooms & functions)' : 'Enums verwalten (Räume & Funktionen)'}
          className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-500/10 dark:text-gray-400 dark:hover:text-amber-400 dark:hover:bg-amber-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
        >
          <Tag size={15} />
          {showToolbarLabels && <span>{isEn ? 'Enums' : 'Enums'}</span>}
        </button>
        {[...checkedIds].some((id) => id.startsWith('alias.')) && (
          <button
            onClick={() => {
              const firstAliasId = [...checkedIds].find((id) => id.startsWith('alias.'));
              const rawTarget = firstAliasId ? objects[firstAliasId]?.common?.alias?.id : undefined;
              const initialStr = typeof rawTarget === 'string' ? rawTarget : (rawTarget?.read ?? rawTarget?.write ?? '');
              onOpenAliasReplace?.(initialStr);
            }}
            title={isEn ? 'Find & Replace in alias targets' : 'Alias-Ziele suchen & ersetzen'}
            className={`flex items-center gap-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors ${showToolbarLabels ? 'px-2.5 py-1 text-xs font-medium' : 'justify-center w-7 h-7'}`}
          >
            <Link2 size={15} />
            {showToolbarLabels && <span>{isEn ? 'Alias Replace' : 'Alias Ersetzen'}</span>}
          </button>
        )}
        {checkedIds.size > 0 && (
          <button
            onClick={() => setMultiDeleteOpen(true)}
            title={isEn ? 'Delete selected datapoints' : 'Ausgewählte Datenpunkte löschen'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={13} />
            {isEn ? `Delete ${checkedIds.size}` : `${checkedIds.size} löschen`}
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
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-600 dark:text-violet-400 text-sm font-mono max-w-[520px]">
            <span className="truncate">Volltext: {pattern}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggleGroupByPath?.()}
          title={groupByPath ? (isEn ? 'Disable path grouping' : 'Pfad-Gruppierung deaktivieren') : (isEn ? 'Group rows by path' : 'Zeilen nach Pfad gruppieren')}
          className={`p-2 rounded-lg transition-colors ${
            groupByPath
              ? 'text-blue-600 bg-blue-500/15 hover:bg-blue-500/25 dark:text-blue-400 dark:hover:bg-blue-500/20'
              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10'
          }`}
        >
          <FolderOpen size={17} />
        </button>
        <button
          onClick={() => onToggleExpertMode?.()}
          title={expertMode ? (isEn ? 'Disable expert mode' : 'Expertenmodus deaktivieren') : (isEn ? 'Enable expert mode' : 'Expertenmodus aktivieren')}
          className={`p-2 rounded-lg transition-colors ${
            expertMode
              ? 'text-amber-600 bg-amber-500/15 hover:bg-amber-500/25 dark:text-amber-400 dark:hover:bg-amber-500/20'
              : 'text-gray-400 hover:text-amber-600 hover:bg-amber-500/10 dark:text-gray-500 dark:hover:text-amber-400 dark:hover:bg-amber-500/10'
          }`}
        >
          <Wrench size={17} />
        </button>
        <button
          onClick={fitToContainer}
          title={isEn ? 'Stretch columns to 100%' : 'Spalten auf 100% strecken'}
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
        >
          <Maximize2 size={17} />
        </button>
        {hasColFilters && (
          <button
            onClick={() => setDraftAndPropagate({})}
            title="Clear column filters"
            className="p-2 rounded-lg transition-colors text-blue-500 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
          >
            <X size={17} />
          </button>
        )}
        <button
          onClick={() => setConfirmResetLs(true)}
          title={isEn ? 'Reset settings (local storage)' : 'Einstellungen zurücksetzen'}
          className="p-2 rounded-lg transition-colors text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
        >
          <RotateCcw size={17} />
        </button>
        <ColPicker visible={visibleCols} onChange={handleColChange} language={language} />
      </div>
    </div>
  );

  const existingIds = useMemo(() => new Set(Object.keys(objects)), [objects]);
  const noRoomLabel = isEn ? '— No room —' : '— Kein Raum —';
  const noFunctionLabel = isEn ? '— No function —' : '— Keine Funktion —';
  const roomById = useMemo(() => new Map(roomEnums.map((r) => [r.id, r.name])), [roomEnums]);
  const roomNameOptions = useMemo(() => [noRoomLabel, ...roomEnums.map((r) => r.name)], [roomEnums, noRoomLabel]);
  const fnById = useMemo(() => new Map(fnEnums.map((f) => [f.id, f.name])), [fnEnums]);
  const fnNameOptions = useMemo(() => [noFunctionLabel, ...fnEnums.map((f) => f.name)], [fnEnums, noFunctionLabel]);
  const roomFilterOptions = useMemo(() => [...new Set(roomEnums.map((r) => r.name))], [roomEnums]);
  const fnFilterOptions = useMemo(() => [...new Set(fnEnums.map((f) => f.name))], [fnEnums]);
  const roleFilterOptions = useMemo(() => [...new Set(roles)], [roles]);
  const unitFilterOptions = useMemo(() => [...new Set(units)], [units]);
  const typeFilterOptions = useMemo(
    () => [...new Set(Object.values(objects).map((obj) => obj?.common?.type || obj?.type || '').filter((v) => v.trim() !== ''))],
    [objects]
  );

  const batchCanApply = batchRole.trim() !== '' || batchUnit.trim() !== '' || batchRoomEnumId !== '' || batchFnEnumId !== '';
  const bodyViewportHeight = Math.max(0, viewportHeight - headerHeight);
  const virtualEnabled = displayItems.length > VIRTUALIZE_THRESHOLD && bodyViewportHeight > 0;
  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);
  const virtualStart = virtualEnabled
    ? Math.max(0, Math.floor(bodyScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
    : 0;
  const virtualVisibleCount = virtualEnabled
    ? Math.ceil(bodyViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
    : displayItems.length;
  const virtualEnd = virtualEnabled
    ? Math.min(displayItems.length, virtualStart + virtualVisibleCount)
    : displayItems.length;
  const visibleItems = virtualEnabled ? displayItems.slice(virtualStart, virtualEnd) : displayItems;
  const topSpacer = virtualEnabled ? virtualStart * VIRTUAL_ROW_HEIGHT : 0;
  const bottomSpacer = virtualEnabled ? (displayItems.length - virtualEnd) * VIRTUAL_ROW_HEIGHT : 0;
  const rowColSpan = visibleCols.length + 1;

  function handleBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    const next = e.currentTarget.scrollTop;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(next);
      scrollRafRef.current = null;
    });
  }

  function scrollRowIntoView(index: number) {
    const container = containerRef.current;
    if (!container) return;
    const rowTop = headerHeight + index * VIRTUAL_ROW_HEIGHT;
    const rowBottom = rowTop + VIRTUAL_ROW_HEIGHT;
    if (rowTop < container.scrollTop) {
      container.scrollTop = rowTop;
    } else if (rowBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = rowBottom - container.clientHeight;
    }
  }

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = focusedId !== null ? filteredIds.indexOf(focusedId) : -1;
      const nextIndex = e.key === 'ArrowDown'
        ? Math.min(filteredIds.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex > 0 ? currentIndex - 1 : 0);
      const nextId = filteredIds[nextIndex];
      if (nextId !== undefined) {
        setFocusedId(nextId);
        scrollRowIntoView(nextIndex);
      }
    } else if (e.key === 'Enter') {
      if (focusedId !== null && filteredIds.includes(focusedId)) {
        e.preventDefault();
        onSelect(focusedId);
      }
    } else if (e.key === 'Escape') {
      setFocusedId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {toolbar}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 flex-wrap">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0 whitespace-nowrap">
            {checkedIds.size} {isEn ? 'selected:' : 'ausgewählt:'}
          </span>
          <BatchComboControl
            value={batchRole}
            onChange={setBatchRole}
            placeholder={isEn ? 'Role…' : 'Rolle…'}
            options={roles}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchUnit}
            onChange={setBatchUnit}
            placeholder={isEn ? 'Unit…' : 'Einheit…'}
            options={units}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchRoomEnumId === '' ? '' : (batchRoomEnumId === '__none__' ? noRoomLabel : (roomById.get(batchRoomEnumId) ?? ''))}
            onChange={(name) => {
              if (name.trim() === '') { setBatchRoomEnumId(''); return; }
              if (name === noRoomLabel) { setBatchRoomEnumId('__none__'); return; }
              const hit = roomEnums.find((r) => r.name === name);
              setBatchRoomEnumId(hit ? hit.id : '');
            }}
            placeholder={isEn ? 'Room…' : 'Raum…'}
            options={roomNameOptions}
            className="w-32"
            language={language}
          />
          <BatchComboControl
            value={batchFnEnumId === '' ? '' : (batchFnEnumId === '__none__' ? noFunctionLabel : (fnById.get(batchFnEnumId) ?? ''))}
            onChange={(name) => {
              if (name.trim() === '') { setBatchFnEnumId(''); return; }
              if (name === noFunctionLabel) { setBatchFnEnumId('__none__'); return; }
              const hit = fnEnums.find((f) => f.name === name);
              setBatchFnEnumId(hit ? hit.id : '');
            }}
            placeholder={isEn ? 'Function…' : 'Funktion…'}
            options={fnNameOptions}
            className="w-32"
            language={language}
          />
          <button
            onClick={handleBatchApply}
            disabled={!batchCanApply}
            className="px-2.5 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEn ? 'Apply' : 'Anwenden'}
          </button>
        </div>
      )}
      {newDatapointOpen && (
        <NewDatapointModal
          onClose={() => setNewDatapointOpen(false)}
          existingIds={existingIds}
          initialId={patternToInitialId(pattern)}
          language={language}
        />
      )}
      {importOpen && (
        <ImportDatapointsModal
          onClose={() => setImportOpen(false)}
          language={language}
          existingIds={allObjectIds}
        />
      )}
      {historyModalId && (
        <HistoryModal
          stateId={historyModalId}
          unit={objects[historyModalId]?.common?.unit}
          objects={objects}
          language={language}
          onClose={() => setHistoryModalId(null)}
        />
      )}
      {valueEditId && (
        <ValueEditModal
          id={valueEditId}
          state={states[valueEditId]}
          obj={objects[valueEditId]}
          language={language}
          onClose={() => setValueEditId(null)}
        />
      )}
      {deletingId && (
        <ConfirmDialog
          title={isEn ? 'Delete datapoint' : 'Datenpunkt löschen'}
          message={deletingId}
          onConfirm={() => { deleteObject.mutate(deletingId); setDeletingId(null); }}
          onCancel={() => setDeletingId(null)}
          language={language}
        />
      )}
      {confirmResetLs && (
        <ConfirmDialog
          title={isEn ? 'Reset local settings' : 'Lokale Einstellungen zurücksetzen'}
          description={isEn ? 'The following local storage entries will be deleted:' : 'Folgende Local-Storage-Einträge werden gelöscht:'}
          message={`${LS_KEY}\n${LS_WIDTHS_KEY}`}
          confirmLabel={isEn ? 'Reset' : 'Zurücksetzen'}
          onConfirm={() => {
            localStorage.removeItem(LS_KEY);
            localStorage.removeItem(LS_WIDTHS_KEY);
            setVisibleCols(DEFAULT_COLS);
            setColWidths({ ...effectiveDefaults });
            setDraftAndPropagate({});
            setConfirmResetLs(false);
          }}
          onCancel={() => setConfirmResetLs(false)}
          language={language}
        />
      )}
      {multiDeleteOpen && (
        <MultiDeleteDialog
          ids={[...checkedIds]}
          onDeleteOne={handleDeleteOne}
          onDeleteAll={handleDeleteAll}
          onClose={() => setMultiDeleteOpen(false)}
          language={language}
        />
      )}
      {aliasSourceId && (
        <CreateAliasModal
          sourceId={aliasSourceId}
          sourceObj={objects[aliasSourceId]}
          existingIds={existingIds}
          language={language}
          onClose={() => setAliasSourceId(null)}
          onCreated={(newId) => onNavigateTo?.([newId])}
        />
      )}
      {copySourceId && (
        <CopyDatapointModal
          sourceId={copySourceId}
          sourceObj={objects[copySourceId]}
          existingIds={existingIds}
          language={language}
          onClose={() => setCopySourceId(null)}
        />
      )}
      {renameId && objects[renameId] && (
        <RenameDatapointModal
          sourceId={renameId}
          sourceObj={objects[renameId]}
          sourceState={states[renameId]}
          existingIds={existingIds}
          language={language}
          onClose={() => setRenameId(null)}
          onRenamed={(newId) => { setRenameId(null); onNavigateTo?.([newId]); }}
        />
      )}
      {moveId && objects[moveId] && (
        <MoveDatapointModal
          sourceId={moveId}
          sourceObj={objects[moveId]}
          sourceState={states[moveId]}
          existingIds={existingIds}
          language={language}
          onClose={() => setMoveId(null)}
          onMoved={(newId) => { setMoveId(null); onNavigateTo?.([newId]); }}
        />
      )}
      {editObjId && objects[editObjId] && (
        <ObjectEditModal
          id={editObjId}
          obj={objects[editObjId]}
          language={language}
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
        items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy ID' : 'ID kopieren', onClick: () => copyText(ctxId) });
        if (ctxName) items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy name' : 'Name kopieren', onClick: () => copyText(ctxName) });
        if (ctxState) items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy value' : 'Wert kopieren', onClick: () => copyText(formatValue(ctxState.val)) });
        items.push({ separator: true } as const);
        if (ctxObj && hasHistory(ctxObj)) {
          items.push({ icon: <History size={13} />, label: isEn ? 'Show history' : 'History anzeigen', onClick: () => setHistoryModalId(ctxId) });
          items.push({ separator: true } as const);
        }
        items.push({ icon: <Search size={13} />, label: isEn ? 'Set as filter' : 'Als Filter setzen', onClick: () => setDraftAndPropagate({ ...colFiltersDraft, id: ctxId }) });
        items.push({ icon: <Home size={13} />, label: isEn ? 'Edit room' : 'Raum bearbeiten', onClick: () => setRoomEditId(ctxId) });
        items.push({ icon: <Zap size={13} />, label: isEn ? 'Edit function' : 'Funktion bearbeiten', onClick: () => setFnEditId(ctxId) });
        items.push({ icon: <FileEdit size={13} />, label: isEn ? 'Edit object' : 'Objekt bearbeiten', onClick: () => setEditObjId(ctxId) });
        items.push({ separator: true } as const);
        items.push({ icon: <Copy size={13} />, label: isEn ? 'Copy datapoint' : 'Datenpunkt kopieren', onClick: () => setCopySourceId(ctxId) });
        items.push({ icon: <PenLine size={13} />, label: isEn ? 'Rename datapoint' : 'Datenpunkt umbenennen', onClick: () => setRenameId(ctxId) });
        items.push({ icon: <FolderInput size={13} />, label: isEn ? 'Move datapoint' : 'Datenpunkt verschieben', onClick: () => setMoveId(ctxId) });
        if (!ctxId.startsWith('alias.0.')) {
          items.push({ icon: <Link2 size={13} />, label: isEn ? 'Create alias' : 'Alias anlegen', onClick: () => setAliasSourceId(ctxId) });
        }
        items.push({ separator: true } as const);
        const exportIds = checkedIds.has(ctxId) && checkedIds.size > 1 ? [...checkedIds] : [ctxId];
        const exportLabel = exportIds.length > 1
          ? (isEn ? `Export ${exportIds.length} datapoints (JSON)` : `${exportIds.length} Datenpunkte exportieren (JSON)`)
          : (isEn ? 'Export datapoint (JSON)' : 'Datenpunkt exportieren (JSON)');
        items.push({ icon: <Download size={13} />, label: exportLabel, onClick: () => exportDatapointsToJson(exportIds) });
        items.push({ separator: true } as const);
        items.push({ icon: <Trash2 size={13} />, label: isEn ? 'Delete datapoint' : 'Datenpunkt löschen', onClick: () => setDeletingId(ctxId), danger: true });
        return <ContextMenu x={x} y={y} items={items} onClose={() => setCtxMenu(null)} />;
      })()}

      <div ref={containerRef} onScroll={handleBodyScroll} onKeyDown={handleContainerKeyDown} tabIndex={0} className="overflow-x-auto overflow-y-auto flex-1 outline-none" data-table-fontsize={tableFontSize}>
        <table className="text-xs text-left table-fixed" style={{ width: totalWidth }}>
          <thead ref={theadRef} className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {show('checkbox') && (
                <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="text-center align-middle">
                  {groupByPath && (() => {
                    const allPrefixes = [...new Set(filteredIds.map((id) => { const p = id.split('.'); return p.length > 1 ? p.slice(0, -1).join('.') : ''; }))];
                    const allCollapsed = collapsedPrefixes === null || (allPrefixes.length > 0 && allPrefixes.every((p) => collapsedPrefixes.has(p)));
                    return (
                      <button
                        onClick={() => setCollapsedPrefixes(allCollapsed ? new Set() : null)}
                        title={allCollapsed ? (isEn ? 'Expand all groups' : 'Alle Gruppen aufklappen') : (isEn ? 'Collapse all groups' : 'Alle Gruppen einklappen')}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                      >
                        {allCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                    );
                  })()}
                </th>
              )}
              {show('write')   && <th style={{ width: colWidths['write'],   minWidth: colWidths['write']   }} />}
              {show('history') && <th style={{ width: colWidths['history'], minWidth: colWidths['history'] }} />}
              {show('smart')   && <th style={{ width: colWidths['smart'],   minWidth: colWidths['smart']   }} />}
              {show('alias')   && <th style={{ width: w('alias'),           minWidth: w('alias')           }} />}
              {show('id')      && <SortHeader label="ID" sortKey="id" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('id')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('name')    && <SortHeader label={isEn ? 'Name' : 'Name'} sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('name')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('room')     && <SortHeader label={isEn ? 'Room' : 'Raum'} sortKey="room" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('room')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('function') && <SortHeader label={isEn ? 'Function' : 'Funktion'} sortKey="function" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('function')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('type')    && <SortHeader label={isEn ? 'Type' : 'Typ'} sortKey="type" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('type')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('role')    && <SortHeader label={isEn ? 'Role' : 'Rolle'} sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('role')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('value')   && <SortHeader label={isEn ? 'Value' : 'Wert'} sortKey="value" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('value')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} className="text-left" />}
              {show('unit')    && <SortHeader label={isEn ? 'Unit' : 'Einheit'} sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('unit')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('ack')     && <SortHeader label="ACK" sortKey="ack" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ack')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              {show('ts')      && <SortHeader label={isEn ? 'Last Update' : 'Letztes Update'} sortKey="ts" activeKey={sortKey} dir={sortDir} onSort={handleSort} width={w('ts')} onResizeStart={handleResizeStart} onAutoFit={handleAutoFit} onHide={handleHideCol} />}
              <th style={{ width: DEL_COL_WIDTH, minWidth: DEL_COL_WIDTH }} />
            </tr>
            <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {show('checkbox') && (
                <th style={{ width: w('checkbox'), minWidth: w('checkbox') }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                  <StyledCheckbox
                    checked={allOnPageChecked}
                    indeterminate={someChecked && !allOnPageChecked}
                    onChange={toggleCheckAll}
                    title={isEn ? 'Select all' : 'Alle auswählen'}
                  />
                </th>
              )}
              {(['write','history','smart','alias','id','name','room','function','type','role','value','unit','ack','ts'] as SortKey[]).filter(show).map((key) => {
                const filterable = ['id','name','room','function','type','role','value','unit','ts'].includes(key);
                const isIconToggle = ['write','history','smart','alias'].includes(key);
                const isActive = colFiltersDraft[key] === '1';

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
                  const title = key === 'write'
                    ? (isEn ? 'Only read-only' : 'Nur Schreibgeschützte')
                    : key === 'history'
                    ? (isEn ? 'Only with history' : 'Nur mit History')
                    : key === 'alias'
                    ? (isEn ? 'Only with alias' : 'Nur mit Alias')
                    : (isEn ? 'Only with SmartName' : 'Nur mit SmartName');
                  return (
                    <th key={key} style={{ width: w(key) }} className="py-1 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDraftAndPropagate({ ...colFiltersDraft, [key]: isActive ? '' : '1' })}
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
                        {(key === 'role' || key === 'room' || key === 'function' || key === 'unit' || key === 'type') ? (
                          <BatchComboControl
                            value={colFiltersDraft[key] || ''}
                            onChange={(value) => setDraftAndDebounce({ ...colFiltersDraft, [key]: value })}
                            placeholder="Filter..."
                            options={
                              key === 'role'
                                ? roleFilterOptions
                                : key === 'room'
                                  ? roomFilterOptions
                                  : key === 'function'
                                    ? fnFilterOptions
                                    : key === 'unit'
                                      ? unitFilterOptions
                                      : typeFilterOptions
                            }
                            className="w-full"
                            language={language}
                          />
                        ) : key === 'ts' ? (
                          <TsRangeFilterControl
                            value={colFiltersDraft.ts || ''}
                            onChange={(value) => setDraftAndDebounce({ ...colFiltersDraft, ts: value })}
                            language={language}
                          />
                        ) : (
                          <>
                            <input
                              type="text"
                              value={colFiltersDraft[key] || ''}
                              onChange={(e) => setDraftAndDebounce({ ...colFiltersDraft, [key]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Escape' && colFiltersDraft[key]?.trim()) { e.stopPropagation(); setDraftAndPropagate({ ...colFiltersDraft, [key]: '' }); } }}
                              placeholder="Filter..."
                              className={`w-full h-7 py-0 text-xs rounded border bg-gray-50/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 ${
                                colFiltersDraft[key]?.trim()
                                  ? 'pl-1.5 pr-5 border-blue-400 dark:border-blue-500'
                                  : 'px-1.5 border-gray-300 dark:border-gray-600'
                              }`}
                            />
                            {colFiltersDraft[key]?.trim() && (
                              <button
                                onMouseDown={(e) => { e.preventDefault(); setDraftAndPropagate({ ...colFiltersDraft, [key]: '' }); }}
                                className="absolute right-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </>
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
                    ? (isEn ? 'No datapoints found. Use search to load datapoints.' : 'Keine Datenpunkte gefunden. Verwende die Suche um Datenpunkte zu laden.')
                    : (isEn ? 'No entries match the active filters.' : 'Keine Einträge entsprechen den gesetzten Filtern.')}
                </td>
              </tr>
            )}
            {topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={rowColSpan} style={{ height: topSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleItems.map((item, idx) => {
              if (item.kind === 'sep') {
                return (
                  <tr key={`sep_${item.prefix}_${idx}`} className="group/sep cursor-pointer select-none" onClick={() => setCollapsedPrefixes((prev) => {
                      const allPfx = [...new Set(filteredIds.map((id) => { const p = id.split('.'); return p.length > 1 ? p.slice(0, -1).join('.') : ''; }))];
                      const base = prev === null ? new Set(allPfx) : new Set(prev);
                      base.has(item.prefix) ? base.delete(item.prefix) : base.add(item.prefix);
                      return base;
                    })}>
                    <td colSpan={rowColSpan + 1} className="px-3 py-1.5 bg-gray-100/80 dark:bg-gray-800/60 border-y border-gray-200/80 dark:border-gray-700/60 hover:bg-gray-200/80 dark:hover:bg-gray-700/60 transition-colors">
                      <div className="flex items-center gap-2">
                        {(collapsedPrefixes === null || collapsedPrefixes.has(item.prefix))
                          ? <ChevronRight size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                          : <ChevronDown size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                        }
                        <FolderOpen size={14} className="text-yellow-500/80 shrink-0" />
                        {item.prefix
                          ? <ColoredId id={item.prefix} className="text-sm font-mono font-bold" />
                          : <span className="text-sm text-gray-400 dark:text-gray-500 font-mono font-bold italic">root</span>
                        }
                        {item.prefix && (
                          <button
                            onClick={(e) => { e.stopPropagation(); copyText(item.prefix); }}
                            className="ml-1 opacity-0 group-hover/sep:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                            title={item.prefix}
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }
              const id = item.id;
              return (
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
                  ownTargetExists={!objects[id]?.common?.alias?.id || (allObjectIds ? allObjectIds.has(objects[id]!.common!.alias!.id as string) : !!objects[objects[id]!.common!.alias!.id as string])}
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
                  onOpenValueModal={handleOpenValueModal}
                  roomEditForced={roomEditId === id}
                  fnEditForced={fnEditId === id}
                  onRoomEditEnd={handleRoomEditEnd}
                  onFnEditEnd={handleFnEditEnd}
                  dateFormat={dateFormat}
                  language={language}
                  expertMode={expertMode}
                  isFocused={focusedId === id && selectedId !== id}
                  showDesc={showDesc}
                />
              );
            })}
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

export default React.memo(React.forwardRef(StateList));
