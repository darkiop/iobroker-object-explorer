import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertTriangle, Link2 } from 'lucide-react';
import { usePutObject } from '../hooks/useStates';
import type { IoBrokerObject } from '../types/iobroker';

interface Props {
  id: string;
  obj: IoBrokerObject;
  onClose: () => void;
}

type Tab = 'json' | 'alias';

export default function ObjectEditModal({ id, obj, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('json');
  const [draft, setDraft] = useState(() => JSON.stringify(obj, null, 2));
  const [error, setError] = useState<string | null>(null);

  // Alias tab state
  const [aliasId, setAliasId] = useState(obj.common.alias?.id ?? '');
  const [aliasRead, setAliasRead] = useState(obj.common.alias?.read ?? '');
  const [aliasWrite, setAliasWrite] = useState(obj.common.alias?.write ?? '');

  const putObject = usePutObject();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSaveJson() {
    let parsed: IoBrokerObject;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setError('Ungültiges JSON: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setError(null);
    putObject.mutate({ id, obj: parsed }, { onSuccess: onClose });
  }

  function handleSaveAlias() {
    setError(null);
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
    const updated: IoBrokerObject = { ...obj, common: newCommon };
    putObject.mutate({ id, obj: updated }, { onSuccess: onClose });
  }

  const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500';

  return createPortal(
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
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            Objekt bearbeiten:{' '}
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{id}</span>
          </span>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 px-5">
          {(['json', 'alias'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t === 'json' ? 'JSON' : 'Alias'}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'json' ? (
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            className="flex-1 min-h-0 p-4 font-mono text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none focus:outline-none border-0"
            spellCheck={false}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
            {/* Alias target */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  <Link2 size={11} className="text-amber-500" />
                  Ziel-Datenpunkt (alias.id)
                </span>
              </label>
              <input
                type="text"
                value={aliasId}
                onChange={(e) => setAliasId(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder="z.B. hm-rpc.0.ABC123.1.STATE"
                spellCheck={false}
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                ID des Quell-Datenpunkts, auf den dieser Alias zeigt. Leer lassen, um den Alias zu entfernen.
              </p>
            </div>

            {/* Read formula */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>
                Lese-Formel (alias.read){' '}
                <span className="text-gray-400 dark:text-gray-500 font-normal">– optional</span>
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
                JavaScript-Ausdruck zur Konvertierung beim Lesen. Variable:{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">val</code>
              </p>
            </div>

            {/* Write formula */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>
                Schreib-Formel (alias.write){' '}
                <span className="text-gray-400 dark:text-gray-500 font-normal">– optional</span>
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
                JavaScript-Ausdruck zur Konvertierung beim Schreiben. Variable:{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">val</code>
              </p>
            </div>

            {/* Current saved alias */}
            {obj.common.alias && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 text-xs border border-amber-200 dark:border-amber-800/40">
                <div className="text-amber-600 dark:text-amber-400 font-medium mb-1.5 flex items-center gap-1.5">
                  <Link2 size={11} />
                  Aktuell gespeicherter Alias
                </div>
                <pre className="font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(obj.common.alias, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-500 border-t border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20 shrink-0">
            <AlertTriangle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={tab === 'json' ? handleSaveJson : handleSaveAlias}
            disabled={putObject.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {putObject.isPending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
