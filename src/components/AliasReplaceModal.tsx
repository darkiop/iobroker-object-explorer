import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useQueryClient } from '@tanstack/react-query';
import { putFullObject } from '../api/iobroker';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  allObjects: Record<string, IoBrokerObject>;
  onClose: () => void;
  language?: 'en' | 'de';
  initialOldStr?: string;
}

interface PreviewRow {
  aliasId: string;
  oldTarget: string;
  newTarget: string;
  rawOldId: string | { read?: string; write?: string };
  rawNewId: string | { read?: string; write?: string };
}

function applyReplace(
  rawId: string | { read?: string; write?: string } | undefined,
  from: string,
  to: string,
): { old: string; new: string; rawNew: string | { read?: string; write?: string } } | null {
  if (!rawId) return null;
  if (typeof rawId === 'string') {
    if (!rawId.includes(from)) return null;
    const replaced = rawId.split(from).join(to);
    return { old: rawId, new: replaced, rawNew: replaced };
  }
  const readOld = rawId.read ?? '';
  const writeOld = rawId.write ?? '';
  const readNew = readOld ? readOld.split(from).join(to) : readOld;
  const writeNew = writeOld ? writeOld.split(from).join(to) : writeOld;
  const hasChange = (readOld && readNew !== readOld) || (writeOld && writeNew !== writeOld);
  if (!hasChange) return null;
  const rawNew: { read?: string; write?: string } = {};
  if (readOld) rawNew.read = readNew;
  if (writeOld) rawNew.write = writeNew;
  const oldStr = [readOld && `r: ${readOld}`, writeOld && `w: ${writeOld}`].filter(Boolean).join(' / ');
  const newStr = [readOld && `r: ${readNew}`, writeOld && `w: ${writeNew}`].filter(Boolean).join(' / ');
  return { old: oldStr, new: newStr, rawNew };
}

export default function AliasReplaceModal({ allObjects, onClose, language = 'en', initialOldStr = '' }: Props) {
  const isEn = language === 'en';
  const [oldStr, setOldStr] = useState(initialOldStr);
  const [newStr, setNewStr] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const queryClient = useQueryClient();

  useEscapeKey(onClose);

  const preview = useMemo<PreviewRow[]>(() => {
    if (!oldStr.trim()) return [];
    const rows: PreviewRow[] = [];
    for (const [id, obj] of Object.entries(allObjects)) {
      if (!id.startsWith('alias.0.')) continue;
      const rawId = obj.common?.alias?.id;
      const result = applyReplace(rawId, oldStr, newStr);
      if (!result) continue;
      rows.push({
        aliasId: id,
        oldTarget: result.old,
        newTarget: result.new,
        rawOldId: rawId as string | { read?: string; write?: string },
        rawNewId: result.rawNew,
      });
    }
    return rows;
  }, [allObjects, oldStr, newStr]);

  async function handleApply() {
    if (!preview.length || !newStr.trim()) return;
    setIsApplying(true);
    setApplyError(null);
    let count = 0;
    try {
      for (const row of preview) {
        const obj = allObjects[row.aliasId];
        if (!obj) continue;
        const updated: IoBrokerObject = {
          ...obj,
          common: {
            ...obj.common,
            alias: { ...obj.common.alias, id: row.rawNewId },
          },
        };
        await putFullObject(row.aliasId, updated);
        // Update cache immediately
        queryClient.setQueriesData(
          { queryKey: ['objects'] },
          (old: Record<string, IoBrokerObject> | undefined) =>
            old ? { ...old, [row.aliasId]: updated } : old
        );
        count++;
        setAppliedCount(count);
      }
      setDone(true);
    } catch (err) {
      setApplyError(String(err));
    } finally {
      setIsApplying(false);
    }
  }

  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 font-mono';
  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {isEn ? 'Find & Replace in Alias Targets' : 'Alias-Ziele ersetzen (Find & Replace)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Search inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{isEn ? 'Find (in alias target IDs)' : 'Suchen (in Alias-Ziel-IDs)'}</label>
              <input
                autoFocus
                type="text"
                value={oldStr}
                onChange={(e) => { setOldStr(e.target.value); setDone(false); setAppliedCount(0); }}
                className={inputCls}
                placeholder="hm-rpc.0.ABC1234"
                spellCheck={false}
                disabled={isApplying}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>{isEn ? 'Replace with' : 'Ersetzen durch'}</label>
              <input
                type="text"
                value={newStr}
                onChange={(e) => { setNewStr(e.target.value); setDone(false); setAppliedCount(0); }}
                className={inputCls}
                placeholder="hm-rpc.0.NEWDEV01"
                spellCheck={false}
                disabled={isApplying}
              />
            </div>
          </div>

          {/* Preview */}
          {oldStr.trim() && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {isEn ? 'Preview' : 'Vorschau'}
                {preview.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">
                    {preview.length} {isEn ? 'affected' : 'betroffen'}
                  </span>
                )}
              </div>
              {preview.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                  {isEn ? 'No matching alias targets found.' : 'Keine übereinstimmenden Alias-Ziele gefunden.'}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-2/5">{isEn ? 'Alias ID' : 'Alias-ID'}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'Old target' : 'Altes Ziel'}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">{isEn ? 'New target' : 'Neues Ziel'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {preview.map((row) => (
                          <tr key={row.aliasId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-400 truncate max-w-0 w-2/5" title={row.aliasId}>
                              {row.aliasId}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-red-600 dark:text-red-400 truncate max-w-0" title={row.oldTarget}>
                              {row.oldTarget}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-green-600 dark:text-green-400 truncate max-w-0" title={row.newTarget}>
                              {row.newTarget || <span className="text-gray-400 italic">{isEn ? '(empty)' : '(leer)'}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status messages */}
          {done && (
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded px-3 py-2">
              <Check size={13} />
              {isEn ? `${appliedCount} alias(es) updated successfully.` : `${appliedCount} Alias(e) erfolgreich aktualisiert.`}
            </div>
          )}
          {applyError && (
            <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              <AlertTriangle size={13} />
              {applyError}
            </div>
          )}
          {isApplying && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              {isEn ? `Updating ${appliedCount} / ${preview.length}…` : `Aktualisiere ${appliedCount} / ${preview.length}…`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
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
              onClick={() => { void handleApply(); }}
              disabled={isApplying || preview.length === 0 || !newStr.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={isApplying ? 'animate-spin' : ''} />
              {isApplying
                ? (isEn ? 'Applying…' : 'Wird angewendet…')
                : (isEn ? `Apply (${preview.length})` : `Anwenden (${preview.length})`)}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
