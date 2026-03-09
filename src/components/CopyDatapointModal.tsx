import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Link2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useCreateDatapoint } from '../hooks/useStates';
import type { IoBrokerObject } from '../types/iobroker';
import { isValidIoBrokerId } from '../utils/validation';

interface Props {
  sourceId: string;
  sourceObj: IoBrokerObject | undefined;
  existingIds: Set<string>;
  onClose: () => void;
  onCreated?: (newId: string) => void;
  language?: 'en' | 'de';
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

function getAliasTargetString(rawId: string | { read?: string; write?: string } | undefined): string {
  if (!rawId) return '';
  if (typeof rawId === 'string') return rawId;
  return rawId.read || rawId.write || '';
}

function replaceAliasTarget(
  rawId: string | { read?: string; write?: string } | undefined,
  from: string,
  to: string,
): string | { read?: string; write?: string } | undefined {
  if (!rawId || !from) return rawId;
  if (typeof rawId === 'string') return rawId.replace(from, to);
  return {
    ...(rawId.read  ? { read:  rawId.read.replace(from, to)  } : {}),
    ...(rawId.write ? { write: rawId.write.replace(from, to) } : {}),
  };
}

export default function CopyDatapointModal({ sourceId, sourceObj, existingIds, onClose, onCreated, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [newId, setNewId] = useState(sourceId + '_copy');
  const [name, setName] = useState(() => {
    const n = getObjectName(sourceObj);
    return n ? `${n} (${isEn ? 'Copy' : 'Kopie'})` : '';
  });
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateDatapoint();

  const srcCommon = sourceObj?.common;
  const isAlias = sourceId.startsWith('alias.0.') && !!srcCommon?.alias?.id;
  const originalAliasId = isAlias ? srcCommon?.alias?.id : undefined;
  const [replaceFrom, setReplaceFrom] = useState(() => getAliasTargetString(originalAliasId));
  const [replaceTo, setReplaceTo] = useState('');

  const newAliasTarget = isAlias && replaceFrom && replaceTo
    ? replaceAliasTarget(originalAliasId, replaceFrom, replaceTo)
    : originalAliasId;

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEscapeKey(onClose);

  function validate(): string {
    const id = newId.trim();
    if (!id) return isEn ? 'ID is required.' : 'ID ist erforderlich.';
    if (!isValidIoBrokerId(id)) return isEn ? 'Invalid ID format. Use only letters, digits, underscores, hyphens and dots.' : 'Ungültiges ID-Format. Nur Buchstaben, Ziffern, Unterstriche, Bindestriche und Punkte erlaubt.';
    if (existingIds.has(id)) return isEn ? `"${id}" already exists.` : `„${id}" existiert bereits.`;
    if (!name.trim()) return isEn ? 'Name is required.' : 'Name ist erforderlich.';
    return '';
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    // Copy all relevant common properties from source
    const common: Record<string, unknown> = {
      name: name.trim(),
    };
    if (srcCommon) {
      if (srcCommon.type)  common.type  = srcCommon.type;
      if (srcCommon.role)  common.role  = srcCommon.role;
      if (srcCommon.unit)  common.unit  = srcCommon.unit;
      if (srcCommon.read  !== undefined) common.read  = srcCommon.read;
      if (srcCommon.write !== undefined) common.write = srcCommon.write;
      if (srcCommon.min   !== undefined) common.min   = srcCommon.min;
      if (srcCommon.max   !== undefined) common.max   = srcCommon.max;
      if (srcCommon.desc)  common.desc  = srcCommon.desc;
      if (srcCommon.states) common.states = srcCommon.states;
      if (isAlias && srcCommon.alias) {
        common.alias = {
          ...srcCommon.alias,
          id: newAliasTarget,
        };
      }
    }

    create.mutate(
      { id: newId.trim(), common: common as Parameters<typeof create.mutate>[0]['common'] },
      {
        onSuccess: () => {
          onCreated?.(newId.trim());
          onClose();
        },
        onError: (err) => setError(String(err)),
      }
    );
  }

  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 animate-modal-in rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Copy size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'Copy datapoint' : 'Datenpunkt kopieren'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-5 py-4 flex flex-col gap-4">
          {/* Source info */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{isEn ? 'Source' : 'Quelle'}</div>
            <div className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={sourceId}>{sourceId}</div>
            {srcCommon && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                {[
                  srcCommon.type && `${isEn ? 'Type' : 'Typ'}: ${srcCommon.type}`,
                  srcCommon.role && `${isEn ? 'Role' : 'Rolle'}: ${srcCommon.role}`,
                  srcCommon.unit && `${isEn ? 'Unit' : 'Einheit'}: ${srcCommon.unit}`,
                ].filter(Boolean).map((s) => (
                  <span key={s} className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* New ID */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{isEn ? 'New ID' : 'Neue ID'} <span className="text-red-500">*</span></label>
            <input
              ref={inputRef}
              type="text"
              value={newId}
              onChange={(e) => { setNewId(e.target.value); setError(''); }}
              className={`${inputCls} font-mono`}
              placeholder={isEn ? 'new.datapoint.id' : 'neue.datenpunkt.id'}
              spellCheck={false}
            />
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>{isEn ? 'Name' : 'Name'} <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              className={inputCls}
              placeholder={isEn ? 'Display name' : 'Anzeigename'}
            />
          </div>

          {/* Alias target replace (only for alias.0.* objects) */}
          {isAlias && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Link2 size={12} />
                {isEn ? 'Replace alias target' : 'Alias-Ziel ersetzen'}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>{isEn ? 'Replace (in target ID)' : 'Ersetzen (in Ziel-ID)'}</label>
                  <input
                    type="text"
                    value={replaceFrom}
                    onChange={(e) => setReplaceFrom(e.target.value)}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder={isEn ? 'old string…' : 'alter String…'}
                    spellCheck={false}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>{isEn ? 'With' : 'Mit'}</label>
                  <input
                    type="text"
                    value={replaceTo}
                    onChange={(e) => setReplaceTo(e.target.value)}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder={isEn ? 'new string…' : 'neuer String…'}
                    spellCheck={false}
                  />
                </div>
              </div>
              {/* Preview */}
              <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono bg-white/60 dark:bg-gray-800/50 rounded px-2 py-1.5 break-all">
                <span className="text-gray-400 dark:text-gray-500">{isEn ? 'Target → ' : 'Ziel → '}</span>
                {typeof newAliasTarget === 'object'
                  ? [newAliasTarget?.read && `read: ${newAliasTarget.read}`, newAliasTarget?.write && `write: ${newAliasTarget.write}`].filter(Boolean).join(' / ')
                  : (newAliasTarget ?? '—')}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Copy size={13} />
              {create.isPending ? (isEn ? 'Copying...' : 'Kopiere...') : (isEn ? 'Copy' : 'Kopieren')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
