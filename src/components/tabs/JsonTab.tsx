import { useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';

type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'other';
interface Token { type: TokenType; value: string }

function tokenizeJson(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      let j = i; while (j < raw.length && /\s/.test(raw[j])) j++;
      tokens.push({ type: 'other', value: raw.slice(i, j) }); i = j; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '\\') j += 2;
        else if (raw[j] === '"') { j++; break; }
        else j++;
      }
      const value = raw.slice(i, j);
      let k = j; while (k < raw.length && (raw[k] === ' ' || raw[k] === '\t')) k++;
      tokens.push({ type: raw[k] === ':' ? 'key' : 'string', value });
      i = j; continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i; if (raw[j] === '-') j++;
      while (j < raw.length && /[0-9]/.test(raw[j])) j++;
      if (j < raw.length && raw[j] === '.') { j++; while (j < raw.length && /[0-9]/.test(raw[j])) j++; }
      if (j < raw.length && (raw[j] === 'e' || raw[j] === 'E')) { j++; if (raw[j] === '+' || raw[j] === '-') j++; while (j < raw.length && /[0-9]/.test(raw[j])) j++; }
      tokens.push({ type: 'number', value: raw.slice(i, j) }); i = j; continue;
    }
    if (raw.startsWith('true', i))  { tokens.push({ type: 'boolean', value: 'true'  }); i += 4; continue; }
    if (raw.startsWith('false', i)) { tokens.push({ type: 'boolean', value: 'false' }); i += 5; continue; }
    if (raw.startsWith('null', i))  { tokens.push({ type: 'null',    value: 'null'  }); i += 4; continue; }
    if ('{}[],:'.includes(ch)) { tokens.push({ type: 'punctuation', value: ch }); i++; continue; }
    tokens.push({ type: 'other', value: ch }); i++;
  }
  return tokens;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case 'key':         return 'text-blue-600 dark:text-blue-300';
    case 'string':      return 'text-green-700 dark:text-green-400';
    case 'number':      return 'text-orange-600 dark:text-orange-400';
    case 'boolean':     return 'text-purple-600 dark:text-purple-400';
    case 'null':        return 'text-gray-400 dark:text-gray-500';
    case 'punctuation': return 'text-gray-500 dark:text-gray-400';
    default:            return 'text-gray-800 dark:text-gray-200';
  }
}

const MONO: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '16px',
  margin: 0,
  whiteSpace: 'pre',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  tabSize: 2,
};

function JsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preRef  = useRef<HTMLPreElement>(null);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const tokens  = useMemo(() => tokenizeJson(value), [value]);

  function syncScroll() {
    if (!preRef.current || !taRef.current) return;
    preRef.current.style.transform =
      `translate(${-taRef.current.scrollLeft}px, ${-taRef.current.scrollTop}px)`;
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-800">
      <pre
        ref={preRef}
        aria-hidden
        className="absolute top-0 left-0 pointer-events-none select-none m-0 border-0 min-w-full min-h-full"
        style={{ ...MONO, overflow: 'visible', transformOrigin: '0 0' }}
      >
        {tokens.map((t, i) => (
          <span key={i} className={tokenClass(t.type)}>{t.value}</span>
        ))}
        {'\n'}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-gray-700 dark:caret-gray-200 focus:outline-none border-0"
        style={MONO}
      />
    </div>
  );
}

// ── JsonTab ────────────────────────────────────────────────────────────────

interface JsonTabProps {
  draft: string;
  jsonError: string | null;
  onDraftChange: (v: string) => void;
}

export default function JsonTab({ draft, jsonError, onDraftChange }: JsonTabProps) {
  return (
    <>
      <JsonEditor value={draft} onChange={onDraftChange} />
      {jsonError && (
        <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 shrink-0">
          <AlertTriangle size={13} className="shrink-0" />
          {jsonError}
        </div>
      )}
    </>
  );
}
