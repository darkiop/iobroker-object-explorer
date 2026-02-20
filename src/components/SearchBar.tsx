import { useState } from 'react';
import { X } from 'lucide-react';

const DEFAULT_PATTERN = 'alias.0.*';

interface SearchBarProps {
  onSearch: (pattern: string) => void;
  initialPattern?: string;
}

export default function SearchBar({ onSearch, initialPattern = '' }: SearchBarProps) {
  const [value, setValue] = useState(initialPattern);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.trim());
    }
  };

  const handleClear = () => {
    setValue(DEFAULT_PATTERN);
    onSearch(DEFAULT_PATTERN);
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
          className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
        />
        {value !== DEFAULT_PATTERN && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
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
