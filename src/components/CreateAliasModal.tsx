import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, ArrowRight } from 'lucide-react';
import { useCreateDatapoint } from '../hooks/useStates';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  sourceId: string;
  sourceObj: IoBrokerObject | undefined;
  existingIds: Set<string>;
  onClose: () => void;
  onCreated?: (aliasId: string) => void;
}

function suggestAliasId(sourceId: string): string {
  // Strip adapter prefix (first two dot-segments: "adapter.instance.")
  const parts = sourceId.split('.');
  const withoutPrefix = parts.length > 2 ? parts.slice(2).join('.') : sourceId;
  return `alias.0.${withoutPrefix}`;
}

function getObjectName(obj: IoBrokerObject | undefined): string {
  if (!obj?.common?.name) return '';
  if (typeof obj.common.name === 'string') return obj.common.name;
  return obj.common.name.de || obj.common.name.en || Object.values(obj.common.name)[0] || '';
}

export default function CreateAliasModal({ sourceId, sourceObj, existingIds, onClose, onCreated }: Props) {
  const [aliasId, setAliasId] = useState(() => suggestAliasId(sourceId));
  const [name, setName] = useState(() => getObjectName(sourceObj));
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateDatapoint();

  const srcCommon = sourceObj?.common;
  const srcType   = srcCommon?.type   ?? 'mixed';
  const srcRole   = srcCommon?.role   ?? '';
  const srcUnit   = srcCommon?.unit   ?? '';
  const srcRead   = srcCommon?.read   !== false;
  const srcWrite  = srcCommon?.write  !== false;

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function validate(): string {
    const id = aliasId.trim();
    if (!id) return 'Alias-ID ist erforderlich.';
    if (!id.startsWith('alias.0.')) return 'Alias-ID muss mit „alias.0." beginnen.';
    if (existingIds.has(id)) return `„${id}" existiert bereits.`;
    if (!name.trim()) return 'Name ist erforderlich.';
    return '';
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    create.mutate(
      {
        id: aliasId.trim(),
        common: {
          name: name.trim(),
          type: srcType as 'number' | 'string' | 'boolean' | 'mixed',
          role: srcRole || undefined,
          unit: srcUnit || undefined,
          read: srcRead,
          write: srcWrite,
          alias: { id: sourceId },
        },
      },
      {
        onSuccess: () => {
          onCreated?.(aliasId.trim());
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Alias anlegen</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-5 py-4 flex flex-col gap-4">
          {/* Source → Alias visualization */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2.5 text-xs">
            <div className="flex-1 min-w-0">
              <div className="text-gray-400 dark:text-gray-500 mb-0.5">Quelle</div>
              <div className="font-mono text-gray-700 dark:text-gray-300 truncate" title={sourceId}>{sourceId}</div>
            </div>
            <ArrowRight size={14} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-gray-400 dark:text-gray-500 mb-0.5">Alias</div>
              <div className="font-mono text-amber-600 dark:text-amber-400 truncate" title={aliasId}>{aliasId || '—'}</div>
            </div>
          </div>

          {/* Source properties */}
          {srcCommon && (
            <div className="grid grid-cols-3 gap-1.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
              {[
                ['Typ', srcType],
                ['Rolle', srcRole || '—'],
                ['Einheit', srcUnit || '—'],
                ['Lesen', srcRead ? 'ja' : 'nein'],
                ['Schreiben', srcWrite ? 'ja' : 'nein'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-mono">{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Alias ID */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Alias-ID <span className="text-red-500">*</span></label>
            <input
              ref={inputRef}
              type="text"
              value={aliasId}
              onChange={(e) => { setAliasId(e.target.value); setError(''); }}
              className={`${inputCls} font-mono`}
              placeholder="alias.0.mein.datenpunkt"
              spellCheck={false}
            />
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              className={inputCls}
              placeholder="Anzeigename"
            />
          </div>

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
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Link2 size={13} />
              {create.isPending ? 'Erstelle…' : 'Alias anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
