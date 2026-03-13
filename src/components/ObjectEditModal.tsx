import { useState, useRef, useEffect, useMemo } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { X, Save, AlertTriangle, Link2, Check, Wrench, Trash2, Maximize2, Copy, ChevronDown, Lock, Zap, PenLine, FolderInput } from 'lucide-react';
import { usePutObject, useExtendObject, useStateDetail, useSetState, useAllRoles, useAllUnits, useDeleteObject, useAllObjects, useRoomEnums, useFunctionEnums, useUpdateRoomMembership, useUpdateFunctionMembership, useSqlInstances } from '../hooks/useStates';
import { hasHistory } from '../api/iobroker';
import HistoryChart from './HistoryChart';
import ConfirmDialog from './ConfirmDialog';
import CopyDatapointModal from './CopyDatapointModal';
import RenameDatapointModal from './RenameDatapointModal';
import MoveDatapointModal from './MoveDatapointModal';
import type { IoBrokerObject, IoBrokerObjectCommon } from '../types/iobroker';
import { useToast } from '../context/ToastContext';
import { ColoredId } from '../utils/coloredId';
import { getRoleColor } from '../utils/roleColor';

interface Props {
  id: string;
  obj: IoBrokerObject;
  onClose: () => void;
  onOpenHistory?: () => void;
  language?: 'en' | 'de';
  dateFormat?: 'de' | 'us' | 'iso';
  initialTab?: 'details' | 'json' | 'alias' | 'custom';
}

type Tab = 'details' | 'json' | 'alias' | 'custom';
const STATE_TYPES = ['number', 'string', 'boolean', 'array', 'object', 'mixed'] as const;

const SQL_CUSTOM_DEFAULT: Record<string, unknown> = {
  enabled: true,
  storageType: '',
  counter: false,
  aliasId: '',
  debounceTime: 0,
  blockTime: 0,
  changesOnly: true,
  changesRelogInterval: 0,
  changesMinDelta: 0,
  ignoreBelowNumber: '',
  disableSkippedValueLogging: false,
  retention: 31536000,
  customRetentionDuration: 365,
  maxLength: 0,
  enableDebugLogs: false,
  debounce: 1000,
};

// ── helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function getObjectName(common: { name: string | Record<string, string> } | undefined): string {
  if (!common?.name) return '';
  if (typeof common.name === 'string') return common.name;
  return common.name.de || common.name.en || Object.values(common.name)[0] || '';
}

const SELECT_CLS = 'w-full bg-gray-50/70 text-gray-700 text-sm rounded-md px-2.5 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors';

function InlineInputRow({ label, value, onSave, isPending }: { label: string; value: string; onSave: (v: string) => void; isPending: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setDraft(value); }}
        disabled={isPending}
        className={SELECT_CLS}
      />
    </div>
  );
}

function InlineNumberRow({ label, value, onSave, onClear, isPending }: { label: string; value: number | undefined; onSave: (v: number) => void; onClear: () => void; isPending: boolean }) {
  const [draft, setDraft] = useState(value !== undefined ? String(value) : '');
  useEffect(() => { setDraft(value !== undefined ? String(value) : ''); }, [value]);
  function commit() {
    if (draft === '') { onClear(); return; }
    const n = parseFloat(draft);
    if (!isNaN(n) && n !== value) onSave(n);
  }
  return (
    <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setDraft(value !== undefined ? String(value) : ''); }}
        disabled={isPending}
        placeholder="—"
        className={SELECT_CLS + ' [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 dark:text-gray-200 text-sm break-all">{value}</span>
    </div>
  );
}

function BooleanSelectControl({ val, onSet, isPending, disabled }: { val: unknown; onSet: (v: unknown) => void; isPending: boolean; disabled?: boolean }) {
  const draft = String(Boolean(val));
  return (
    <select
      value={draft}
      onChange={(e) => onSet(e.target.value === 'true')}
      disabled={isPending || disabled}
      className="bg-white text-gray-800 text-sm rounded px-2 py-0.5 border border-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
}

function ButtonControl({ onSet, isPending, disabled, language = 'en' }: { onSet: (v: unknown) => void; isPending: boolean; disabled?: boolean; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  return (
    <button
      onClick={() => onSet(true)}
      disabled={isPending || disabled}
      title={isEn ? 'Trigger' : 'Auslösen'}
      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50 transition-colors"
    >
      <Zap size={13} />
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

// ── Custom Settings helpers ─────────────────────────────────────────────────

function CustomNumberInput({ value, onChange }: { value: number; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    const n = Number(draft);
    if (!isNaN(n)) onChange(n);
    else setDraft(String(value));
  }
  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className="w-28 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-200 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none"
    />
  );
}

function CustomSettingRow({ fieldKey, value, onChange }: { fieldKey: string; value: unknown; onChange: (v: unknown) => void }) {
  const labelCls = 'text-gray-400 dark:text-gray-500 text-xs w-52 shrink-0 font-mono';
  const rowCls = 'flex gap-4 py-1 border-b border-gray-100 dark:border-gray-800/60 items-center';

  if (typeof value === 'boolean') {
    return (
      <div className={rowCls}>
        <span className={labelCls}>{fieldKey}</span>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'}`}>
            {value && <Check size={11} className="text-white" strokeWidth={3} />}
          </span>
        </label>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div className={rowCls}>
        <span className={labelCls}>{fieldKey}</span>
        <CustomNumberInput value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className={rowCls}>
      <span className={labelCls}>{fieldKey}</span>
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm rounded px-2 py-0.5 border border-gray-200 dark:border-gray-700 focus:border-blue-400 dark:focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function ObjectEditModal({ id, obj, onClose, onOpenHistory, language = 'en', dateFormat = 'de', initialTab }: Props) {
  const isEn = language === 'en';
  const showToast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'details');
  const [draft, setDraft] = useState(() => JSON.stringify(obj, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showMove, setShowMove] = useState(false);

  // Custom Settings tab state
  const [customDraft, setCustomDraft] = useState<NonNullable<IoBrokerObjectCommon['custom']>>(
    () => obj.common.custom ?? {}
  );
  const [expandedAdapters, setExpandedAdapters] = useState<Set<string>>(
    () => new Set(Object.keys(obj.common.custom ?? {}))
  );

  function toggleAdapter(adapterId: string) {
    setExpandedAdapters((prev) => {
      const next = new Set(prev);
      if (next.has(adapterId)) next.delete(adapterId);
      else next.add(adapterId);
      return next;
    });
  }

  function setCustomField(adapterId: string, field: string, value: unknown) {
    setCustomDraft((prev) => ({
      ...prev,
      [adapterId]: { ...prev[adapterId], [field]: value },
    }));
  }

  // Alias tab state
  const [aliasSeparateIds, setAliasSeparateIds] = useState(() => typeof obj.common.alias?.id === 'object');
  const [aliasId, setAliasId] = useState(() => typeof obj.common.alias?.id === 'string' ? obj.common.alias.id : '');
  const [aliasReadId, setAliasReadId] = useState(() => typeof obj.common.alias?.id === 'object' ? (obj.common.alias.id.read ?? '') : '');
  const [aliasWriteId, setAliasWriteId] = useState(() => typeof obj.common.alias?.id === 'object' ? (obj.common.alias.id.write ?? '') : '');
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
  const [aliasTestInput, setAliasTestInput] = useState('');
  const [aliasTestResult, setAliasTestResult] = useState<{ read?: string; readErr?: string; write?: string; writeErr?: string } | null>(null);

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
  const { data: sqlInstances = [] } = useSqlInstances();

  const role = obj.common?.role ?? '';
  const type = obj.common?.type ?? '';
  const isWritable = obj.common?.write === true;
  const isButton = role === 'button' || role.startsWith('button.');

  useEffect(() => {
    const nextRoom = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.rooms.')) ?? null;
    const nextFn = Object.keys(obj.enums ?? {}).find((enumId) => enumId.startsWith('enum.functions.')) ?? null;
    setRoomEnumId(nextRoom);
    setFnEnumId(nextFn);
  }, [id, obj.enums]);

  useEscapeKey(onClose);

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
    putObject.mutate({ id, obj: parsed }, {
      onSuccess: onClose,
      onError: (err) => setJsonError((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSaveCustom() {
    putObject.mutate({ id, obj: { ...obj, common: { ...obj.common, custom: customDraft } } }, {
      onSuccess: onClose,
      onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSaveAlias() {
    const newCommon = { ...obj.common };
    const formulas = {
      ...(aliasRead.trim() ? { read: aliasRead.trim() } : {}),
      ...(aliasWrite.trim() ? { write: aliasWrite.trim() } : {}),
    };
    if (aliasSeparateIds) {
      const rId = aliasReadId.trim();
      const wId = aliasWriteId.trim();
      if (rId || wId) {
        newCommon.alias = {
          id: { ...(rId ? { read: rId } : {}), ...(wId ? { write: wId } : {}) },
          ...formulas,
        };
      } else {
        delete newCommon.alias;
      }
    } else {
      const trimmedId = aliasId.trim();
      if (trimmedId) {
        newCommon.alias = { id: trimmedId, ...formulas };
      } else {
        delete newCommon.alias;
      }
    }
    putObject.mutate({ id, obj: { ...obj, common: newCommon } }, {
      onSuccess: onClose,
      onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)),
    });
  }

  function handleSave() {
    if (tab === 'json') { handleSaveJson(); return; }
    if (tab === 'alias') { handleSaveAlias(); return; }
    if (tab === 'custom') { handleSaveCustom(); return; }
    // Details tab saves inline; keep a consistent primary action in footer.
    onClose();
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

  function runFormulaTest() {
    const raw = aliasTestInput.trim();
    const val: unknown = raw === '' ? undefined : isNaN(Number(raw)) ? raw : Number(raw);
    const result: typeof aliasTestResult = {};
    if (aliasRead.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        result.read = String(new Function('val', `return (${aliasRead.trim()})`)(val));
      } catch (e) {
        result.readErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (aliasWrite.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        result.write = String(new Function('val', `return (${aliasWrite.trim()})`)(val));
      } catch (e) {
        result.writeErr = e instanceof Error ? e.message : String(e);
      }
    }
    setAliasTestResult(result);
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
      {showRename && (
        <RenameDatapointModal
          sourceId={id}
          sourceObj={obj}
          sourceState={state}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowRename(false)}
          onRenamed={() => { setShowRename(false); onClose(); }}
        />
      )}
      {showMove && (
        <MoveDatapointModal
          sourceId={id}
          sourceObj={obj}
          sourceState={state}
          existingIds={existingIds}
          language={language}
          onClose={() => setShowMove(false)}
          onMoved={() => { setShowMove(false); onClose(); }}
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
        className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl flex flex-col h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate pr-4 flex items-center gap-1.5">
              {obj.common?.write === false && (
                <Lock size={13} className="text-red-500 dark:text-red-400 shrink-0" />
              )}
              {isEn ? 'Edit object:' : 'Objekt bearbeiten:'}{' '}
              <ColoredId id={id} className="font-mono text-xs" />
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
              <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 px-5">
            {(['details', 'json', ...(id.startsWith('alias.') ? ['alias'] : []), 'custom'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setJsonError(null); }}
                className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t === 'details' ? 'Details' : t === 'json' ? 'JSON' : t === 'alias' ? 'Alias' : 'Custom'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {tab === 'details' && (
              <div className="px-5 py-4 space-y-0 overflow-y-auto flex-1">
                <InlineInputRow label="Name" value={getObjectName(obj.common)} onSave={(v) => saveField('name', v)} isPending={extend.isPending} />
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Type' : 'Typ'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={obj.common?.type || ''}
                      onChange={(e) => saveField('type', e.target.value)}
                      disabled={extend.isPending}
                      className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
                    >
                      <option value="">{isEn ? 'No type' : 'Kein Typ'}</option>
                      {STATE_TYPES.map((stateType) => (
                        <option key={stateType} value={stateType}>{stateType}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Role' : 'Rolle'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={obj.common?.role || ''}
                      onChange={(e) => saveField('role', e.target.value)}
                      disabled={extend.isPending}
                      className={`w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors ${obj.common?.role ? getRoleColor(obj.common.role) : 'text-gray-700 dark:text-gray-200'}`}
                    >
                      <option value="">{isEn ? 'No role' : 'Keine Rolle'}</option>
                      {(roles ?? []).map((roleEntry) => (
                        <option key={roleEntry} value={roleEntry}>
                          {roleEntry}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Unit' : 'Einheit'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={obj.common?.unit || ''}
                      onChange={(e) => saveField('unit', e.target.value)}
                      disabled={extend.isPending}
                      className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
                    >
                      <option value="">{isEn ? 'No unit' : 'Keine Einheit'}</option>
                      {(units ?? []).map((unitEntry) => (
                        <option key={unitEntry} value={unitEntry}>
                          {unitEntry}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Room' : 'Raum'}</span>
                  <div className="flex-1 relative">
                    <select
                      value={roomEnumId ?? ''}
                      onChange={(e) => handleSetRoom(e.target.value || null)}
                      disabled={updateRoom.isPending}
                      className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
                    >
                      <option value="">{isEn ? 'No room' : 'Kein Raum'}</option>
                      {roomEnums.map((roomEntry) => (
                        <option key={roomEntry.id} value={roomEntry.id}>
                          {roomEntry.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500"
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
                      className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
                    >
                      <option value="">{isEn ? 'No function' : 'Keine Funktion'}</option>
                      {fnEnums.map((fnEntry) => (
                        <option key={fnEntry.id} value={fnEntry.id}>
                          {fnEntry.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500"
                    />
                  </div>
                </div>
                <InlineInputRow
                  label={isEn ? 'Description' : 'Beschreibung'}
                  value={typeof obj.common?.desc === 'string' ? obj.common.desc : obj.common?.desc ? JSON.stringify(obj.common.desc) : ''}
                  onSave={(v) => saveField('desc', v)}
                  isPending={extend.isPending}
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
                {type === 'number' && (
                  <>
                    <InlineNumberRow label="Min" value={obj.common?.min} onSave={(v) => extend.mutate({ id, common: { min: v } })} onClear={() => extend.mutate({ id, common: { min: undefined } })} isPending={extend.isPending} />
                    <InlineNumberRow label="Max" value={obj.common?.max} onSave={(v) => extend.mutate({ id, common: { max: v } })} onClear={() => extend.mutate({ id, common: { max: undefined } })} isPending={extend.isPending} />
                    <InlineNumberRow label="Step" value={obj.common?.step} onSave={(v) => extend.mutate({ id, common: { step: v } })} onClear={() => extend.mutate({ id, common: { step: undefined } })} isPending={extend.isPending} />
                  </>
                )}

                {state && (
                  <>
                    <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800 items-center">
                      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Value' : 'Wert'}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        {expertMode ? (
                          <ExpertControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} unit={obj.common?.unit} type={type} language={language} />
                        ) : isButton ? (
                          <ButtonControl onSet={handleSet} isPending={setStateMutation.isPending} disabled={!isWritable} language={language} />
                        ) : isWritable && type === 'number' ? (
                          <NumberControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} unit={obj.common?.unit} />
                        ) : isWritable && type === 'boolean' ? (
                          <BooleanSelectControl val={state.val} onSet={handleSet} isPending={setStateMutation.isPending} disabled={!isWritable} />
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
                    <HistoryChart stateId={id} unit={obj.common?.unit} settingsCollapsible language={language} dateFormat={dateFormat} />
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

            {tab === 'custom' && (
              <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto flex-1">
                {sqlInstances.length > 0 && (
                  <div className="flex flex-col gap-1.5 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {isEn ? 'Available adapters' : 'Verfügbare Adapter'}
                    </div>
                    {sqlInstances.map((instanceId) => {
                      const alreadyConfigured = instanceId in customDraft;
                      return (
                        <label key={instanceId} className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={alreadyConfigured}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCustomDraft((prev) => ({ ...prev, [instanceId]: { ...SQL_CUSTOM_DEFAULT } }));
                                setExpandedAdapters((prev) => new Set([...prev, instanceId]));
                              } else {
                                setCustomDraft((prev) => { const next = { ...prev }; delete next[instanceId]; return next; });
                                setExpandedAdapters((prev) => { const next = new Set(prev); next.delete(instanceId); return next; });
                              }
                            }}
                            className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200 font-mono">{instanceId}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">SQL History</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {Object.keys(customDraft).length === 0 ? (
                  <div className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
                    {isEn ? 'No custom settings configured' : 'Keine benutzerdefinierten Einstellungen konfiguriert'}
                  </div>
                ) : (
                  Object.entries(customDraft).map(([adapterId, settings]) => {
                    const isExpanded = expandedAdapters.has(adapterId);
                    const isEnabled = settings.enabled === true;
                    const otherEntries = Object.entries(settings).filter(([k]) => k !== 'enabled');
                    return (
                      <div key={adapterId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleAdapter(adapterId)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                          <ChevronDown
                            size={14}
                            className={`text-gray-400 dark:text-gray-500 transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`}
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
                            {isEn ? 'Settings' : 'Einstellungen'} {adapterId}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            isEnabled
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            {isEnabled ? 'ENABLED' : 'DISABLED'}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="px-3 py-1">
                            <CustomSettingRow
                              fieldKey="enabled"
                              value={settings.enabled ?? false}
                              onChange={(v) => setCustomField(adapterId, 'enabled', v)}
                            />
                            {otherEntries.map(([key, val]) => (
                              <CustomSettingRow
                                key={key}
                                fieldKey={key}
                                value={val}
                                onChange={(v) => setCustomField(adapterId, key, v)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'alias' && (
              <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto flex-1">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aliasSeparateIds}
                    onChange={(e) => setAliasSeparateIds(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${aliasSeparateIds ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'}`}>
                    {aliasSeparateIds && <Check size={11} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {isEn ? 'Separate source IDs for read and write (alias.id.read / alias.id.write)' : 'Separate Quell-IDs für Lesen und Schreiben (alias.id.read / alias.id.write)'}
                  </span>
                </label>

                {aliasSeparateIds ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Link2 size={11} className="text-amber-500" />
                        {isEn ? 'Read source ID (alias.id.read)' : 'Lese-Quell-ID (alias.id.read)'}
                        <span className="font-normal text-gray-400 dark:text-gray-500">- {isEn ? 'optional' : 'optional'}</span>
                      </label>
                      <input
                        type="text"
                        value={aliasReadId}
                        onChange={(e) => setAliasReadId(e.target.value)}
                        className={`${inputCls} font-mono`}
                        placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Link2 size={11} className="text-amber-500" />
                        {isEn ? 'Write source ID (alias.id.write)' : 'Schreib-Quell-ID (alias.id.write)'}
                        <span className="font-normal text-gray-400 dark:text-gray-500">- {isEn ? 'optional' : 'optional'}</span>
                      </label>
                      <input
                        type="text"
                        value={aliasWriteId}
                        onChange={(e) => setAliasWriteId(e.target.value)}
                        className={`${inputCls} font-mono`}
                        placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
                        spellCheck={false}
                      />
                    </div>
                  </>
                ) : (
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
                )}

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

                {(aliasRead.trim() || aliasWrite.trim()) && (
                  <div className="flex flex-col gap-2 pt-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {isEn ? 'Formula tester' : 'Formel-Tester'}
                    </span>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={aliasTestInput}
                        onChange={(e) => { setAliasTestInput(e.target.value); setAliasTestResult(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') runFormulaTest(); }}
                        className={`${inputCls} font-mono flex-1`}
                        placeholder={isEn ? 'Test value (val)' : 'Testwert (val)'}
                        spellCheck={false}
                      />
                      <button
                        onClick={runFormulaTest}
                        disabled={!aliasTestInput.trim()}
                        className="px-3 py-1.5 text-xs rounded border border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        {isEn ? 'Test' : 'Testen'}
                      </button>
                    </div>
                    {aliasTestResult && (
                      <div className="flex flex-col gap-1 font-mono text-xs">
                        {aliasRead.trim() && (
                          aliasTestResult.readErr
                            ? <div className="text-red-500 dark:text-red-400">Read: <span className="text-red-600 dark:text-red-300">{aliasTestResult.readErr}</span></div>
                            : <div className="text-gray-600 dark:text-gray-300">Read: <span className="text-green-700 dark:text-green-400 font-semibold">{aliasTestResult.read}</span></div>
                        )}
                        {aliasWrite.trim() && (
                          aliasTestResult.writeErr
                            ? <div className="text-red-500 dark:text-red-400">Write: <span className="text-red-600 dark:text-red-300">{aliasTestResult.writeErr}</span></div>
                            : <div className="text-gray-600 dark:text-gray-300">Write: <span className="text-green-700 dark:text-green-400 font-semibold">{aliasTestResult.write}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-red-300 dark:border-red-700/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={isEn ? 'Delete datapoint' : 'Datenpunkt löschen'}
              >
                <Trash2 size={12} />
                {isEn ? 'Delete' : 'Löschen'}
              </button>
              <button
                type="button"
                onClick={() => setShowCopy(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Copy datapoint' : 'Datenpunkt kopieren'}
              >
                <Copy size={12} />
                {isEn ? 'Copy' : 'Kopieren'}
              </button>
              <button
                type="button"
                onClick={() => setShowRename(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Rename datapoint' : 'Datenpunkt umbenennen'}
              >
                <PenLine size={12} />
                {isEn ? 'Rename' : 'Umbenennen'}
              </button>
              <button
                type="button"
                onClick={() => setShowMove(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={isEn ? 'Move datapoint' : 'Datenpunkt verschieben'}
              >
                <FolderInput size={12} />
                {isEn ? 'Move' : 'Verschieben'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={handleSave}
                disabled={putObject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {putObject.isPending ? (isEn ? 'Saving…' : 'Speichern…') : (isEn ? 'Save' : 'Speichern')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
