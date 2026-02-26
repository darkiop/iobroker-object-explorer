import { useState, useEffect, useRef, useMemo } from 'react';
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
  language?: 'en' | 'de';
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

export default function CreateAliasModal({ sourceId, sourceObj, existingIds, onClose, onCreated, language = 'en' }: Props) {
  const isEn = language === 'en';
  const [aliasId, setAliasId] = useState(() => suggestAliasId(sourceId));
  const [name, setName] = useState(() => getObjectName(sourceObj));
  const [aliasRead, setAliasRead] = useState('');
  const [aliasWrite, setAliasWrite] = useState('');
  const [aliasSuggestionsOpen, setAliasSuggestionsOpen] = useState(false);
  const [aliasActiveIndex, setAliasActiveIndex] = useState(-1);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateDatapoint();

  const srcCommon = sourceObj?.common;
  const srcType   = srcCommon?.type   ?? 'mixed';
  const srcRole   = srcCommon?.role   ?? '';
  const srcUnit   = srcCommon?.unit   ?? '';
  const srcRead   = srcCommon?.read   !== false;
  const srcWrite  = srcCommon?.write  !== false;
  const aliasIdsSorted = useMemo(
    () => [...existingIds].filter((id) => id.startsWith('alias.0.')).sort(),
    [existingIds]
  );
  const filteredAliasSuggestions = aliasId.trim()
    ? aliasIdsSorted.filter((id) => id.toLowerCase().startsWith(aliasId.toLowerCase())).slice(0, 30)
    : aliasIdsSorted.slice(0, 30);

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
    if (!id) return isEn ? 'Alias ID is required.' : 'Alias-ID ist erforderlich.';
    if (!id.startsWith('alias.0.')) return isEn ? 'Alias ID must start with "alias.0.".' : 'Alias-ID muss mit „alias.0." beginnen.';
    if (existingIds.has(id)) return isEn ? `"${id}" already exists.` : `„${id}" existiert bereits.`;
    if (!name.trim()) return isEn ? 'Name is required.' : 'Name ist erforderlich.';
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
          alias: {
            id: sourceId,
            read: aliasRead.trim() || undefined,
            write: aliasWrite.trim() || undefined,
          },
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
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Link2 size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{isEn ? 'Create alias' : 'Alias anlegen'}</h2>
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
              <div className="text-gray-400 dark:text-gray-500 mb-0.5">{isEn ? 'Source' : 'Quelle'}</div>
              <div className="font-mono text-gray-700 dark:text-gray-300 truncate" title={sourceId}>{sourceId}</div>
            </div>
            <ArrowRight size={14} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-gray-400 dark:text-gray-500 mb-0.5">{isEn ? 'Alias' : 'Alias'}</div>
              <div className="font-mono text-amber-600 dark:text-amber-400 truncate" title={aliasId}>{aliasId || '—'}</div>
            </div>
          </div>

          {/* Source properties */}
          {srcCommon && (
            <div className="grid grid-cols-3 gap-1.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
              {[
                [isEn ? 'Type' : 'Typ', srcType],
                [isEn ? 'Role' : 'Rolle', srcRole || '—'],
                [isEn ? 'Unit' : 'Einheit', srcUnit || '—'],
                [isEn ? 'Read' : 'Lesen', srcRead ? (isEn ? 'yes' : 'ja') : (isEn ? 'no' : 'nein')],
                [isEn ? 'Write' : 'Schreiben', srcWrite ? (isEn ? 'yes' : 'ja') : (isEn ? 'no' : 'nein')],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-mono">{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Alias ID */}
          <div className="flex flex-col gap-1 relative">
            <label className={labelCls}>{isEn ? 'Alias ID' : 'Alias-ID'} <span className="text-red-500">*</span></label>
            <input
              ref={inputRef}
              type="text"
              value={aliasId}
              onChange={(e) => { setAliasId(e.target.value); setError(''); setAliasActiveIndex(-1); setAliasSuggestionsOpen(true); }}
              onFocus={() => setAliasSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setAliasSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (!aliasSuggestionsOpen || filteredAliasSuggestions.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setAliasActiveIndex((i) => Math.min(i + 1, filteredAliasSuggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setAliasActiveIndex((i) => Math.max(i - 1, -1));
                } else if (e.key === 'Enter' && aliasActiveIndex >= 0) {
                  e.preventDefault();
                  setAliasId(filteredAliasSuggestions[aliasActiveIndex]);
                  setAliasSuggestionsOpen(false);
                  setAliasActiveIndex(-1);
                } else if (e.key === 'Escape') {
                  setAliasSuggestionsOpen(false);
                }
              }}
              className={`${inputCls} font-mono`}
              placeholder={isEn ? 'alias.0.my.datapoint' : 'alias.0.mein.datenpunkt'}
              spellCheck={false}
            />
            {aliasSuggestionsOpen && filteredAliasSuggestions.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 text-sm">
                {filteredAliasSuggestions.map((suggestion, i) => (
                  <li
                    key={suggestion}
                    onMouseDown={() => {
                      setAliasId(suggestion);
                      setAliasSuggestionsOpen(false);
                      setAliasActiveIndex(-1);
                    }}
                    onMouseEnter={() => setAliasActiveIndex(i)}
                    className={`px-2.5 py-1 cursor-pointer font-mono text-xs ${
                      i === aliasActiveIndex
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              className={inputCls}
              placeholder={isEn ? 'Display name' : 'Anzeigename'}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>
              {isEn ? 'Read formula' : 'Lese-Formel'} (alias.read){' '}
              <span className="text-gray-400 dark:text-gray-500 font-normal">- {isEn ? 'optional' : 'optional'}</span>
            </label>
            <input
              type="text"
              value={aliasRead}
              onChange={(e) => { setAliasRead(e.target.value); setError(''); }}
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
            <label className={labelCls}>
              {isEn ? 'Write formula' : 'Schreib-Formel'} (alias.write){' '}
              <span className="text-gray-400 dark:text-gray-500 font-normal">- {isEn ? 'optional' : 'optional'}</span>
            </label>
            <input
              type="text"
              value={aliasWrite}
              onChange={(e) => { setAliasWrite(e.target.value); setError(''); }}
              className={`${inputCls} font-mono`}
              placeholder="val * 10"
              spellCheck={false}
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {isEn ? 'JavaScript expression for write conversion. Variable:' : 'JavaScript-Ausdruck zur Konvertierung beim Schreiben. Variable:'}{' '}
              <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">val</code>
            </p>
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
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Link2 size={13} />
              {create.isPending ? (isEn ? 'Creating...' : 'Erstelle...') : (isEn ? 'Create alias' : 'Alias anlegen')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
