import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import type { IoBrokerObject } from '../../types/iobroker';
import IdSuggestInput from '../ui/IdSuggestInput';
import { evalFormula } from '../../utils/aliasFormula';

const inputCls = 'px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500';

// ── AliasTab ───────────────────────────────────────────────────────────────

interface AliasTabProps {
  obj: IoBrokerObject;
  language: 'en' | 'de';
  allStateIds?: string[];
  aliasSeparateIds: boolean;
  setAliasSeparateIds: (v: boolean) => void;
  aliasId: string;
  setAliasId: (v: string) => void;
  aliasReadId: string;
  setAliasReadId: (v: string) => void;
  aliasWriteId: string;
  setAliasWriteId: (v: string) => void;
  aliasRead: string;
  setAliasRead: (v: string) => void;
  aliasWrite: string;
  setAliasWrite: (v: string) => void;
}

export default function AliasTab({
  obj, language, allStateIds = [],
  aliasSeparateIds, setAliasSeparateIds,
  aliasId, setAliasId,
  aliasReadId, setAliasReadId,
  aliasWriteId, setAliasWriteId,
  aliasRead, setAliasRead,
  aliasWrite, setAliasWrite,
}: AliasTabProps) {
  const isEn = language === 'en';
  const [aliasTestInput, setAliasTestInput] = useState('');
  const [aliasTestResult, setAliasTestResult] = useState<{ read?: string; readErr?: string; write?: string; writeErr?: string } | null>(null);

  function runFormulaTest() {
    const raw = aliasTestInput.trim();
    const val: unknown = raw === '' ? undefined : isNaN(Number(raw)) ? raw : Number(raw);
    const result: typeof aliasTestResult = {};
    if (aliasRead.trim()) {
      const { value, error } = evalFormula(aliasRead, val);
      if (error) result.readErr = error;
      else result.read = value;
    }
    if (aliasWrite.trim()) {
      const { value, error } = evalFormula(aliasWrite, val);
      if (error) result.writeErr = error;
      else result.write = value;
    }
    setAliasTestResult(result);
  }

  return (
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
            <IdSuggestInput
              value={aliasReadId}
              onChange={setAliasReadId}
              suggestions={allStateIds}
              className={`${inputCls} font-mono`}
              placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Link2 size={11} className="text-amber-500" />
              {isEn ? 'Write source ID (alias.id.write)' : 'Schreib-Quell-ID (alias.id.write)'}
              <span className="font-normal text-gray-400 dark:text-gray-500">- {isEn ? 'optional' : 'optional'}</span>
            </label>
            <IdSuggestInput
              value={aliasWriteId}
              onChange={setAliasWriteId}
              suggestions={allStateIds}
              className={`${inputCls} font-mono`}
              placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Link2 size={11} className="text-amber-500" />
            {isEn ? 'Target datapoint (alias.id)' : 'Ziel-Datenpunkt (alias.id)'}
          </label>
          <IdSuggestInput
            value={aliasId}
            onChange={setAliasId}
            suggestions={allStateIds}
            className={`${inputCls} font-mono`}
            placeholder={isEn ? 'e.g. hm-rpc.0.ABC123.1.STATE' : 'z.B. hm-rpc.0.ABC123.1.STATE'}
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
  );
}
