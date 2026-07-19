import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { X, BarChart2, Play, ChevronDown, CheckCircle2, Pencil, ChevronRight, Check as CheckIcon } from 'lucide-react';
import type { IoBrokerObject, IoBrokerObjectCommon } from '../../types/iobroker';
import { useExtendObject, useUpdateRoomMembershipBatch, useUpdateFunctionMembershipBatch, useUpdateRoomMembership, useUpdateFunctionMembership, useAllRoles, useAllUnits } from '../../hooks/useStates';
import { useToast } from '../../context/ToastContext';
import BatchComboControl, { EMPTY_SENTINEL } from '../statelist/BatchComboControl';
import { ColoredId } from '../../utils/coloredId';

interface Props {
  onClose: () => void;
  language: 'en' | 'de';
  allObjects: Record<string, IoBrokerObject>;
  roomMap: Record<string, string>;         // enumId → name
  functionMap: Record<string, string>;     // enumId → name
  roomEnums: { id: string; name: string }[];
  fnEnums: { id: string; name: string }[];
  onOpenEdit: (id: string) => void;
  initialIds?: string[];  // pre-selected IDs → derives path
  initialPath?: string;   // explicit path override
}

interface CheckDef {
  key: string;
  labelEn: string;
  labelDe: string;
  shortEn: string;
  shortDe: string;
  onlyNumber?: boolean;
}

const CHECKS: CheckDef[] = [
  { key: 'room',     labelEn: 'Room missing',          labelDe: 'Raum fehlt',          shortEn: 'Room',    shortDe: 'Raum' },
  { key: 'function', labelEn: 'Function missing',      labelDe: 'Funktion fehlt',      shortEn: 'Function', shortDe: 'Funktion' },
  { key: 'role',     labelEn: 'Role missing',          labelDe: 'Rolle fehlt',         shortEn: 'Role',    shortDe: 'Rolle' },
  { key: 'name',     labelEn: 'Name missing',          labelDe: 'Name fehlt',          shortEn: 'Name',    shortDe: 'Name' },
  { key: 'desc',     labelEn: 'Description missing',   labelDe: 'Beschreibung fehlt',  shortEn: 'Description', shortDe: 'Beschreibung' },
  { key: 'unit',     labelEn: 'Unit missing',          labelDe: 'Einheit fehlt',       shortEn: 'Unit',    shortDe: 'Einh', onlyNumber: true },
  { key: 'minmax',   labelEn: 'Min/Max missing',    labelDe: 'Min/Max fehlt',       shortEn: 'Min/Max', shortDe: 'Min/Max', onlyNumber: true },
  { key: 'type',     labelEn: 'Type not set',       labelDe: 'Typ nicht gesetzt',   shortEn: 'Type',    shortDe: 'Typ' },
  { key: 'smartname',labelEn: 'SmartName missing',  labelDe: 'SmartName fehlt',     shortEn: 'Smart',   shortDe: 'Smart' },
];

const ISSUE_COLORS: Record<string, string> = {
  room:      'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  function:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  role:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  name:      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  desc:      'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  unit:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  minmax:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  type:      'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  smartname: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};

interface OptimizeResult {
  id: string;
  obj: IoBrokerObject;
  issues: string[];
}

function runChecks(
  id: string,
  obj: IoBrokerObject,
  activeChecks: Set<string>,
  roomMap: Record<string, string>,
  functionMap: Record<string, string>,
): string[] {
  const issues: string[] = [];
  const c = obj.common ?? {} as IoBrokerObjectCommon;
  const isNumber = c.type === 'number';
  const enums = (obj as IoBrokerObject & { enums?: Record<string, string> }).enums ?? {};

  if (activeChecks.has('room') && !Object.keys(enums).some(k => k.startsWith('enum.rooms.'))) issues.push('room');
  if (activeChecks.has('function') && !Object.keys(enums).some(k => k.startsWith('enum.functions.'))) issues.push('function');
  if (activeChecks.has('role') && !c.role) issues.push('role');
  if (activeChecks.has('name')) {
    const n = c.name;
    const label = typeof n === 'string' ? n : (n?.en || n?.de || '');
    if (!label) issues.push('name');
  }
  if (activeChecks.has('desc')) {
    const d = typeof c.desc === 'string' ? c.desc : (c.desc?.en || c.desc?.de || '');
    if (!d) issues.push('desc');
  }
  if (activeChecks.has('unit') && isNumber && !c.unit) issues.push('unit');
  if (activeChecks.has('minmax') && isNumber && (c.min == null || c.max == null)) issues.push('minmax');
  if (activeChecks.has('type') && !c.type) issues.push('type');
  if (activeChecks.has('smartname') && !c.smartName) issues.push('smartname');

  void roomMap; void functionMap; void id;
  return issues;
}

export default function OptimizeModal({ onClose, language, allObjects, roomMap, functionMap, roomEnums, fnEnums, onOpenEdit, initialIds, initialPath }: Props) {
  const isEn = language === 'en';
  useEscapeKey(onClose);

  // Derive starting path: explicit > from IDs > default
  const startPath = initialPath ?? (initialIds && initialIds.length > 0 ? initialIds[0] : 'alias.0.*');

  const [pathInput, setPathInput] = useState(startPath);
  const [activeChecks, setActiveChecks] = useState<Set<string>>(new Set(CHECKS.map(c => c.key)));
  const [results, setResults] = useState<OptimizeResult[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // per-row inline edit state
  const [inlineVals, setInlineVals] = useState<Record<string, Record<string, string>>>({});

  // Batch state
  const [batchRoomEnumId, setBatchRoomEnumId] = useState('');
  const [batchFnEnumId, setBatchFnEnumId] = useState('');
  const [batchRole, setBatchRole] = useState('');
  const [batchUnit, setBatchUnit] = useState('');

  const { data: roles = [] } = useAllRoles();
  const { data: units = [] } = useAllUnits();
  const extend = useExtendObject();
  const updateRoomBatch = useUpdateRoomMembershipBatch();
  const updateFnBatch = useUpdateFunctionMembershipBatch();
  const updateRoom = useUpdateRoomMembership();
  const updateFn = useUpdateFunctionMembership();
  const showToast = useToast();

  function getInline(id: string, key: string) { return inlineVals[id]?.[key] ?? ''; }
  function setInline(id: string, key: string, val: string) {
    setInlineVals(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
  }

  async function saveInlineRow(id: string, issues: string[]) {
    const vals = inlineVals[id] ?? {};
    const onErr = (err: unknown) => showToast(String(err), 'error');
    const common: Partial<IoBrokerObjectCommon> = {};
    if (issues.includes('role') && vals.role?.trim()) common.role = vals.role.trim();
    if (issues.includes('name') && vals.name?.trim()) common.name = vals.name.trim();
    if (issues.includes('desc') && vals.desc?.trim()) common.desc = vals.desc.trim();
    if (issues.includes('unit') && vals.unit?.trim()) common.unit = vals.unit.trim();
    if (Object.keys(common).length > 0) await extend.mutateAsync({ id, common }).catch(onErr);
    if (issues.includes('room') && vals.room) {
      const enumId = vals.room === EMPTY_SENTINEL ? null : vals.room;
      await updateRoom.mutateAsync({ objectId: id, oldRoomEnumId: null, newRoomEnumId: enumId }).catch(onErr);
    }
    if (issues.includes('function') && vals.function) {
      const enumId = vals.function === EMPTY_SENTINEL ? null : vals.function;
      await updateFn.mutateAsync({ objectId: id, oldFnEnumId: null, newFnEnumId: enumId }).catch(onErr);
    }
    showToast(isEn ? 'Saved' : 'Gespeichert', 'success');
    setExpandedId(null);
  }

  // Autocomplete suggestions
  const pathSuggestions = useMemo(() => {
    if (!pathInput.trim()) return [];
    const q = pathInput.toLowerCase();
    const prefixes = new Set<string>();
    for (const id of Object.keys(allObjects)) {
      if (id.toLowerCase().startsWith(q)) {
        const parts = id.split('.');
        for (let i = 1; i <= parts.length; i++) {
          const prefix = parts.slice(0, i).join('.');
          if (prefix.toLowerCase().startsWith(q)) prefixes.add(prefix);
        }
      }
    }
    return [...prefixes].sort().slice(0, 12);
  }, [pathInput, allObjects]);

  const [showSuggestions, setShowSuggestions] = useState(false);

  function runAnalyze(path: string, checks: Set<string>) {
    const p = path.trim();
    if (!p) return;
    const prefix = p.endsWith('*') ? p.replace(/\*$/, '') : (p.endsWith('.') ? p : p + '.');
    const isWild = p.endsWith('*');
    const res: OptimizeResult[] = [];
    for (const [id, obj] of Object.entries(allObjects)) {
      if (!obj || obj.type !== 'state') continue;
      if (isWild) {
        if (!id.startsWith(prefix)) continue;
      } else {
        if (id !== p && !id.startsWith(prefix)) continue;
      }
      const issues = runChecks(id, obj, checks, roomMap, functionMap);
      res.push({ id, obj, issues });
    }
    res.sort((a, b) => a.issues.length === 0 ? 1 : b.issues.length === 0 ? -1 : b.issues.length - a.issues.length || a.id.localeCompare(b.id));
    setResults(res);
    setAnalyzed(true);
    setCheckedIds(new Set());
  }

  function handleAnalyze() { runAnalyze(pathInput, activeChecks); }

  // Auto-run on open if path provided
  useEffect(() => {
    if (startPath !== 'alias.0.*' || initialPath) runAnalyze(startPath, activeChecks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run on chip change if already analyzed
  useEffect(() => {
    if (analyzed) runAnalyze(pathInput, activeChecks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChecks]);

  const displayed = showAll ? results : results.filter(r => r.issues.length > 0);
  const problemCount = results.filter(r => r.issues.length > 0).length;
  const allDisplayedChecked = displayed.length > 0 && displayed.every(r => checkedIds.has(r.id));
  const someChecked = checkedIds.size > 0;

  const roomById = useMemo(() => new Map(roomEnums.map(r => [r.id, r.name])), [roomEnums]);
  const fnById = useMemo(() => new Map(fnEnums.map(f => [f.id, f.name])), [fnEnums]);
  const noRoomLabel = isEn ? '— no room —' : '— kein Raum —';
  const noFunctionLabel = isEn ? '— no function —' : '— keine Funktion —';
  const roomNameOptions = [noRoomLabel, ...roomEnums.map(r => r.name)];
  const fnNameOptions = [noFunctionLabel, ...fnEnums.map(f => f.name)];

  const batchCanApply = batchRoomEnumId !== '' || batchFnEnumId !== '' || batchRole.trim() !== '' || batchUnit.trim() !== '';

  function handleBatchApply() {
    const ids = [...checkedIds];
    const onErr = (err: unknown) => showToast(String(err), 'error');
    if (batchRole.trim()) ids.forEach(id => extend.mutate({ id, common: { role: batchRole.trim() } }, { onError: onErr }));
    if (batchUnit.trim()) ids.forEach(id => extend.mutate({ id, common: { unit: batchUnit.trim() } }, { onError: onErr }));
    if (batchRoomEnumId !== '') {
      const newRoomEnumId = batchRoomEnumId === EMPTY_SENTINEL ? null : batchRoomEnumId;
      updateRoomBatch.mutate({ objectIds: ids, newRoomEnumId }, { onError: onErr });
    }
    if (batchFnEnumId !== '') {
      const newFnEnumId = batchFnEnumId === EMPTY_SENTINEL ? null : batchFnEnumId;
      updateFnBatch.mutate({ objectIds: ids, newFnEnumId }, { onError: onErr });
    }
    setBatchRole(''); setBatchUnit(''); setBatchRoomEnumId(''); setBatchFnEnumId('');
    showToast(isEn ? 'Batch applied' : 'Batch angewendet', 'success');
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-[95vw] max-h-[90vh] h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <BarChart2 size={15} className="text-gray-400" />
            {isEn ? 'Optimize' : 'Optimieren'}
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Config */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0 flex flex-col gap-3">
          {/* Path + Optimize button — always visible */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                value={pathInput}
                onChange={e => { setPathInput(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={e => { if (e.key === 'Enter') { setShowSuggestions(false); handleAnalyze(); } if (e.key === 'Escape') setShowSuggestions(false); }}
                placeholder={isEn ? 'Path prefix or wildcard, e.g. alias.0.*' : 'Pfad-Präfix oder Wildcard, z.B. alias.0.*'}
                className="w-full pr-7 px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {pathInput && (
                <button onClick={() => setPathInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={12} />
                </button>
              )}
              {showSuggestions && pathSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
                  {pathSuggestions.map(s => (
                    <button key={s} onMouseDown={() => { setPathInput(s); setShowSuggestions(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!pathInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
            >
              <Play size={12} />
              {isEn ? 'Optimize' : 'Optimieren'}
            </button>
          </div>

          {/* Checks */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setActiveChecks(
                activeChecks.size === CHECKS.length ? new Set() : new Set(CHECKS.map(c => c.key))
              )}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
            >
              {activeChecks.size === CHECKS.length ? (isEn ? 'None' : 'Keine') : (isEn ? 'All' : 'Alle')}
            </button>
            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
            {CHECKS.map(c => {
              const active = activeChecks.has(c.key);
              return (
                <button key={c.key} onClick={() => setActiveChecks(prev => {
                  const next = new Set(prev);
                  active ? next.delete(c.key) : next.add(c.key);
                  return next;
                })}
                  title={isEn ? c.labelEn : c.labelDe}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${active ? ISSUE_COLORS[c.key] + ' border-current/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'}`}
                >
                  {isEn ? c.shortEn : c.shortDe}
                </button>
              );
            })}
          </div>
          {/* Batch bar */}
          {someChecked && (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">
                {checkedIds.size} {isEn ? 'selected:' : 'ausgewählt:'}
              </span>
              <BatchComboControl
                value={batchRoomEnumId === '' ? '' : (batchRoomEnumId === EMPTY_SENTINEL ? noRoomLabel : (roomById.get(batchRoomEnumId) ?? ''))}
                onChange={name => {
                  if (!name.trim()) { setBatchRoomEnumId(''); return; }
                  if (name === noRoomLabel) { setBatchRoomEnumId(EMPTY_SENTINEL); return; }
                  const hit = roomEnums.find(r => r.name === name);
                  setBatchRoomEnumId(hit ? hit.id : '');
                }}
                placeholder={isEn ? 'Room…' : 'Raum…'} options={roomNameOptions} className="w-32" language={language}
              />
              <BatchComboControl
                value={batchFnEnumId === '' ? '' : (batchFnEnumId === EMPTY_SENTINEL ? noFunctionLabel : (fnById.get(batchFnEnumId) ?? ''))}
                onChange={name => {
                  if (!name.trim()) { setBatchFnEnumId(''); return; }
                  if (name === noFunctionLabel) { setBatchFnEnumId(EMPTY_SENTINEL); return; }
                  const hit = fnEnums.find(f => f.name === name);
                  setBatchFnEnumId(hit ? hit.id : '');
                }}
                placeholder={isEn ? 'Function…' : 'Funktion…'} options={fnNameOptions} className="w-32" language={language}
              />
              <BatchComboControl value={batchRole} onChange={setBatchRole} placeholder={isEn ? 'Role…' : 'Rolle…'} options={roles} className="w-28" language={language} />
              <BatchComboControl value={batchUnit} onChange={setBatchUnit} placeholder={isEn ? 'Unit…' : 'Einheit…'} options={units} className="w-24" language={language} />
              <button onClick={handleBatchApply} disabled={!batchCanApply}
                className="h-7 px-2.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {isEn ? 'Apply to all' : 'Alle anwenden'}
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="h-7 px-2 text-xs rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!analyzed ? (
            <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">
              {isEn ? 'Enter a path prefix and click Optimize.' : 'Pfad-Präfix eingeben und Optimieren klicken.'}
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-gray-400 dark:text-gray-500">
              {isEn ? 'No states found under this path.' : 'Keine States unter diesem Pfad gefunden.'}
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">
                    {results.length} {isEn ? 'states' : 'States'} · {' '}
                    <span className="text-red-500">{problemCount} {isEn ? 'with issues' : 'mit Problemen'}</span>
                    {' · '}
                    <span className="text-green-600 dark:text-green-400">{results.length - problemCount} OK</span>
                  </span>
                </div>
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <ChevronDown size={12} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
                  {showAll ? (isEn ? 'Problems only' : 'Nur Probleme') : (isEn ? 'Show all' : 'Alle anzeigen')}
                </button>
              </div>

              {/* Table */}
              <table className="w-full text-xs border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="w-8 px-2 py-1.5 text-center">
                      <input type="checkbox" checked={allDisplayedChecked} onChange={() => {
                        if (allDisplayedChecked) {
                          setCheckedIds(prev => { const n = new Set(prev); displayed.forEach(r => n.delete(r.id)); return n; });
                        } else {
                          setCheckedIds(prev => new Set([...prev, ...displayed.map(r => r.id)]));
                        }
                      }} className="w-3 h-3 accent-blue-500" />
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{isEn ? 'ID' : 'ID'}</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{isEn ? 'Name' : 'Name'}</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{isEn ? 'Issues' : 'Probleme'}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(r => {
                    const n = r.obj.common?.name;
                    const name = typeof n === 'string' ? n : (n?.de || n?.en || '');
                    const isOk = r.issues.length === 0;
                    const isExpanded = expandedId === r.id;
                    const colSpan = 5;
                    return (
                      <React.Fragment key={r.id}>
                      <tr className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${checkedIds.has(r.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                        <td className="w-8 px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => setCheckedIds(prev => {
                            const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n;
                          })} className="w-3 h-3 accent-blue-500" />
                        </td>
                        <td className="px-3 py-1.5 font-mono"><ColoredId id={r.id} className="!whitespace-normal !overflow-visible break-all" /></td>
                        <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate" title={name}>{name || <span className="text-gray-300 dark:text-gray-600 italic">—</span>}</td>
                        <td className="px-3 py-1.5">
                          {isOk ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 size={11} /> OK</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {r.issues.map(iss => {
                                const ch = CHECKS.find(c => c.key === iss);
                                return (
                                  <span key={iss} title={ch ? (isEn ? ch.labelEn : ch.labelDe) : iss}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ISSUE_COLORS[iss]}`}>
                                    {ch ? (isEn ? ch.shortEn : ch.shortDe) : iss}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="w-16 pr-2 flex items-center gap-0.5">
                          {!isOk && (
                            <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              title={isExpanded ? (isEn ? 'Collapse' : 'Einklappen') : (isEn ? 'Edit inline' : 'Inline bearbeiten')}
                              className={`p-1 rounded transition-colors ${isExpanded ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-blue-500 dark:hover:text-blue-400'}`}>
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          )}
                          <button onClick={() => onOpenEdit(r.id)} title={isEn ? 'Full editor' : 'Vollständiger Editor'}
                            className="p-1 rounded text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                            <Pencil size={12} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${r.id}_inline`} className="border-b border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10">
                          <td colSpan={colSpan} className="px-4 py-2">
                            <div className="flex flex-wrap items-end gap-2">
                              {r.issues.includes('room') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isEn ? 'Room' : 'Raum'}</span>
                                  <select value={getInline(r.id, 'room')} onChange={e => setInline(r.id, 'room', e.target.value)}
                                    className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                    <option value="">—</option>
                                    {roomEnums.map(re => <option key={re.id} value={re.id}>{re.name}</option>)}
                                  </select>
                                </div>
                              )}
                              {r.issues.includes('function') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isEn ? 'Function' : 'Funktion'}</span>
                                  <select value={getInline(r.id, 'function')} onChange={e => setInline(r.id, 'function', e.target.value)}
                                    className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400">
                                    <option value="">—</option>
                                    {fnEnums.map(fe => <option key={fe.id} value={fe.id}>{fe.name}</option>)}
                                  </select>
                                </div>
                              )}
                              {r.issues.includes('role') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isEn ? 'Role' : 'Rolle'}</span>
                                  <input value={getInline(r.id, 'role')} onChange={e => setInline(r.id, 'role', e.target.value)}
                                    list={`roles-${r.id}`} placeholder="e.g. value.temperature"
                                    className="h-7 w-48 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  <datalist id={`roles-${r.id}`}>{roles.map(ro => <option key={ro} value={ro} />)}</datalist>
                                </div>
                              )}
                              {r.issues.includes('name') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Name</span>
                                  <input value={getInline(r.id, 'name')} onChange={e => setInline(r.id, 'name', e.target.value)}
                                    className="h-7 w-40 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                </div>
                              )}
                              {r.issues.includes('desc') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isEn ? 'Description' : 'Beschreibung'}</span>
                                  <input value={getInline(r.id, 'desc')} onChange={e => setInline(r.id, 'desc', e.target.value)}
                                    className="h-7 w-48 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                </div>
                              )}
                              {r.issues.includes('unit') && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isEn ? 'Unit' : 'Einheit'}</span>
                                  <input value={getInline(r.id, 'unit')} onChange={e => setInline(r.id, 'unit', e.target.value)}
                                    list={`units-${r.id}`} placeholder="e.g. °C"
                                    className="h-7 w-28 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                  <datalist id={`units-${r.id}`}>{units.map(u => <option key={u} value={u} />)}</datalist>
                                </div>
                              )}
                              <button onClick={() => void saveInlineRow(r.id, r.issues)}
                                className="h-7 px-2.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 transition-colors self-end">
                                <CheckIcon size={11} /> {isEn ? 'Save' : 'Speichern'}
                              </button>
                              <button onClick={() => setExpandedId(null)}
                                className="h-7 px-2 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors self-end">
                                <X size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
