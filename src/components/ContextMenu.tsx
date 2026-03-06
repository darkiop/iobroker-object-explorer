import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | { separator: true };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      x: x + width > window.innerWidth  ? Math.max(0, x - width) : x,
      y: y + height > window.innerHeight ? Math.max(0, y - height) : y,
    });
  }, [x, y]);

  useEffect(() => {
    function onDown() { onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onScroll() { onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos?.y ?? y, left: pos?.x ?? x, zIndex: 9999, visibility: pos ? 'visible' : 'hidden' }}
      className="min-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 text-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={`sep-${i}`} className="my-1 border-t border-gray-200 dark:border-gray-700" />;
        }
        return (
          <button
            key={item.label}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
              item.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {item.icon && <span className="w-4 flex items-center justify-center shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
