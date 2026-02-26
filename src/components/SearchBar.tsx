import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const SEARCH_ALL = '*';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
  onReset?: () => void;
  fulltextEnabled?: boolean;
  onFulltextChange?: (enabled: boolean) => void;
}

export default function SearchBar({ onSearch, initialPattern, onReset, fulltextEnabled = true, onFulltextChange }: SearchBarProps) {
  const [value, setValue] = useState('');

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
            placeholder={fulltextEnabled ? 'Pattern (alias.0.*) oder Freitext (z.B. Temperatur)' : 'Pattern (alias.0.*) oder ID-Suche'}
            className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-l-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
          />
          {value !== '' && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              title="Filter zurücksetzen"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-gray-200/50 text-gray-500 border border-gray-300/50 border-l-0 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-600/50 dark:hover:bg-gray-700 rounded-r-lg transition-colors text-sm font-medium"
        >
          Suchen
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none px-0.5">
        <input
          type="checkbox"
          checked={fulltextEnabled}
          onChange={(e) => onFulltextChange?.(e.target.checked)}
          className="w-3 h-3 accent-blue-500"
        />
        Volltext-Suche (Name, Beschreibung, Alias)
      </label>
    </form>
  );
}
