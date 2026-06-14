import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Lock, ChevronDown, Check, Zap, Maximize2 } from 'lucide-react';
import { hasHistory } from '../../api/iobroker';
import { formatTimestamp, formatValue } from '../../utils/format';
import HistoryChart from '../history/HistoryChart';
import type { IoBrokerObject, IoBrokerState } from '../../types/iobroker';
import { getRoleColor } from '../../utils/roleColor';

const SELECT_CLS = 'w-full bg-gray-50/70 text-gray-700 text-sm rounded-md px-2.5 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors';

const STATE_TYPES = ['number', 'string', 'boolean', 'array', 'object', 'mixed'] as const;

function getObjectName(common: { name: string | Record<string, string> } | undefined): string {
  if (!common?.name) return '';
  if (typeof common.name === 'string') return common.name;
  return common.name.de || common.name.en || Object.values(common.name)[0] || '';
}

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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide flex items-center gap-1">
        <Lock size={9} className="shrink-0 opacity-50" />
        {label}
      </span>
      <span className="text-gray-800 dark:text-gray-200 text-sm break-all">{value}</span>
    </div>
  );
}

function SectionHeader({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${first ? 'mb-1' : 'mt-5 mb-1'}`}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
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

// ── DetailsTab ─────────────────────────────────────────────────────────────

interface DetailsTabProps {
  id: string;
  obj: IoBrokerObject;
  language: 'en' | 'de';
  dateFormat: 'de' | 'us' | 'iso';
  expertMode: boolean;
  roomEnumId: string | null;
  fnEnumId: string | null;
  roles: string[];
  units: string[];
  roomEnums: Array<{ id: string; name: string }>;
  fnEnums: Array<{ id: string; name: string }>;
  state: IoBrokerState | undefined;
  extendPending: boolean;
  setValuePending: boolean;
  setRoomPending: boolean;
  setFunctionPending: boolean;
  onExtend: (common: Record<string, unknown>) => void;
  onSetValue: (val: unknown) => void;
  onSetRoom: (roomId: string | null) => void;
  onSetFunction: (fnId: string | null) => void;
  onOpenHistory?: () => void;
  onClose: () => void;
}

export default function DetailsTab({
  id, obj, language, dateFormat, expertMode,
  roomEnumId, fnEnumId, roles, units, roomEnums, fnEnums,
  state, extendPending, setValuePending, setRoomPending, setFunctionPending,
  onExtend, onSetValue, onSetRoom, onSetFunction,
  onOpenHistory, onClose,
}: DetailsTabProps) {
  const isEn = language === 'en';
  const role = obj.common?.role ?? '';
  const type = obj.common?.type ?? '';
  const isWritable = obj.common?.write === true;
  const isButton = role === 'button' || role.startsWith('button.');

  function saveField(field: string, value: string) {
    onExtend({ [field]: value });
  }

  return (
    <div className="px-5 py-4 overflow-y-auto flex-1">

      {/* ── Identity ── */}
      <SectionHeader label={isEn ? 'Identity' : 'Identität'} first />
      <InlineInputRow label="Name" value={getObjectName(obj.common)} onSave={(v) => saveField('name', v)} isPending={extendPending} />
      <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
        <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide flex items-center gap-1">
          <Lock size={9} className="shrink-0 opacity-50" />
          {isEn ? 'Object type' : 'Objekttyp'}
        </span>
        <input readOnly value={obj.type} className={SELECT_CLS + ' cursor-default'} />
      </div>
      <InlineInputRow
        label={isEn ? 'Description' : 'Beschreibung'}
        value={typeof obj.common?.desc === 'string' ? obj.common.desc : obj.common?.desc ? JSON.stringify(obj.common.desc) : ''}
        onSave={(v) => saveField('desc', v)}
        isPending={extendPending}
      />

      {/* ── Type & Role ── */}
      <SectionHeader label={isEn ? 'Type & Role' : 'Typ & Rolle'} />
      <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
        <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Role' : 'Rolle'}</span>
        <div className="flex-1 relative">
          <select
            value={obj.common?.role || ''}
            onChange={(e) => saveField('role', e.target.value)}
            disabled={extendPending}
            className={`w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors ${obj.common?.role ? getRoleColor(obj.common.role) : 'text-gray-700 dark:text-gray-200'}`}
          >
            <option value="">{isEn ? 'No role' : 'Keine Rolle'}</option>
            {roles.map((roleEntry) => (
              <option key={roleEntry} value={roleEntry}>{roleEntry}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500" />
        </div>
      </div>
      {obj.type === 'state' && (
        <>
          <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Value type' : 'Werttyp'}</span>
            <div className="flex-1 relative">
              <select
                value={obj.common?.type || ''}
                onChange={(e) => saveField('type', e.target.value)}
                disabled={extendPending}
                className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
              >
                <option value="">{isEn ? 'No type' : 'Kein Typ'}</option>
                {STATE_TYPES.map((stateType) => (
                  <option key={stateType} value={stateType}>{stateType}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500" />
            </div>
          </div>
          <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Unit' : 'Einheit'}</span>
            <div className="flex-1 relative">
              <select
                value={obj.common?.unit || ''}
                onChange={(e) => saveField('unit', e.target.value)}
                disabled={extendPending}
                className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
              >
                <option value="">{isEn ? 'No unit' : 'Keine Einheit'}</option>
                {units.map((unitEntry) => (
                  <option key={unitEntry} value={unitEntry}>{unitEntry}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500" />
            </div>
          </div>
        </>
      )}

      {/* ── Permissions & Range (state only) ── */}
      {obj.type === 'state' && (
        <>
          <SectionHeader label={isEn ? 'Permissions & Range' : 'Berechtigungen & Bereich'} />
          <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Read / Write' : 'Lesen / Schreiben'}</span>
            <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-200">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={obj.common?.read !== false}
                  onChange={(e) => onExtend({ read: e.target.checked })}
                  disabled={extendPending}
                  className="sr-only peer"
                />
                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  obj.common?.read !== false ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'
                } ${extendPending ? 'opacity-50' : 'peer-focus:ring-1 peer-focus:ring-blue-400 dark:peer-focus:ring-blue-500'}`}>
                  {obj.common?.read !== false && <Check size={11} className="text-white" strokeWidth={3} />}
                </span>
                <span>{isEn ? 'Read' : 'Lesen'}</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={obj.common?.write === true}
                  onChange={(e) => onExtend({ write: e.target.checked })}
                  disabled={extendPending}
                  className="sr-only peer"
                />
                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  obj.common?.write === true ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600'
                } ${extendPending ? 'opacity-50' : 'peer-focus:ring-1 peer-focus:ring-blue-400 dark:peer-focus:ring-blue-500'}`}>
                  {obj.common?.write === true && <Check size={11} className="text-white" strokeWidth={3} />}
                </span>
                <span>{isEn ? 'Write' : 'Schreiben'}</span>
              </label>
            </div>
          </div>
          {type === 'number' && (
            <>
              <InlineNumberRow label="Min" value={obj.common?.min} onSave={(v) => onExtend({ min: v })} onClear={() => onExtend({ min: undefined })} isPending={extendPending} />
              <InlineNumberRow label="Max" value={obj.common?.max} onSave={(v) => onExtend({ max: v })} onClear={() => onExtend({ max: undefined })} isPending={extendPending} />
              <InlineNumberRow label="Step" value={obj.common?.step} onSave={(v) => onExtend({ step: v })} onClear={() => onExtend({ step: undefined })} isPending={extendPending} />
            </>
          )}
        </>
      )}

      {/* ── Smart Home Classification ── */}
      <SectionHeader label="Smart Home" />
      <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
        <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Room' : 'Raum'}</span>
        <div className="flex-1 relative">
          <select
            value={roomEnumId ?? ''}
            onChange={(e) => onSetRoom(e.target.value || null)}
            disabled={setRoomPending}
            className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
          >
            <option value="">{isEn ? 'No room' : 'Kein Raum'}</option>
            {roomEnums.map((roomEntry) => (
              <option key={roomEntry.id} value={roomEntry.id}>{roomEntry.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500" />
        </div>
      </div>
      <div className="flex gap-4 py-1 border-b border-gray-200 dark:border-gray-800 items-center">
        <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Function' : 'Funktion'}</span>
        <div className="flex-1 relative">
          <select
            value={fnEnumId ?? ''}
            onChange={(e) => onSetFunction(e.target.value || null)}
            disabled={setFunctionPending}
            className="w-full appearance-none [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-gray-200 bg-gray-50/70 text-gray-700 text-sm rounded-md pl-2.5 pr-8 py-1.5 border border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300/70 disabled:opacity-50 dark:bg-gray-800/70 dark:text-gray-200 dark:border-gray-700 dark:focus:border-gray-600 dark:focus:ring-gray-600/60 transition-colors"
          >
            <option value="">{isEn ? 'No function' : 'Keine Funktion'}</option>
            {fnEnums.map((fnEntry) => (
              <option key={fnEntry.id} value={fnEntry.id}>{fnEntry.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-500" />
        </div>
      </div>

      {/* ── Live Value ── */}
      {state && (
        <>
          <SectionHeader label={isEn ? 'Live value' : 'Aktueller Wert'} />
          <div className="flex gap-4 py-1.5 border-b border-gray-200 dark:border-gray-800 items-center">
            <span className="text-gray-400 dark:text-gray-500 text-xs w-32 shrink-0 uppercase tracking-wide">{isEn ? 'Value' : 'Wert'}</span>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {expertMode ? (
                <ExpertControl val={state.val} onSet={onSetValue} isPending={setValuePending} unit={obj.common?.unit} type={type} language={language} />
              ) : isButton ? (
                <ButtonControl onSet={onSetValue} isPending={setValuePending} disabled={!isWritable} language={language} />
              ) : isWritable && type === 'number' ? (
                <NumberControl val={state.val} onSet={onSetValue} isPending={setValuePending} unit={obj.common?.unit} />
              ) : isWritable && type === 'boolean' ? (
                <BooleanSelectControl val={state.val} onSet={onSetValue} isPending={setValuePending} disabled={!isWritable} />
              ) : isWritable && (type === 'string' || type === 'mixed') ? (
                <StringControl val={state.val} onSet={onSetValue} isPending={setValuePending} unit={obj.common?.unit} language={language} />
              ) : role === 'url' && typeof state.val === 'string' && state.val.startsWith('http') ? (
                <a href={state.val} target="_blank" rel="noopener noreferrer" className="font-mono font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline break-all text-base">
                  {formatValue(state.val, true)}
                </a>
              ) : (
                <span className="font-mono font-bold text-gray-900 dark:text-white text-base">
                  {formatValue(state.val, true)}
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
          <DetailRow label={isEn ? 'Timestamp' : 'Zeitstempel'} value={formatTimestamp(state.ts, dateFormat)} />
          <DetailRow label={isEn ? 'Last change' : 'Letzte Änderung'} value={formatTimestamp(state.lc, dateFormat)} />
          <DetailRow label={isEn ? 'From' : 'Von'} value={state.from || '—'} />
          {state.c && <DetailRow label={isEn ? 'Comment' : 'Kommentar'} value={state.c} />}
        </>
      )}

      {/* ── History ── */}
      {hasHistory(obj) && (
        <>
          <SectionHeader label="History" />
          <div className="flex items-center gap-2 mb-2">
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
        </>
      )}

    </div>
  );
}
