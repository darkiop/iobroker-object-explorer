import { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown } from 'lucide-react';

export const EMPTY_SENTINEL = '__empty__';

function BatchComboControl({
  value,
  onChange,
  placeholder,
  options,
  className = '',
  language = 'en',
  emptyOptionLabel,
  displayMap,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  className?: string;
  language?: 'en' | 'de';
  emptyOptionLabel?: string;
  displayMap?: Record<string, string>;
}) {
  const isEn = language === 'en';
  const isEmptySelected = value === EMPTY_SENTINEL;
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const isMappedSelected = displayMap && value in displayMap;
    const q = (isEmptySelected || isMappedSelected) ? '' : value.trim().toLowerCase();
    const source = q ? options.filter((o) => (displayMap?.[o] ?? o).toLowerCase().includes(q)) : options;
    return source.slice(0, 80);
  }, [options, value, isEmptySelected, displayMap]);

  function openMenu() {
    if (!anchorRef.current) return;
    setRect(anchorRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <div
        ref={anchorRef}
        className={`h-7 px-2 text-xs font-normal rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 focus-within:outline-none focus-within:ring-1 focus-within:ring-blue-400 transition-colors flex items-center justify-between gap-2 ${className}`}
      >
        {isEmptySelected ? (
          <span
            className="flex-1 min-w-0 italic text-blue-500 dark:text-blue-400 cursor-default select-none"
            onClick={openMenu}
          >
            {emptyOptionLabel || (isEn ? '(empty)' : '(leer)')}
          </span>
        ) : (
          <input
            type="text"
            value={displayMap?.[value] ?? value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={openMenu}
            placeholder={placeholder}
            readOnly={!!displayMap && value in (displayMap ?? {})}
            className="flex-1 min-w-0 bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }}
          className={`shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${value.trim() ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label={isEn ? `Clear ${placeholder}` : `${placeholder} leeren`}
        >
          <X size={12} />
        </button>
        <button
          type="button"
          onClick={open ? closeMenu : openMenu}
          className="shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label={isEn ? `Open ${placeholder}` : `${placeholder} öffnen`}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={closeMenu} />
          <div
            style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 9999, minWidth: rect.width }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="max-h-56 overflow-y-auto py-1">
              {emptyOptionLabel && (
                <>
                  <li
                    onMouseDown={(e) => { e.preventDefault(); onChange(EMPTY_SENTINEL); closeMenu(); }}
                    className={`px-3 py-1.5 text-xs cursor-pointer italic ${
                      isEmptySelected
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {emptyOptionLabel}
                  </li>
                  <li className="border-t border-gray-100 dark:border-gray-700 my-0.5" />
                </>
              )}
              {filtered.length > 0 ? (
                filtered.map((opt) => (
                  <li
                    key={opt}
                    onMouseDown={(e) => { e.preventDefault(); onChange(opt); closeMenu(); }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${
                      value === opt
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {displayMap?.[opt] ?? opt}
                  </li>
                ))
              ) : (
                <li className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">{isEn ? 'No matches' : 'Keine Treffer'}</li>
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default BatchComboControl;
