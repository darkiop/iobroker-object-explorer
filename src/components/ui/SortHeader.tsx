import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { SortKey } from '../statelist/StateListColumns';

export type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, activeKey, dir, onSort, width, onResizeStart, onAutoFit, onHide, className }: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  width: number;
  onResizeStart: (e: React.MouseEvent, key: SortKey) => void;
  onAutoFit: (key: SortKey) => void;
  onHide?: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th
      data-col={sortKey}
      style={{ width, minWidth: 40 }}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`group/hdr relative px-3 py-2 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 overflow-hidden ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        <span className="truncate">{label}</span>
        {active && (dir === 'asc' ? <ArrowUp size={12} className="shrink-0" /> : <ArrowDown size={12} className="shrink-0" />)}
        {onHide && (
          <button
            className="ml-auto shrink-0 opacity-0 group-hover/hdr:opacity-100 transition-opacity text-gray-400 hover:text-red-400 dark:hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); onHide(sortKey); }}
            title="Hide column"
            tabIndex={-1}
          >
            <Minus size={10} />
          </button>
        )}
      </div>
      {/* Resize handle */}
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-col-resize z-20 flex items-center justify-center group/resize hover:bg-blue-500/10"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onResizeStart(e, sortKey);
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onAutoFit(sortKey); }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-px h-4 bg-gray-400 dark:bg-gray-500 group-hover/resize:bg-blue-500 group-hover/resize:h-full transition-all" />
      </div>
    </th>
  );
}

export default SortHeader;
