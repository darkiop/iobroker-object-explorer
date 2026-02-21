import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const FIELD_DEFAULT = 'alias.0.*';
const SEARCH_ALL = '*';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
}

export default function SearchBar({ onSearch, initialPattern }: SearchBarProps) {
  const [value, setValue] = useState('');

  // Nur bei echten Baum-Navigationen synchronisieren (nicht beim App-Start mit '*')
  useEffect(() => {
    if (initialPattern && initialPattern !== SEARCH_ALL) {
      setValue(initialPattern);
    }
  }, [initialPattern]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(value.trim() || SEARCH_ALL);
  };

  const handleClear = () => {
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Pattern eingeben, z.B. alias.0.energie.*"
          className="w-full px-3 py-2 pr-8 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500"
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
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        Suchen
      </button>
    </form>
  );
}
