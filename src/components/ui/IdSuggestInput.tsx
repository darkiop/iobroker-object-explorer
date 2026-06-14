import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  className?: string;
  placeholder?: string;
  maxSuggestions?: number;
}

export default function IdSuggestInput({
  value,
  onChange,
  suggestions,
  className = '',
  placeholder = '',
  maxSuggestions = 15,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions.slice(0, maxSuggestions);
    return suggestions
      .filter((id) => id.toLowerCase().includes(q))
      .slice(0, maxSuggestions);
  }, [value, suggestions, maxSuggestions]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [filtered]);

  function updateDropdownPos() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }

  function handleFocus() {
    updateDropdownPos();
    setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      onChange(filtered[activeIndex]);
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); updateDropdownPos(); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {open && filtered.length > 0 && createPortal(
        <ul
          style={dropdownStyle}
          className="max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg text-sm"
        >
          {filtered.map((id, i) => (
            <li
              key={id}
              onMouseDown={() => { onChange(id); setOpen(false); setActiveIndex(-1); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-2.5 py-1 cursor-pointer font-mono text-xs truncate ${
                i === activeIndex
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {id}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
