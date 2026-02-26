import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertTriangle, Link2, Pencil, Check, Wrench, Trash2, Maximize2, Copy, ChevronDown, Lock } from 'lucide-react';
import { usePutObject, useExtendObject, useStateDetail, useSetState, useAllRoles, useAllUnits, useDeleteObject, useAllObjects, useRoomEnums, useFunctionEnums, useUpdateRoomMembership, useUpdateFunctionMembership } from '../hooks/useStates';
import { hasHistory } from '../api/iobroker';
import HistoryChart from './HistoryChart';
import ConfirmDialog from './ConfirmDialog';
import CopyDatapointModal from './CopyDatapointModal';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  id: string;
  obj: IoBrokerObject;
  onClose: () => void;
  onOpenHistory?: () => void;
  language?: 'en' | 'de';
}

type Tab = 'details' | 'json' | 'alias';

// ── helpers ────────────────────────────────────────────────────────────────

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

function EditableRow({ label, value, onSave, isPending, suggestions, language = 'en' }: {
  label: string;
  value: string;
  onSave: (val: string) => void;
  isPending: boolean;
  suggestions?: string[];
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
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
          title={isEn ? 'Edit' : 'Bearbeiten'}
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
                if (activeIndex >= 0 && filtered[activeIndex]) commit(filtered[activeIndex]);
                else commit(draft);
              } else if (e.key === 'Escape') {
                if (showSuggestions) setShowSuggestions(false);
                else setEditing(false);
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
        <button onClick={() => commit(draft)} disabled={isPending} className="text-green-500 hover:text-green-600 dark:text-green-400 disabled:opacity-50 mt-0.5" title={isEn ? 'Save' : 'Speichern'}>
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} disabled={isPending} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 disabled:opacity-50 mt-0.5" title={isEn ? 'Cancel' : 'Abbrechen'}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function SwitchControl({ val, onSet, isPending, disabled }: { val: unknown; onSet: (v: unknown) => void; isPending: boolean; disabled?: boolean }) {
  const checked = Boolean(val);
  return (
    <button
      onClick={() => !disabled && onSet(!checked)}
      disabled={isPending || disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'} ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 mt-1 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function ButtonControl({ onSet, isPending, disabled, language = 'en' }: { onSet: (v: unknown) => void; isPending: boolean; disabled?: boolean; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  return (
    <button onClick={() => onSet(true)} disabled={isPending || disabled} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 transition-colors">
      {isEn ? 'Trigger' : 'Auslösen'}
    </button>
  );
}

function NumberControl({ val, onSet, isPending, unit }: { val: unknown; onSet: (v: unknown) => void; isPending: boolean; unit?: string }) {
  const [draft, setDraft] = useState(String(val ?? ''));
  useEffect(() => { setDraft(String(val ?? '')); }, [val]);
  function commit() { const n = Number(draft); if (!isNaN(n)) onSet(n); }
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} onBlur={commit} disabled={isPending} className="w-24 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
      {unit && <span className="text-gray-500 dark:text-gray-400 text-sm">{unit}</span>}
    </div>
  );
}

function StringControl({ val, onSet, isPending, unit, language = 'en' }: { val: unknown; onSet: (v: unknown) => void; isPending: boolean; unit?: string; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [draft, setDraft] = useState(String(val ?? ''));
  useEffect(() => { setDraft(String(val ?? '')); }, [val]);
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSet(draft); }} disabled={isPending} className="flex-1 min-w-0 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
      <button onClick={() => onSet(draft)} disabled={isPending} className="text-green-500 hover:text-green-600 dark:text-green-400 disabled:opacity-50 shrink-0" title={isEn ? 'Send' : 'Senden'}><Check size={14} /></button>
      {unit && <span className="text-gray-500 dark:text-gray-400 text-sm shrink-0">{unit}</span>}
    </div>
  );
}

function ExpertControl({ val, onSet, isPending, unit, type, language = 'en' }: { val: unknown; onSet: (v: unknown) => void; isPending: boolean; unit?: string; type?: string; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [draft, setDraft] = useState(String(val ?? ''));
  useEffect(() => { setDraft(String(val ?? '')); }, [val]);
  function commit(raw: string) {
    if (type === 'boolean') onSet(raw === 'true');
    else if (type === 'number') { const n = Number(raw); if (!isNaN(n)) onSet(n); }
    else onSet(raw);
  }
  if (type === 'boolean') {
    return (
      <div className="flex items-center gap-1.5">
        <select value={draft} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }} disabled={isPending} className="bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <input type={type === 'number' ? 'number' : 'text'} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(draft); }} disabled={isPending} className="w-32 bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600" />
      <button onClick={() => commit(draft)} disabled={isPending} className="text-green-500 hover:text-green-600 dark:text-green-400 disabled:opacity-50" title={isEn ? 'Send' : 'Senden'}><Check size={14} /></button>
      {unit && <span className="text-gray-500 dark:text-gray-400 text-sm">{unit}</span>}
    </div>
  );
}

// ── JSON syntax highlighting ────────────────────────────────────────────────

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'other';
interface Token { type: TokenType; value: string }

function tokenizeJson(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      let j = i; while (j < raw.length && /\s/.test(raw[j])) j++;
      tokens.push({ type: 'other', value: raw.slice(i, j) }); i = j; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '\\') j += 2;
        else if (raw[j] === '"') { j++; break; }
        else j++;
      }
      const value = raw.slice(i, j);
      let k = j; while (k < raw.length && (raw[k] === ' ' || raw[k] === '\t')) k++;
      tokens.push({ type: raw[k] === ':' ? 'key' : 'string', value });
      i = j; continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i; if (raw[j] === '-') j++;
      while (j < raw.length && /[0-9]/.test(raw[j])) j++;
      if (j < raw.length && raw[j] === '.') { j++; while (j < raw.length && /[0-9]/.test(raw[j])) j++; }
      if (j < raw.length && (raw[j] === 'e' || raw[j] === 'E')) { j++; if (raw[j] === '+' || raw[j] === '-') j++; while (j < raw.length && /[0-9]/.test(raw[j])) j++; }
      tokens.push({ type: 'number', value: raw.slice(i, j) }); i = j; continue;
    }
    if (raw.startsWith('true', i))  { tokens.push({ type: 'boolean', value: 'true'  }); i += 4; continue; }
    if (raw.startsWith('false', i)) { tokens.push({ type: 'boolean', value: 'false' }); i += 5; continue; }
    if (raw.startsWith('null', i))  { tokens.push({ type: 'null',    value: 'null'  }); i += 4; continue; }
    if ('{}[],:'.includes(ch)) { tokens.push({ type: 'punctuation', value: ch }); i++; continue; }
    tokens.push({ type: 'other', value: ch }); i++;
  }
  return tokens;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case 'key':         return 'text-blue-600 dark:text-blue-300';
    case 'string':      return 'text-green-700 dark:text-green-400';
    case 'number':      return 'text-orange-600 dark:text-orange-400';
    case 'boolean':     return 'text-purple-600 dark:text-purple-400';
    case 'null':        return 'text-gray-400 dark:text-gray-500';
    case 'punctuation': return 'text-gray-500 dark:text-gray-400';
    default:            return 'text-gray-800 dark:text-gray-200';
  }
}

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '16px',
  margin: 0,
  whiteSpace: 'pre',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  tabSize: 2,
};

function JsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preRef  = useRef<HTMLPreElement>(null);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const tokens  = useMemo(() => tokenizeJson(value), [value]);

  function syncScroll() {
    if (!preRef.current || !taRef.current) return;
    preRef.current.style.transform =
      `translate(${-taRef.current.scrollLeft}px, ${-taRef.current.scrollTop}px)`;
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-800">
      <pre
        ref={preRef}
        aria-hidden
        className="absolute top-0 left-0 pointer-events-none select-none m-0 border-0 min-w-full min-h-full"
        style={{ ...MONO, overflow: 'visible', transformOrigin: '0 0' }}
      >
        {tokens.map((t, i) => (
          <span key={i} className={tokenClass(t.type)}>{t.value}</span>
        ))}
        {'\n'}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-gray-700 dark:caret-gray-200 focus:outline-none border-0"
        style={MONO}
      />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function ObjectEditModal({ id, obj, onClose, onOpenHistory, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [tab, setTab] = useState<Tab>('details');
  const [draft, setDraft] = useState(() => JSON.stringify(obj, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  // Alias tab state
  const [aliasId, setAliasId] = useState(obj.common.alias?.id ?? '');
  const [aliasRead, setAliasRead] = useState(obj.common.alias?.read ?? '');
  const [aliasWrite, setAliasWrite] = useState(obj.common.alias?.write ?? '');
  const [roomEnumId, setRoomEnumId] = useState<string | null>(() => {
    const hit = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.rooms.'));
    return hit ?? null;
  });
  const [fnEnumId, setFnEnumId] = useState<string | null>(() => {
    const hit = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.functions.'));
    return hit ?? null;
  });

  const putObject = usePutObject();
  const extend = useExtendObject();
  const { data: state } = useStateDetail(id);
  const setStateMutation = useSetState();
  const { data: roles } = useAllRoles();
  const { data: units } = useAllUnits();
  const { data: roomEnums = [] } = useRoomEnums();
  const { data: fnEnums = [] } = useFunctionEnums();
  const deleteObject = useDeleteObject();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();
  const { data: allObjects } = useAllObjects();
  const existingIds = useMemo(() => new Set(Object.keys(allObjects ?? {})), [allObjects]);

  const role = obj.common?.role ?? '';
  const type = obj.common?.type ?? '';
  const isWritable = obj.common?.write === true;
  const isSwitch = role === 'switch' || role.startsWith('switch.');
  const isButton = role === 'button' || role.startsWith('button.');
  const isNumberValue = !isSwitch && !isButton && type === 'number';

  useEffect(() => {
    const nextRoom = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.rooms.')) ?? null;
    const nextFn = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.functions.')) ?? null;
    setRoomEnumId(nextRoom);
    setFnEnumId(nextFn);
  }, [id, obj.enums]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function saveField(field: string, value: string) {
    extend.mutate({ id, common: { [field]: value } });
  }

  function handleSet(val: unknown) {
    setStateMutation.mutate({ id, val });
  }

  function handleSaveJson() {
    let parsed: IoBrokerObject;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setJsonError((isEn ? 'Invalid JSON: ' : 'Ungültiges JSON: ') + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setJsonError(null);
    putObject.mutate({ id, obj: parsed }, { onSuccess: onClose });
  }

  function handleSaveAlias() {
    const trimmedId = aliasId.trim();
    const newCommon = { ...obj.common };
    if (trimmedId) {
      newCommon.alias = {
        id: trimmedId,
        ...(aliasRead.trim() ? { read: aliasRead.trim() } : {}),
        ...(aliasWrite.trim() ? { write: aliasWrite.trim() } : {}),
      };
    } else {
      delete newCommon.alias;
    }
    putObject.mutate({ id, obj: { ...obj, common: newCommon } }, { onSuccess: onClose });
  }

  function handleSetRoom(nextRoomEnumId: string | null) {
    const oldRoomEnumId = roomEnumId;
    if (oldRoomEnumId === nextRoomEnumId) return;
    setRoomEnumId(nextRoomEnumId);
    updateRoom.mutate(
      { objectId: id, oldRoomEnumId, newRoomEnumId: nextRoomEnumId },
      { onError: () => setRoomEnumId(oldRoomEnumId) }
    );
  }

  function handleSetFunction(nextFnEnumId: string | null) {
    const oldFnEnumId = fnEnumId;
    if (oldFnEnumId === nextFnEnumId) return;
    setFnEnumId(nextFnEnumId);
    updateFn.mutate(
      { objectId: id, oldFnEnumId, newFnEnumId: nextFnEnumId },
      { onError: () => setFnEnumId(oldFnEnumId) }
    );
  }

  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500';

  return createPortal(
    <>
      {showCopy && (
        <CopyDatapointModal
          sourceId={id}
          sourceObj={obj}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowCopy(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={isEn ? 'Delete datapoint' : 'Datenpunkt löschen'}
          message={id}
          onConfirm={() => { deleteObject.mutate(id, { onSuccess: onClose }); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          language={language}
        />
      )}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl flex flex-col h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate pr-4 flex items-center gap-1.5">
              {obj.common?.write === false && (
                <Lock size={13} className="text-red-500 dark:text-red-400 shrink-0" />
              )}
              {isEn ? 'Edit object:' : 'Objekt bearbeiten:'}{' '}
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{id}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {isWritable && (
                <button
                  onClick={() => setExpertMode((e) => !e)}
                  title={expertMode ? (isEn ? 'Disable expert mode' : 'Expertenmodus deaktivieren') : (isEn ? 'Expert mode' : 'Expertenmodus')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    expertMode
                      ? 'text-orange-400 bg-orange-400/10 hover:bg-orange-400/20'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Wrench size={15} />
                </button>
              )}
              <button
                onClick={() => setShowCopy(true)}
                title={isEn ? 'Copy datapoint' : 'Datenpunkt kopieren'}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title={isEn ? 'Delete datapoint' : 'Datenpunkt löschen'}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
              <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 px-5">
            {(['details', 'json', 'alias'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setJsonError(null); }}
                className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t === 'details' ? (isEn ? 'Details' : 'Details') : t === 'json' ? 'JSON' : 'Alias'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {tab === 'details' && (
              <div className="px-5 py-4 space-y-0 overflow-y-auto flex-1">
                <EditableRow label="Name" value={getObjectName(obj.common)} onSave={(v) => saveField('name', v)} isPending={extend.isPending} language={language} />
                <DetailRow label={isEn ? 'Type' : 'Typ'} value={obj.common?.type || '—'} />
                <EditableRow label={isEn ? 'Role' : 'Rolle'} value={obj.common?.role || ''} onSave={(v) => saveField('role', v)} isPending={extend.isPending} suggestions={roles} language={language} />
                <EditableRow label={isEn ? 'Unit' : 'Einheit'} value={obj.common?.unit || ''} onSave={(v) => saveField('unit', v)} isPending={extend.isPending} suggestions={units} language={language} />
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Room' : 'Raum'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={roomEnumId ?? ''}
                      onChange={(e) => handleSetRoom(e.target.value || null)}
                      disabled={updateRoom.isPending}
                      className="w-full appearance-none bg-gray-50 text-gray-800 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:focus:ring-blue-500 transition-colors"
                    >
                      <option value="">{isEn ? 'No room' : 'Kein Raum'}</option>
                      {roomEnums.map((roomEntry) => (
                        <option key={roomEntry.id} value={roomEntry.id}>
                          {roomEntry.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Function' : 'Funktion'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={fnEnumId ?? ''}
                      onChange={(e) => handleSetFunction(e.target.value || null)}
                      disabled={updateFn.isPending}
                      className="w-full appearance-none bg-gray-50 text-gray-800 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:focus:ring-blue-500 transition-colors"
                    >
                      <option value="">{isEn ? 'No function' : 'Keine Funktion'}</option>
                      {fnEnums.map((fnEntry) => (
                        <option key={fnEntry.id} value={fnEntry.id}>
                          {fnEntry.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                  </div>
                </div>
                <EditableRow
                  label={isEn ? 'Description' : 'Beschreibung'}
                  value={typeof obj.common?.desc === 'string' ? obj.common.desc : obj.common?.desc ? JSON.stringify(obj.common.desc) : ''}
                  onSave={(v) => saveField('desc', v)}
                  isPending={extend.isPending}
                  language={language}
                />
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Read/Write' : 'Lesen/Schreiben'}</span>
                  <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-200">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={obj.common?.read !== false}
                        onChange={(e) => extend.mutate({ id, common: { read: e.target.checked } })}
                        disabled={extend.isPending}
                        className="sr-only peer"
                      />
                      <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        obj.common?.read !== false
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'
                      } ${extend.isPending ? 'opacity-50' : 'peer-focus:ring-1 peer-focus:ring-blue-400 dark:peer-focus:ring-blue-500'}`}>
                        {obj.common?.read !== false && <Check size={11} className="text-white" strokeWidth={3} />}
                      </span>
                      <span>{isEn ? 'Read' : 'Lesen'}</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={obj.common?.write === true}
                        onChange={(e) => extend.mutate({ id, common: { write: e.target.checked } })}
                        disabled={extend.isPending}
                        className="sr-only peer"
                      />
                      <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        obj.common?.write === true
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'
                      } ${extend.isPending ? 'opacity-50' : 'peer-focus:ring-1 peer-focus:ring-blue-400 dark:peer-focus:ring-blue-500'}`}>
                        {obj.common?.write === true && <Check size={11} className="text-white" strokeWidth={3} />}
                      </span>
                      <span>{isEn ? 'Write' : 'Schreiben'}</span>
                    </label>
                  </div>
                </div>
                {obj.common?.min !== undefined && (
                  <DetailRow label="Min/Max" value={`${obj.common.min} / ${obj.common.max}`} />
                )}

                {state && (
                  <>
                    <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800 items-center">
                      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Value' : 'Wert'}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        {expertMode ? (
                          <ExpertControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} unit={obj.common?.unit} type={type} language={language} />
                        ) : isSwitch ? (
                          <SwitchControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} disabled={!isWritable} />
                        ) : isButton ? (
                          <ButtonControl onSet={handleSet} isPending={setStateMutation.isPending} disabled={!isWritable} language={language} />
                        ) : isWritable && isNumberValue ? (
                          <NumberControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} unit={obj.common?.unit} />
                        ) : isWritable && type === 'boolean' ? (
                          <SwitchControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} />
                        ) : isWritable && (type === 'string' || type === 'mixed') ? (
                          <StringControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} unit={obj.common?.unit} language={language} />
                        ) : (
                          <span className="font-mono font-bold text-gray-900 dark:text-white text-base">
                            {formatValue(state.val)}
                            {obj.common?.unit && <span className="text-gray-500 dark:text-gray-400 ml-1 text-sm font-normal">{obj.common.unit}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                    <DetailRow
                      label="Acknowledged"
                      value={<span className={state.ack ? 'text-green-500 dark:text-green-400' : 'text-yellow-500 dark:text-yellow-400'}>{state.ack ? (isEn ? 'Yes' : 'Ja') : (isEn ? 'No' : 'Nein')}</span>}
                    />
                    <DetailRow label={isEn ? 'Quality' : 'Qualität'} value={state.q} />
                    <DetailRow label={isEn ? 'Timestamp' : 'Zeitstempel'} value={formatTimestamp(state.ts)} />
                    <DetailRow label={isEn ? 'Last change' : 'Letzte Änderung'} value={formatTimestamp(state.lc)} />
                    <DetailRow label={isEn ? 'From' : 'Von'} value={state.from || '—'} />
                    {state.c && <DetailRow label={isEn ? 'Comment' : 'Kommentar'} value={state.c} />}
                  </>
                )}

                {hasHistory(obj) && (
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">History</span>
                      {onOpenHistory && (
                        <button
                          onClick={() => { onClose(); onOpenHistory(); }}
                          className="flex items-center gap-0.5 text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          title={isEn ? 'Open in history modal' : 'Im History-Modal öffnen'}
                        >
                          <Maximize2 size={11} />
                          {isEn ? 'Fullscreen' : 'Vollbild'}
                        </button>
                      )}
                    </div>
                    <HistoryChart stateId={id} unit={obj.common?.unit} settingsCollapsible language={language} />
                  </div>
                )}
              </div>
            )}

            {tab === 'json' && (
              <>
                <JsonEditor value={draft} onChange={(v) => { setDraft(v); setJsonError(null); }} />
                {jsonError && (
                  <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 shrink-0">
                    <AlertTriangle size={13} className="shrink-0" />
                    {jsonError}
                  </div>
                )}
              </>
            )}

            {tab === 'alias' && (
              <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto flex-1">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Link2 size={11} className="text-amber-500" />
                    {isEn ? 'Target datapoint (alias.id)' : 'Ziel-Datenpunkt (alias.id)'}
                  </label>
                  <input
                    type="text"
                    value={aliasId}
                    onChange={(e) => setAliasId(e.target.value)}
                    className={`${inputCls} font-mono`}
                    placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {isEn
                      ? 'ID of the source datapoint this alias points to. Leave empty to remove alias.'
                      : 'ID des Quell-Datenpunkts, auf den dieser Alias zeigt. Leer lassen, um den Alias zu entfernen.'}
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {isEn ? 'Read formula' : 'Lese-Formel'} (alias.read){' '}
                    <span className="text-gray-400 dark:text-gray-500 font-normal">- {isEn ? 'optional' : 'optional'}</span>
                  </label>
                  <input
                    type="text"
                    value={aliasRead}
                    onChange={(e) => setAliasRead(e.target.value)}
                    className={`${inputCls} font-mono`}
                    placeholder="val / 10"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {isEn ? 'JavaScript expression for read conversion. Variable:' : 'JavaScript-Ausdruck zur Konvertierung beim Lesen. Variable:'}{' '}
                    <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">val</code>
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {isEn ? 'Write formula' : 'Schreib-Formel'} (alias.write){' '}
                    <span className="text-gray-400 dark:text-gray-500 font-normal">- {isEn ? 'optional' : 'optional'}</span>
                  </label>
                  <input
                    type="text"
                    value={aliasWrite}
                    onChange={(e) => setAliasWrite(e.target.value)}
                    className={`${inputCls} font-mono`}
                    placeholder="val * 10"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {isEn ? 'JavaScript expression for write conversion. Variable:' : 'JavaScript-Ausdruck zur Konvertierung beim Schreiben. Variable:'}{' '}
                    <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">val</code>
                  </p>
                </div>

                {obj.common.alias && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 text-xs border border-amber-200 dark:border-amber-800/40">
                    <div className="text-amber-600 dark:text-amber-400 font-medium mb-1.5 flex items-center gap-1.5">
                      <Link2 size={11} />
                      {isEn ? 'Currently saved alias' : 'Aktuell gespeicherter Alias'}
                    </div>
                    <pre className="font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-all">
                      {JSON.stringify(obj.common.alias, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            {tab === 'json' && (
              <button
                onClick={handleSaveJson}
                disabled={putObject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {putObject.isPending ? (isEn ? 'Saving…' : 'Speichern…') : (isEn ? 'Save' : 'Speichern')}
              </button>
            )}
            {tab === 'alias' && (
              <button
                onClick={handleSaveAlias}
                disabled={putObject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {putObject.isPending ? (isEn ? 'Saving…' : 'Speichern…') : (isEn ? 'Save' : 'Speichern')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
