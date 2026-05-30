import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, X } from 'lucide-react';
import { TS_RANGE_PREFIX, TS_RANGE_SEP } from './stateListConstants';

export function parseTsFilter(raw: string): { mode: 'none' | 'text' | 'range'; text?: string; from?: number; to?: number } {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: 'none' };
  if (trimmed.startsWith(TS_RANGE_PREFIX)) {
    const payload = trimmed.slice(TS_RANGE_PREFIX.length);
    const [fromRaw = '', toRaw = ''] = payload.split(TS_RANGE_SEP);
    const from = fromRaw ? Date.parse(fromRaw) : NaN;
    const to = toRaw ? Date.parse(toRaw) : NaN;
    return {
      mode: 'range',
      from: Number.isFinite(from) ? from : undefined,
      to: Number.isFinite(to) ? to : undefined,
    };
  }
  return { mode: 'text', text: trimmed.toLowerCase() };
}

export function encodeTsRangeFilter(from: string, to: string): string {
  if (!from && !to) return '';
  return `${TS_RANGE_PREFIX}${from}${TS_RANGE_SEP}${to}`;
}

function TsRangeFilterControl({
  value,
  onChange,
  language = 'en',
}: {
  value: string;
  onChange: (value: string) => void;
  language?: 'en' | 'de';
}) {
  const isEn = language === 'en';
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const payload = value.startsWith(TS_RANGE_PREFIX) ? value.slice(TS_RANGE_PREFIX.length) : '';
  const [from = '', to = ''] = payload.split(TS_RANGE_SEP);
  const hasRange = !!from || !!to;

  function openMenu() {
    if (!anchorRef.current) return;
    setRect(anchorRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  const summary = hasRange
    ? `${from ? from.replace('T', ' ') : '…'} - ${to ? to.replace('T', ' ') : '…'}`
    : (isEn ? 'Filter…' : 'Filtern…');

  return (
    <>
      <div
        ref={anchorRef}
        className="h-7 px-2 text-xs font-normal rounded border border-gray-300 dark:border-gray-600 bg-gray-50/70 dark:bg-gray-800/70 focus-within:outline-none focus-within:ring-1 focus-within:ring-blue-400 transition-colors flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={open ? closeMenu : openMenu}
          className={`flex-1 min-w-0 text-left truncate ${hasRange ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}
          aria-label={isEn ? 'Open date filter' : 'Datumsfilter öffnen'}
        >
          {summary}
        </button>
        <CalendarDays size={12} className="shrink-0 text-gray-400 dark:text-gray-500" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }}
          className={`shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${hasRange ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-label={isEn ? 'Clear date filter' : 'Datumsfilter leeren'}
        >
          <X size={12} />
        </button>
      </div>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={closeMenu} />
          <div
            style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 9999, minWidth: Math.max(260, rect.width) }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg p-2"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'From' : 'Von'}</span>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => onChange(encodeTsRangeFilter(e.target.value, to))}
                  className="w-full bg-gray-50/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{isEn ? 'To' : 'Bis'}</span>
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => onChange(encodeTsRangeFilter(from, e.target.value))}
                  className="w-full bg-gray-50/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </label>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default TsRangeFilterControl;
