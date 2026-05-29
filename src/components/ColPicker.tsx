import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import StyledCheckbox from './StyledCheckbox';
import type { SortKey } from './stateListColumns';
import { ALL_COLUMNS, getColumnLabel } from './stateListColumns';

function ColPicker({ visible, onChange, language = 'de' }: { visible: SortKey[]; onChange: (cols: SortKey[]) => void; language?: 'en' | 'de' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isEn = language === 'en';

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function toggle(key: SortKey) {
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : ALL_COLUMNS.map((c) => c.key).filter((k) => visible.includes(k) || k === key);
    if (next.length === 0) return;
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={isEn ? 'Configure columns' : 'Spalten konfigurieren'}
        className={`p-1.5 rounded-lg transition-colors ${open ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700'}`}
      >
        <SlidersHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[140px]">
          {ALL_COLUMNS.map(({ key }) => (
            <div
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 select-none"
            >
              <StyledCheckbox checked={visible.includes(key)} onChange={() => toggle(key)} />
              {getColumnLabel(key, language)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ColPicker;
