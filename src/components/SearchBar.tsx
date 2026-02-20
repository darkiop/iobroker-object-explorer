import { useState } from 'react';

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

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Pattern eingeben, z.B. alias.0.energie.*"
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
      >
        Suchen
      </button>
    </form>
  );
}
