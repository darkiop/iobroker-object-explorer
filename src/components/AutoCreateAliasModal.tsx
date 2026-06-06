import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useQueryClient } from '@tanstack/react-query';
import { createObject, updateRoomMembership, updateFunctionMembership } from '../api/iobroker';
import { useRoomEnums, useFunctionEnums, useAllRoles, useAllUnits } from '../hooks/useStates';
import type { IoBrokerObject, IoBrokerObjectCommon } from '../types/iobroker';
import { isValidIoBrokerId } from '../utils/validation';
import { compilePattern, isGlobPattern } from '../api/iobroker';

interface Props {
  deviceId: string;
  allObjects: Record<string, IoBrokerObject>;
  existingIds: Set<string>;
  onClose: () => void;
  onCreated?: (aliasIds: string[]) => void;
  language?: 'en' | 'de';
}

interface AliasRow {
  sourceId: string;
  suffix: string;
  suffixDraft: string;   // editable override for alias ID suffix
  name: string;
  nameDraft: string;     // editable override for alias name
  type: string;
  typeDraft: string;     // editable override for type
  role: string;
  roleDraft: string;     // editable override for role
  unit: string;
  unitDraft: string;
  read: boolean;
  write: boolean;
  checked: boolean;
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

const ALIAS_PREFIX = 'alias.0.';

export default function AutoCreateAliasModal({ deviceId, allObjects, existingIds, onClose, onCreated, language = 'en' }: Props) {
  const isEn = language === 'en';
  const prefix = deviceId + '.';

  const defaultBaseSuffix = useMemo(() => {
    return deviceId.split('.').slice(2).join('.');
  }, [deviceId]);

  const [baseSuffix, setBaseSuffix] = useState(defaultBaseSuffix);
  const [roomEnumId, setRoomEnumId] = useState<string>('');
  const [functionEnumId, setFunctionEnumId] = useState<string>('');
  const [rowFilter, setRowFilter] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: roomEnums = [] } = useRoomEnums();
  const { data: functionEnums = [] } = useFunctionEnums();
  const { data: allRoles = [] } = useAllRoles();
  const { data: allUnits = [] } = useAllUnits();
  const queryClient = useQueryClient();

  useEscapeKey(onClose);

  // Build rows from child state objects of the device
  const initialRows = useMemo<AliasRow[]>(() => {
    return Object.entries(allObjects)
      .filter(([id, obj]) => id.startsWith(prefix) && obj.type === 'state' && !id.startsWith('alias.'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, obj]) => {
        const suffix = id.slice(prefix.length);
        const c = obj.common;
        const name = getObjectName(obj) || suffix.split('.').pop() || suffix;
        const role = (c?.role as string) || '';
        return {
          sourceId: id,
          suffix,
          suffixDraft: suffix,
          name,
          nameDraft: name,
          type: (c?.type as string) || 'mixed',
          typeDraft: (c?.type as string) || 'mixed',
          role,
          roleDraft: role,
          unit: (c?.unit as string) || '',
          unitDraft: (c?.unit as string) || '',
          read: c?.read !== false,
          write: c?.write === true,
          checked: true,
        };
      });
  }, [allObjects, prefix]);

  const [rows, setRows] = useState<AliasRow[]>(initialRows);

  const fullBasePath = ALIAS_PREFIX + baseSuffix;
  const basePathTrimmed = fullBasePath.replace(/\.+$/, '');

  const basePathSuggestions = useMemo(() => {
    const suffixes = new Set<string>();
    for (const id of Object.keys(allObjects)) {
      if (!id.startsWith(ALIAS_PREFIX)) continue;
      const parts = id.split('.');
      for (let i = 3; i < parts.length; i++) {
        suffixes.add(parts.slice(2).slice(0, i - 2).join('.'));
      }
    }
    return Array.from(suffixes).filter(Boolean).sort();
  }, [allObjects]);

  const aliasIdForRow = (row: AliasRow) => `${basePathTrimmed}.${row.suffixDraft}`;

  const checkedRows = rows.filter((r) => r.checked);
  const visibleRows = useMemo(() => {
    if (!rowFilter) return rows;
    if (isGlobPattern(rowFilter)) {
      const regex = compilePattern(rowFilter);
      return rows.filter((r) => regex.test(r.suffix) || regex.test(r.name));
    }
    const lower = rowFilter.toLowerCase();
    return rows.filter((r) => r.suffix.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower));
  }, [rows, rowFilter]);

  const rowErrors = useMemo(() => {
    const errors = new Map<string, string>();
    const seen = new Set<string>();
    for (const row of checkedRows) {
      const aliasId = aliasIdForRow(row);
      if (!isValidIoBrokerId(aliasId)) {
        errors.set(row.sourceId, isEn ? 'Invalid ID' : 'Ungültige ID');
      } else if (existingIds.has(aliasId)) {
        errors.set(row.sourceId, isEn ? 'Already exists' : 'Existiert bereits');
      } else if (seen.has(aliasId)) {
        errors.set(row.sourceId, isEn ? 'Duplicate' : 'Duplikat');
      }
      seen.add(aliasId);
    }
    return errors;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedRows, baseSuffix, existingIds, isEn]);

  const hasErrors = rowErrors.size > 0;

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function toggleRow(sourceId: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, checked: !r.checked } : r));
  }

  function updateSuffixDraft(sourceId: string, val: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, suffixDraft: val } : r));
  }

  function updateNameDraft(sourceId: string, val: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, nameDraft: val } : r));
  }

  function updateRoleDraft(sourceId: string, val: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, roleDraft: val } : r));
  }

  function updateUnitDraft(sourceId: string, val: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, unitDraft: val } : r));
  }

  function updateTypeDraft(sourceId: string, val: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, typeDraft: val } : r));
  }

  async function handleCreate() {
    if (checkedRows.length === 0 || hasErrors) return;
    setIsCreating(true);
    setCreateError(null);
    const created: string[] = [];
    try {
      for (const row of checkedRows) {
        const aliasId = aliasIdForRow(row);
        const common: Partial<IoBrokerObjectCommon> = {
          name: row.nameDraft || row.name,
          type: (row.typeDraft || row.type) as IoBrokerObjectCommon['type'],
          role: row.roleDraft || row.role || undefined,
          unit: row.unitDraft || undefined,
          read: row.read,
          write: row.write,
          alias: { id: row.sourceId },
        };
        await createObject(aliasId, common, 'state');
        if (roomEnumId) await updateRoomMembership(aliasId, null, roomEnumId);
        if (functionEnumId) await updateFunctionMembership(aliasId, null, functionEnumId);
        created.push(aliasId);
        setCreatedCount(created.length);
      }
      queryClient.invalidateQueries({ queryKey: ['objects'] });
      if (roomEnumId || functionEnumId) queryClient.invalidateQueries({ queryKey: ['metadata'] });
      setDone(true);
      onCreated?.(created);
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setIsCreating(false);
    }
  }

  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500';
  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const selectCls = `${inputCls} w-full`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {isEn ? 'Auto-create aliases' : 'Aliases auto-erstellen'}
              </h2>
              <div className="font-mono text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-xs" title={deviceId}>{deviceId}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Base path input */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>
              {isEn ? 'Alias base path' : 'Alias-Basispfad'} <span className="text-red-500">*</span>
            </label>
            <datalist id="alias-base-path-suggestions">
              {basePathSuggestions.map((p) => <option key={p} value={p} />)}
            </datalist>
            <div className={`${inputCls} flex items-center p-0 overflow-hidden`}>
              <span className="px-2.5 py-1.5 font-mono text-sm text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 border-r border-gray-300 dark:border-gray-600 select-none shrink-0">
                {ALIAS_PREFIX}
              </span>
              <input
                autoFocus
                type="text"
                list="alias-base-path-suggestions"
                value={baseSuffix}
                onChange={(e) => setBaseSuffix(e.target.value)}
                className="flex-1 px-2.5 py-1.5 font-mono text-sm bg-transparent focus:outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Wohnzimmer.Lampe"
                spellCheck={false}
                disabled={isCreating || done}
              />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              {isEn
                ? `Aliases will be created as: ${basePathTrimmed}.<suffix>`
                : `Aliases werden erstellt als: ${basePathTrimmed}.<Suffix>`}
            </p>
          </div>

          {/* Room + Function selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{isEn ? 'Room (optional)' : 'Raum (optional)'}</label>
              <select
                value={roomEnumId}
                onChange={(e) => setRoomEnumId(e.target.value)}
                className={selectCls}
                disabled={isCreating || done}
              >
                <option value="">{isEn ? '— None —' : '— Kein Raum —'}</option>
                {roomEnums.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{isEn ? 'Function (optional)' : 'Funktion (optional)'}</label>
              <select
                value={functionEnumId}
                onChange={(e) => setFunctionEnumId(e.target.value)}
                className={selectCls}
                disabled={isCreating || done}
              >
                <option value="">{isEn ? '— None —' : '— Keine Funktion —'}</option>
                {functionEnums.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {/* Datapoints table */}
          {rows.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 italic py-4 text-center">
              {isEn ? 'No state datapoints found under this device.' : 'Keine State-Datenpunkte unter diesem Gerät gefunden.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`${labelCls} shrink-0`}>
                  {isEn ? 'Datapoints' : 'Datenpunkte'}
                  <span className="ml-1.5 text-gray-400 font-normal">({checkedRows.length}/{rows.length})</span>
                </span>
                <div className="relative flex-1 max-w-xs">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={rowFilter}
                    onChange={(e) => setRowFilter(e.target.value)}
                    placeholder={isEn ? 'Filter…' : 'Filtern…'}
                    className="pl-6 py-0.5 w-full text-[11px] bg-transparent border-b border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500"
                    disabled={isCreating || done}
                  />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => toggleAll(true)} className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 transition-colors">{isEn ? 'All' : 'Alle'}</button>
                  <button type="button" onClick={() => toggleAll(false)} className="text-[10px] text-gray-400 hover:text-gray-600 dark:text-gray-500 transition-colors">{isEn ? 'None' : 'Keine'}</button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 w-8"></th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Source' : 'Quelle'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Alias ID' : 'Alias-ID'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Name' : 'Name'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-36">{isEn ? 'Type' : 'Typ'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-28">{isEn ? 'Unit' : 'Einheit'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-36">{isEn ? 'Role' : 'Rolle'}</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {visibleRows.map((row) => {
                        const err = rowErrors.get(row.sourceId);
                        return (
                          <tr
                            key={row.sourceId}
                            className={`cursor-pointer transition-colors ${row.checked ? 'hover:bg-gray-50 dark:hover:bg-gray-800/40' : 'opacity-40 hover:opacity-60 hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                            onClick={() => toggleRow(row.sourceId)}
                          >
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={row.checked}
                                onChange={() => toggleRow(row.sourceId)}
                                onClick={(e) => e.stopPropagation()}
                                className="accent-blue-500"
                              />
                            </td>
                            <td className="px-2 py-1 max-w-0 w-1/5">
                              <div className="font-mono text-[11px] text-gray-400 dark:text-gray-500 truncate" title={row.sourceId}>
                                {row.suffix}
                              </div>
                            </td>
                            <td className="px-2 py-1 max-w-0 w-2/5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 font-mono text-[11px] min-w-0">
                                {basePathTrimmed && (
                                  <span className="text-gray-400 dark:text-gray-500 shrink-0 truncate max-w-[40%]" title={basePathTrimmed + '.'}>{basePathTrimmed}.</span>
                                )}
                                <input
                                  type="text"
                                  value={row.suffixDraft}
                                  onChange={(e) => updateSuffixDraft(row.sourceId, e.target.value)}
                                  disabled={isCreating || done}
                                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 font-mono text-[11px]"
                                  spellCheck={false}
                                />
                              </div>
                            </td>
                            <td className="px-2 py-1 max-w-0 w-1/5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={row.nameDraft}
                                onChange={(e) => updateNameDraft(row.sourceId, e.target.value)}
                                disabled={isCreating || done}
                                className="w-full px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 text-[11px]"
                              />
                            </td>
                            <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={row.typeDraft}
                                onChange={(e) => updateTypeDraft(row.sourceId, e.target.value)}
                                disabled={isCreating || done}
                                className="w-full px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 text-[11px]"
                              >
                                {['number','string','boolean','object','mixed','array','json','file'].map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={row.unitDraft}
                                onChange={(e) => updateUnitDraft(row.sourceId, e.target.value)}
                                disabled={isCreating || done}
                                className="w-full px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 text-[11px] font-mono"
                              >
                                <option value="">—</option>
                                {allUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1 w-1/5" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={row.roleDraft}
                                onChange={(e) => updateRoleDraft(row.sourceId, e.target.value)}
                                disabled={isCreating || done}
                                className="w-full px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 text-[11px]"
                              >
                                <option value="">—</option>
                                {allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {err && <span title={err}><AlertTriangle size={12} className="text-amber-500" /></span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Status */}
          {done && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded px-3 py-2">
              <Check size={13} />
              {isEn ? `${createdCount} alias(es) created successfully.` : `${createdCount} Alias(e) erfolgreich erstellt.`}
            </div>
          )}
          {createError && (
            <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              <AlertTriangle size={13} />
              {createError}
            </div>
          )}
          {isCreating && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              {isEn ? `Creating ${createdCount} / ${checkedRows.length}…` : `Erstelle ${createdCount} / ${checkedRows.length}…`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="text-xs text-gray-400 dark:text-gray-500">
            {hasErrors && !done && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={11} />
                {isEn ? `${rowErrors.size} error(s)` : `${rowErrors.size} Fehler`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {done ? (isEn ? 'Close' : 'Schließen') : (isEn ? 'Cancel' : 'Abbrechen')}
            </button>
            {!done && (
              <button
                type="button"
                onClick={() => { void handleCreate(); }}
                disabled={isCreating || checkedRows.length === 0 || hasErrors}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                <Link2 size={13} />
                {isCreating
                  ? (isEn ? 'Creating…' : 'Erstelle…')
                  : (isEn ? `Create ${checkedRows.length} alias(es)` : `${checkedRows.length} Alias(e) erstellen`)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
