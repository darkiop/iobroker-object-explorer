import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

const SEARCH_ALL = '*';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
  onReset?: () => void;
  fulltextEnabled?: boolean;
  onFulltextChange?: (enabled: boolean) => void;
  language?: 'en' | 'de';
}

export default function SearchBar({
  onSearch,
  initialPattern,
  onReset,
  fulltextEnabled = false,
  onFulltextChange,
  language = 'en',
}: SearchBarProps) {
  const [value, setValue] = useState('');
  const isEn = language === 'en';

  useEffect(() => {
    if (initialPattern === SEARCH_ALL) {
      setValue('');
    } else if (initialPattern) {
      setValue(initialPattern);
    }
  }, [initialPattern]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(value.trim() || SEARCH_ALL);
  };

  const handleClear = () => {
    setValue('');
    if (onReset) {
      onReset();
    } else {
      onSearch(SEARCH_ALL);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder={fulltextEnabled ? (isEn ? 'Full text' : 'Freitext') : (isEn ? 'ID (use * wildcard)' : 'ID (mit * als Wildcard)')}
            className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-l-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
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
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-gray-200/50 text-gray-500 border border-gray-300/50 border-l-0 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700 rounded-r-lg transition-colors text-sm font-medium"
        >
          {isEn ? 'Search' : 'Suchen'}
        </button>
      </div>
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
    </form>
  );
}
