import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useQueryClient } from '@tanstack/react-query';
import { createObject, updateRoomMembership, updateFunctionMembership } from '../api/iobroker';
import { useRoomEnums, useFunctionEnums } from '../hooks/useStates';
import type { IoBrokerObject, IoBrokerObjectCommon } from '../types/iobroker';
import { isValidIoBrokerId } from '../utils/validation';

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
  name: string;
  type: string;
  role: string;
  unit: string;
  read: boolean;
  write: boolean;
  checked: boolean;
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

export default function AutoCreateAliasModal({ deviceId, allObjects, existingIds, onClose, onCreated, language = 'en' }: Props) {
  const isEn = language === 'en';
  const prefix = deviceId + '.';

  // Suggest a base path: alias.0.<last segment of deviceId>
  const defaultBasePath = useMemo(() => {
    const lastSegment = deviceId.split('.').slice(2).join('.');
    return lastSegment ? `alias.0.${lastSegment}` : 'alias.0.';
  }, [deviceId]);

  const [basePath, setBasePath] = useState(defaultBasePath);
  const [roomEnumId, setRoomEnumId] = useState<string>('');
  const [functionEnumId, setFunctionEnumId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: roomEnums = [] } = useRoomEnums();
  const { data: functionEnums = [] } = useFunctionEnums();
  const queryClient = useQueryClient();

  useEscapeKey(onClose);

  // Build rows from child state objects of the device
  const initialRows = useMemo<AliasRow[]>(() => {
    return Object.entries(allObjects)
      .filter(([id, obj]) => id.startsWith(prefix) && obj.type === 'state')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, obj]) => {
        const suffix = id.slice(prefix.length);
        const c = obj.common;
        return {
          sourceId: id,
          suffix,
          name: getObjectName(obj) || suffix.split('.').pop() || suffix,
          type: (c?.type as string) || 'mixed',
          role: (c?.role as string) || '',
          unit: (c?.unit as string) || '',
          read: c?.read !== false,
          write: c?.write === true,
          checked: true,
        };
      });
  }, [allObjects, prefix]);

  const [rows, setRows] = useState<AliasRow[]>(initialRows);

  const basePathTrimmed = basePath.replace(/\.+$/, '');

  const aliasIdForRow = (row: AliasRow) =>
    basePathTrimmed ? `${basePathTrimmed}.${row.suffix}` : `alias.0.${row.suffix}`;

  const checkedRows = rows.filter((r) => r.checked);

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
  }, [checkedRows, basePath, existingIds, isEn]);

  const hasErrors = rowErrors.size > 0;

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked })));
  }

  function toggleRow(sourceId: string) {
    setRows((prev) => prev.map((r) => r.sourceId === sourceId ? { ...r, checked: !r.checked } : r));
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
          name: row.name,
          type: row.type as IoBrokerObjectCommon['type'],
          role: row.role || undefined,
          unit: row.unit || undefined,
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
        className="w-full max-w-3xl bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]"
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
            <input
              autoFocus
              type="text"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              className={`${inputCls} font-mono w-full`}
              placeholder="alias.0.Wohnzimmer.Lampe"
              spellCheck={false}
              disabled={isCreating || done}
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              {isEn
                ? `Aliases will be created as: ${basePathTrimmed || 'alias.0'}.<suffix>`
                : `Aliases werden erstellt als: ${basePathTrimmed || 'alias.0'}.<Suffix>`}
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
              <div className="flex items-center justify-between">
                <span className={labelCls}>
                  {isEn ? 'Datapoints' : 'Datenpunkte'}
                  <span className="ml-1.5 text-gray-400 font-normal">({checkedRows.length}/{rows.length})</span>
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleAll(true)} className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 transition-colors">{isEn ? 'All' : 'Alle'}</button>
                  <button type="button" onClick={() => toggleAll(false)} className="text-[10px] text-gray-400 hover:text-gray-600 dark:text-gray-500 transition-colors">{isEn ? 'None' : 'Keine'}</button>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 w-8"></th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Alias ID' : 'Alias-ID'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Name' : 'Name'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Type' : 'Typ'}</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Role' : 'Rolle'}</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {rows.map((row) => {
                        const aliasId = aliasIdForRow(row);
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
                            <td className="px-2 py-1.5 font-mono text-gray-600 dark:text-gray-400 truncate max-w-0 w-2/5" title={aliasId}>
                              {aliasId}
                            </td>
                            <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-0 w-1/5" title={row.name}>
                              {row.name}
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">{row.type}</td>
                            <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 truncate">{row.role}</td>
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
