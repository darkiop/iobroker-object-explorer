import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import { useExtendObject } from '../../hooks/useStates';
import { useToast } from '../../context/ToastContext';

const EditableUnitCell = React.memo(function EditableUnitCell({ id, unit, suggestions, language = 'en' }: { id: string; unit: string; suggestions: string[]; language?: 'en' | 'de' }) {
  const isEn = language === 'en';
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extend = useExtendObject();
  const showToast = useToast();

  const filtered = filter
    ? suggestions.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
    : suggestions;

  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function openEdit() {
    if (cellRef.current) setCellRect(cellRef.current.getBoundingClientRect());
    setFilter('');
    setActiveIndex(-1);
    setEditing(true);
  }

  function close() { setEditing(false); setFilter(''); }

  function commit(val: string) {
    extend.mutate({ id, common: { unit: val } }, { onError: (err) => showToast((isEn ? 'Save failed: ' : 'Speichern fehlgeschlagen: ') + String(err)) });
    close();
  }

  return (
    <td
      ref={cellRef}
      data-col="unit"
      className="px-3 py-[var(--row-py)] text-gray-500 dark:text-gray-400 text-xs font-mono overflow-hidden group/unit"
      onClick={(e) => { e.stopPropagation(); openEdit(); }}
    >
      <div className="flex items-center gap-1.5">
        {unit && <span className="truncate min-w-0" title={unit}>{unit}</span>}
        <Pencil size={12} className="opacity-0 group-hover/unit:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 shrink-0 transition-opacity" />
      </div>
      {editing && cellRect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={close} />
          <div
            style={{ position: 'fixed', top: cellRect.bottom + 2, left: cellRect.left, zIndex: 9999, minWidth: Math.max(140, cellRect.width) }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-1.5 border-b border-gray-200 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setActiveIndex(-1); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, -1)); }
                  else if (e.key === 'Enter') {
                    if (activeIndex >= 0 && filtered[activeIndex]) commit(filtered[activeIndex]);
                    else if (filter.trim()) commit(filter.trim());
                    else close();
                  }
                  else if (e.key === 'Escape') close();
                }}
                placeholder={isEn ? 'Filter…' : 'Filtern…'}
                className="w-full bg-gray-50 dark:bg-gray-700 text-xs rounded px-2 py-1 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && filter.trim() && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(filter.trim()); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? `Use "${filter.trim()}"` : `„${filter.trim()}" verwenden`}
                </li>
              )}
              {unit && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); commit(''); }}
                  className="px-3 py-1.5 text-xs cursor-pointer text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 italic"
                >
                  {isEn ? '- empty -' : '— leer —'}
                </li>
              )}
              {filtered.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${
                    i === activeIndex
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body
      )}
    </td>
  );
});

export default EditableUnitCell;
