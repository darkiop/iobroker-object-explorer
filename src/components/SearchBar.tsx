import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check } from 'lucide-react';

const SEARCH_ALL = '*';
const ID_SUGGEST_MIN_LEN = 2;
const ID_SUGGEST_MAX = 20;

const OBJECT_TYPES = ['state', 'channel', 'device', 'folder', 'enum', 'script', 'schedule', 'host', 'adapter', 'instance', 'meta', 'config', 'group', 'user'];

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
  onReset?: () => void;
  fulltextEnabled?: boolean;
  onFulltextChange?: (enabled: boolean) => void;
  exactEnabled?: boolean;
  onExactChange?: (enabled: boolean) => void;
  idSuggestEnabled?: boolean;
  onIdSuggestChange?: (enabled: boolean) => void;
  language?: 'en' | 'de';
  roomNames?: string[];
  functionNames?: string[];
  roleNames?: string[];
  allObjectIds?: string[];
}

interface Suggestion {
  display: string;
  insert: string;
  keepOpen?: boolean;
  autoSubmit?: boolean; // for ID suggestions: submit immediately on select
}

type CommandDef = { prefix: string; label: string; color: string };
const COMMANDS: CommandDef[] = [
  { prefix: 'room:',     label: 'room',  color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
  { prefix: 'function:', label: 'fn',    color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
  { prefix: 'type:',     label: 'type',  color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  { prefix: 'role:',     label: 'role',  color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
];
const ID_COLOR = 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';

function cmdColor(insert: string): string {
  return COMMANDS.find((c) => insert.startsWith(c.prefix))?.color ?? ID_COLOR;
}
function cmdLabel(insert: string): string {
  return COMMANDS.find((c) => insert.startsWith(c.prefix))?.label ?? 'id';
}

function getTokenAtCursor(value: string, cursor: number): { token: string; start: number; end: number } {
  const before = value.slice(0, cursor);
  const start = before.lastIndexOf(' ') + 1;
  const after = value.slice(cursor);
  const endOffset = after.indexOf(' ');
  const end = endOffset === -1 ? value.length : cursor + endOffset;
  return { token: value.slice(start, end), start, end };
}

function buildSuggestions(
  token: string,
  roomNames: string[],
  functionNames: string[],
  roleNames: string[],
  allObjectIds: string[],
): Suggestion[] {
  const lower = token.toLowerCase();

  if (lower.startsWith('room:')) {
    const query = token.slice(5).toLowerCase();
    return roomNames.filter((n) => n.toLowerCase().includes(query))
      .map((n) => ({ display: n, insert: n.includes(' ') ? `room:"${n}"` : `room:${n}` }));
  }
  if (lower.startsWith('function:')) {
    const query = token.slice(9).toLowerCase();
    return functionNames.filter((n) => n.toLowerCase().includes(query))
      .map((n) => ({ display: n, insert: n.includes(' ') ? `function:"${n}"` : `function:${n}` }));
  }
  if (lower.startsWith('type:')) {
    const query = token.slice(5).toLowerCase();
    return OBJECT_TYPES.filter((t) => t.includes(query))
      .map((t) => ({ display: t, insert: `type:${t}` }));
  }
  if (lower.startsWith('role:')) {
    const query = token.slice(5).toLowerCase();
    return roleNames.filter((r) => r.toLowerCase().includes(query)).slice(0, 30)
      .map((r) => ({ display: r, insert: r.includes(' ') ? `role:"${r}"` : `role:${r}` }));
  }

  if (lower.length === 0) return [];

  // Keyword suggestions
  const kwSuggestions = COMMANDS
    .filter((c) => c.prefix.startsWith(lower))
    .map((c) => ({ display: c.prefix, insert: c.prefix, keepOpen: true }));
  if (kwSuggestions.length > 0) return kwSuggestions;

  // ID suggestions (only when no command keyword detected)
  if (allObjectIds.length > 0 && lower.length >= ID_SUGGEST_MIN_LEN) {
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const id of allObjectIds) {
      const idLower = id.toLowerCase();
      if (idLower === lower) continue; // exact = no need to suggest
      if (idLower.startsWith(lower)) startsWith.push(id);
      else if (idLower.includes(lower)) contains.push(id);
      if (startsWith.length + contains.length >= ID_SUGGEST_MAX * 2) break;
    }
    return [...startsWith, ...contains].slice(0, ID_SUGGEST_MAX)
      .map((id) => ({ display: id, insert: id, autoSubmit: true }));
  }

  return [];
}

function CheckToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none px-0.5 w-fit">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        checked ? 'bg-blue-500 border-blue-500' : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
      }`}>
        {checked && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}

export default function SearchBar({
  onSearch,
  initialPattern,
  onReset,
  fulltextEnabled = false,
  onFulltextChange,
  exactEnabled = false,
  onExactChange,
  idSuggestEnabled = false,
  onIdSuggestChange,
  language = 'en',
  roomNames = [],
  functionNames = [],
  roleNames = [],
  allObjectIds = [],
}: SearchBarProps) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isEn = language === 'en';

  useEffect(() => {
    if (initialPattern === SEARCH_ALL) {
      setValue('');
    } else if (initialPattern) {
      setValue(initialPattern);
    }
  }, [initialPattern]);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setActiveIndex(-1);
  }, []);

  const recompute = useCallback((val: string, cursor: number) => {
    if (fulltextEnabled) { closeSuggestions(); return; }
    const { token } = getTokenAtCursor(val, cursor);
    const ids = idSuggestEnabled ? allObjectIds : [];
    const next = buildSuggestions(token, roomNames, functionNames, roleNames, ids);
    setSuggestions(next);
    setActiveIndex(-1);
  }, [fulltextEnabled, idSuggestEnabled, allObjectIds, roomNames, functionNames, roleNames, closeSuggestions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    recompute(val, e.target.selectionStart ?? val.length);
  };

  const applySuggestion = useCallback((s: Suggestion) => {
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const { start, end } = getTokenAtCursor(value, cursor);
    const newValue = value.slice(0, start) + s.insert + value.slice(end) + (s.keepOpen ? '' : ' ');
    const trimmed = newValue.trim();
    setValue(trimmed);
    closeSuggestions();

    if (s.autoSubmit) {
      onSearch(trimmed || SEARCH_ALL);
      return;
    }

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const pos = start + s.insert.length + (s.keepOpen ? 0 : 1);
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos);
      if (s.keepOpen) {
        recompute(newValue, start + s.insert.length);
      }
    });
  }, [value, closeSuggestions, onSearch, recompute]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if ((e.key === 'Enter' || e.key === 'Tab') && activeIndex >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0 && activeIndex >= 0) {
      applySuggestion(suggestions[activeIndex]);
      return;
    }
    closeSuggestions();
    onSearch(value.trim() || SEARCH_ALL);
  };

  const handleClear = () => {
    setValue('');
    closeSuggestions();
    if (onReset) { onReset(); } else { onSearch(SEARCH_ALL); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <div className="flex">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={(e) => {
              e.target.select();
              recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onBlur={(e) => {
              if (!dropdownRef.current?.contains(e.relatedTarget as Node)) closeSuggestions();
            }}
            placeholder={fulltextEnabled ? (isEn ? 'Full text' : 'Freitext') : (isEn ? 'ID (use * wildcard)' : 'ID (mit * als Wildcard)')}
            className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-l-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
          />
          {value !== '' && (
            <button type="button" onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              title={isEn ? 'Reset filters' : 'Filter zurücksetzen'}
            >
              <X size={14} />
            </button>
          )}

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg overflow-hidden max-h-60 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.insert}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    i === activeIndex
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`shrink-0 text-xs px-1 py-0.5 rounded font-sans ${i === activeIndex ? 'bg-blue-400 text-white' : cmdColor(s.insert)}`}>
                    {cmdLabel(s.insert)}
                  </span>
                  <span className="truncate">{s.display}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="submit"
          className="px-4 py-2 bg-gray-200/50 text-gray-500 border border-gray-300/50 border-l-0 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700 rounded-r-md transition-colors text-sm font-medium"
        >
          {isEn ? 'Search' : 'Suchen'}
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <CheckToggle checked={fulltextEnabled} onChange={(v) => onFulltextChange?.(v)} label={isEn ? 'Full text search' : 'Volltext-Suche'} />
        <CheckToggle checked={exactEnabled} onChange={(v) => onExactChange?.(v)} label={isEn ? 'Exact search' : 'Exakte Suche'} />
        <CheckToggle checked={idSuggestEnabled} onChange={(v) => onIdSuggestChange?.(v)} label={isEn ? 'ID suggestions' : 'ID-Vorschläge'} />
      </div>
    </form>
  );
}
