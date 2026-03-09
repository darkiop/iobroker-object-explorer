import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check } from 'lucide-react';

const SEARCH_ALL = '*';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
  onReset?: () => void;
  fulltextEnabled?: boolean;
  onFulltextChange?: (enabled: boolean) => void;
  exactEnabled?: boolean;
  onExactChange?: (enabled: boolean) => void;
  language?: 'en' | 'de';
  roomNames?: string[];
  functionNames?: string[];
}

interface Suggestion {
  display: string;   // shown in dropdown
  insert: string;    // inserted into input
  keepOpen?: boolean; // keep dropdown open after insert (for keyword completions)
}

function getTokenAtCursor(value: string, cursor: number): { token: string; start: number; end: number } {
  const before = value.slice(0, cursor);
  const start = before.lastIndexOf(' ') + 1;
  const after = value.slice(cursor);
  const endOffset = after.indexOf(' ');
  const end = endOffset === -1 ? value.length : cursor + endOffset;
  return { token: value.slice(start, end), start, end };
}

function buildSuggestions(token: string, roomNames: string[], functionNames: string[]): Suggestion[] {
  const lower = token.toLowerCase();

  if (lower.startsWith('room:')) {
    const query = token.slice(5).toLowerCase();
    return roomNames
      .filter((n) => n.toLowerCase().includes(query))
      .map((n) => ({
        display: n,
        insert: n.includes(' ') ? `room:"${n}"` : `room:${n}`,
      }));
  }

  if (lower.startsWith('function:')) {
    const query = token.slice(9).toLowerCase();
    return functionNames
      .filter((n) => n.toLowerCase().includes(query))
      .map((n) => ({
        display: n,
        insert: n.includes(' ') ? `function:"${n}"` : `function:${n}`,
      }));
  }

  if (lower.length === 0) return [];

  const suggestions: Suggestion[] = [];
  if ('room:'.startsWith(lower)) suggestions.push({ display: 'room:', insert: 'room:', keepOpen: true });
  if ('function:'.startsWith(lower)) suggestions.push({ display: 'function:', insert: 'function:', keepOpen: true });
  return suggestions;
}

export default function SearchBar({
  onSearch,
  initialPattern,
  onReset,
  fulltextEnabled = false,
  onFulltextChange,
  exactEnabled = false,
  onExactChange,
  language = 'en',
  roomNames = [],
  functionNames = [],
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
    const next = buildSuggestions(token, roomNames, functionNames);
    setSuggestions(next);
    setActiveIndex(-1);
  }, [fulltextEnabled, roomNames, functionNames, closeSuggestions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    recompute(val, e.target.selectionStart ?? val.length);
  };

  const applySuggestion = useCallback((s: Suggestion) => {
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const { start, end } = getTokenAtCursor(value, cursor);
    const newValue = value.slice(0, start) + s.insert + value.slice(end) + (s.keepOpen ? '' : ' ');
    setValue(newValue);
    closeSuggestions();

    // After inserting, focus input and recompute if keepOpen (e.g. "room:" inserted)
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const pos = start + s.insert.length + (s.keepOpen ? 0 : 1);
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos);
      if (s.keepOpen) {
        recompute(newValue, start + s.insert.length);
      }
    });
  }, [value, closeSuggestions, recompute]);

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
    if (onReset) {
      onReset();
    } else {
      onSearch(SEARCH_ALL);
    }
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
              // delay so click on suggestion fires first
              if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
                closeSuggestions();
              }
            }}
            placeholder={fulltextEnabled ? (isEn ? 'Full text' : 'Freitext') : (isEn ? 'ID (use * wildcard)' : 'ID (mit * als Wildcard)')}
            className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-l-md text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
          />
          {value !== '' && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              title={isEn ? 'Reset filters' : 'Filter zurücksetzen'}
            >
              <X size={14} />
            </button>
          )}

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg overflow-hidden max-h-52 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.insert}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className={`w-full text-left px-3 py-1.5 text-sm font-mono flex items-center gap-2 transition-colors ${
                    i === activeIndex
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`text-xs px-1 py-0.5 rounded font-sans ${
                    i === activeIndex
                      ? 'bg-blue-400 text-white'
                      : s.insert.startsWith('room:')
                        ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                        : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  }`}>
                    {s.insert.startsWith('room:') ? 'room' : s.insert.startsWith('function:') ? 'fn' : '⌨'}
                  </span>
                  {s.display}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-gray-200/50 text-gray-500 border border-gray-300/50 border-l-0 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700 rounded-r-md transition-colors text-sm font-medium"
        >
          {isEn ? 'Search' : 'Suchen'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none px-0.5 w-fit">
          <input
            type="checkbox"
            checked={fulltextEnabled}
            onChange={(e) => onFulltextChange?.(e.target.checked)}
            className="sr-only peer"
          />
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            fulltextEnabled
              ? 'bg-blue-500 border-blue-500'
              : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
          }`}>
            {fulltextEnabled && <Check size={11} className="text-white" strokeWidth={3} />}
          </span>
          {isEn ? 'Full text search' : 'Volltext-Suche'}
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none px-0.5 w-fit">
          <input
            type="checkbox"
            checked={exactEnabled}
            onChange={(e) => onExactChange?.(e.target.checked)}
            className="sr-only peer"
          />
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            exactEnabled
              ? 'bg-blue-500 border-blue-500'
              : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
          }`}>
            {exactEnabled && <Check size={11} className="text-white" strokeWidth={3} />}
          </span>
          {isEn ? 'Exact search' : 'Exakte Suche'}
        </label>
      </div>
    </form>
  );
}
