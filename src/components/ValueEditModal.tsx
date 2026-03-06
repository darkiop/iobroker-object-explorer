import { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Check, X } from 'lucide-react';
import type { IoBrokerObject, IoBrokerState } from '../types/iobroker';
import { useSetState } from '../hooks/useStates';

interface ValueEditModalProps {
  id: string;
  state: IoBrokerState | undefined;
  obj: IoBrokerObject | undefined;
  language?: 'en' | 'de';
  onClose: () => void;
}

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'other';
interface Token { type: TokenType; value: string }

function valueToDraft(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function tokenizeJson(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      let j = i;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      tokens.push({ type: 'other', value: raw.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '\\') j += 2;
        else if (raw[j] === '"') { j++; break; }
        else j++;
      }
      const value = raw.slice(i, j);
      let k = j;
      while (k < raw.length && (raw[k] === ' ' || raw[k] === '\t')) k++;
      tokens.push({ type: raw[k] === ':' ? 'key' : 'string', value });
      i = j;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      if (raw[j] === '-') j++;
      while (j < raw.length && /[0-9]/.test(raw[j])) j++;
      if (j < raw.length && raw[j] === '.') {
        j++;
        while (j < raw.length && /[0-9]/.test(raw[j])) j++;
      }
      if (j < raw.length && (raw[j] === 'e' || raw[j] === 'E')) {
        j++;
        if (raw[j] === '+' || raw[j] === '-') j++;
        while (j < raw.length && /[0-9]/.test(raw[j])) j++;
      }
      tokens.push({ type: 'number', value: raw.slice(i, j) });
      i = j;
      continue;
    }
    if (raw.startsWith('true', i)) { tokens.push({ type: 'boolean', value: 'true' }); i += 4; continue; }
    if (raw.startsWith('false', i)) { tokens.push({ type: 'boolean', value: 'false' }); i += 5; continue; }
    if (raw.startsWith('null', i)) { tokens.push({ type: 'null', value: 'null' }); i += 4; continue; }
    if ('{}[],:'.includes(ch)) { tokens.push({ type: 'punctuation', value: ch }); i++; continue; }
    tokens.push({ type: 'other', value: ch });
    i++;
  }
  return tokens;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case 'key': return 'text-blue-600 dark:text-blue-300';
    case 'string': return 'text-green-700 dark:text-green-400';
    case 'number': return 'text-orange-600 dark:text-orange-400';
    case 'boolean': return 'text-purple-600 dark:text-purple-400';
    case 'null': return 'text-gray-400 dark:text-gray-500';
    case 'punctuation': return 'text-gray-500 dark:text-gray-400';
    default: return 'text-gray-800 dark:text-gray-200';
  }
}

function parseValue(raw: string, valType: string | undefined, fallback: unknown): { value?: unknown; error?: string } {
  if (valType === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: 'number' };
    return { value: n };
  }
  if (valType === 'boolean') {
    const lowered = raw.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') return { value: true };
    if (lowered === 'false' || lowered === '0') return { value: false };
    return { error: 'boolean' };
  }
  if (valType === 'object' || (typeof fallback === 'object' && fallback !== null)) {
    try {
      return { value: JSON.parse(raw) };
    } catch {
      return { error: 'json' };
    }
  }
  return { value: raw };
}

function isHtmlValue(val: unknown): val is string {
  return typeof val === 'string' && /<\/?[a-z][\s\S]*>/i.test(val);
}

function getJsonText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return null;
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export default function ValueEditModal({ id, state, obj, onClose, language = 'en' }: ValueEditModalProps) {
  const isEn = language === 'en';
  const isReadonly = obj?.common?.write === false;
  const valType = obj?.common?.type;
  const [draft, setDraft] = useState(() => valueToDraft(state?.val));
  const [ack, setAck] = useState(() => state?.ack ?? false);
  const [error, setError] = useState('');
  const [forceWrite, setForceWrite] = useState(false);
  const setStateMutation = useSetState();

  useEffect(() => {
    setDraft(valueToDraft(state?.val));
    setAck(state?.ack ?? false);
    setError('');
  }, [id, state?.val, state?.ack]);

  useEscapeKey(onClose);

  const jsonText = useMemo(() => getJsonText(state?.val), [state?.val]);
  const jsonTokens = useMemo(() => (jsonText ? tokenizeJson(jsonText) : []), [jsonText]);
  const htmlValue = isHtmlValue(state?.val) ? state.val : null;
  const valueInputKind: 'number' | 'text' | 'boolean' | 'json' = useMemo(() => {
    if (valType === 'boolean') return 'boolean';
    if (valType === 'number') return 'number';
    if (valType === 'string' || valType === 'mixed') return 'text';
    if (valType === 'object' || (typeof state?.val === 'object' && state?.val !== null)) return 'json';
    return 'text';
  }, [valType, state?.val]);

  function handleSave() {
    const parsed = parseValue(draft, valType, state?.val);
    if (parsed.error || parsed.value === undefined) {
      setError(parsed.error === 'number'
        ? (isEn ? 'Invalid number value' : 'Ungültiger Zahlenwert')
        : parsed.error === 'boolean'
          ? (isEn ? 'Use true/false or 1/0' : 'Bitte true/false oder 1/0 verwenden')
          : (isEn ? 'Invalid JSON value' : 'Ungültiger JSON-Wert'));
      return;
    }
    setStateMutation.mutate(
      { id, val: parsed.value, ack },
      { onSuccess: () => onClose() }
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isEn ? 'Edit value' : 'Wert ändern'}</h3>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{id}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {isEn ? 'Type' : 'Typ'}: <span className="font-mono text-gray-700 dark:text-gray-200">{valType || '—'}</span>
              {obj?.common?.role && <span className="ml-2">· {isEn ? 'Role' : 'Rolle'}: <span className="font-mono text-gray-700 dark:text-gray-200">{obj.common.role}</span></span>}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {isReadonly && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-700/50">
                {isEn ? 'Read-only' : 'Schreibgeschützt'}
              </span>
            )}
            {isReadonly && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceWrite}
                  onChange={(e) => setForceWrite(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {isEn ? 'Force write' : 'Schreibschutz aufheben'}
                </span>
              </label>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-gray-600 dark:text-gray-300">ACK</span>
              <button
                type="button"
                onClick={() => setAck((v) => !v)}
                className={`relative w-10 h-6 rounded-full border transition-colors ${
                  ack
                    ? 'bg-emerald-500/30 border-emerald-400/70'
                    : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    ack ? 'left-5 bg-emerald-500' : 'left-0.5 bg-white dark:bg-gray-300'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'Current value preview' : 'Aktuelle Wertvorschau'}</div>
            <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/70 p-3 ${valueInputKind === 'json' ? 'flex-1 min-h-40 max-h-72 overflow-auto' : 'h-10 flex items-center overflow-hidden'}`}>
              {htmlValue && (
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlValue) }} />
              )}
              {!htmlValue && jsonText && (
                <pre className="m-0 text-xs leading-5 whitespace-pre-wrap break-words font-mono">
                  {jsonTokens.map((t, i) => (
                    <span key={i} className={tokenClass(t.type)}>{t.value}</span>
                  ))}
                </pre>
              )}
              {!htmlValue && !jsonText && (
                <pre className="m-0 text-xs leading-5 whitespace-pre-wrap break-words font-mono text-gray-700 dark:text-gray-200">
                  {valueToDraft(state?.val) || '—'}
                </pre>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'New value' : 'Neuer Wert'}</div>
            <div className="flex flex-col flex-1 gap-2">
              {valueInputKind === 'boolean' ? (
                <div className="flex gap-2 h-10">
                  {(['true', 'false'] as const).map((opt) => {
                    const isActive = draft.trim().toLowerCase() === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { setDraft(opt); setError(''); }}
                        disabled={(isReadonly && !forceWrite) || setStateMutation.isPending}
                        className={`flex-1 h-10 rounded-xl border text-sm font-mono transition-colors disabled:opacity-60 ${
                          isActive
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : valueInputKind === 'json' ? (
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError(''); }}
                  disabled={(isReadonly && !forceWrite) || setStateMutation.isPending}
                  spellCheck={false}
                  className="w-full flex-1 min-h-40 max-h-72 resize-y rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono text-gray-800 dark:text-gray-100 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                />
              ) : (
                <input
                  type={valueInputKind === 'number' ? 'number' : 'text'}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  disabled={(isReadonly && !forceWrite) || setStateMutation.isPending}
                  spellCheck={false}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  className="w-full h-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono text-gray-800 dark:text-gray-100 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                />
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {isEn ? 'Cancel' : 'Abbrechen'}
          </button>
          <button
            onClick={handleSave}
            disabled={(isReadonly && !forceWrite) || setStateMutation.isPending}
            className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Check size={14} />
            {isEn ? 'Save' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
